/**
 * Multi-vendor race endpoint.
 *
 * Body: { vendor: "kimi" | "claude" | "gemini", messages: [{role, content}] }
 * Always uses the ENGINEERED system prompt -- this endpoint is for the cross-model race demo.
 * Returns a unified plain-text streaming response (each chunk = next text fragment).
 */

import { SYSTEM_PROMPTS } from "@/lib/constants";

export const runtime = "nodejs";

interface Message {
  role: string;
  content: string;
}

const ENC = new TextEncoder();
const DEC = new TextDecoder();

function stream(generator: AsyncGenerator<string>): Response {
  const body = new ReadableStream({
    async pull(controller) {
      const { value, done } = await generator.next();
      if (done) controller.close();
      else controller.enqueue(ENC.encode(value));
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// ---------------------------------------------------------------------------
// Kimi via NVIDIA NIM (OpenAI SSE format)
// ---------------------------------------------------------------------------
async function* kimiStream(messages: Message[]): AsyncGenerator<string> {
  const apiKey = process.env.NVIDIA_API_KEY!;
  try {
    const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "moonshotai/kimi-k2-instruct",
        messages: [{ role: "system", content: SYSTEM_PROMPTS.engineered }, ...messages],
        stream: true,
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });

    if (!r.ok) {
      yield `[Kimi error ${r.status}: ${(await r.text()).slice(0, 200)}]`;
      return;
    }
    if (!r.body) {
      yield "[Kimi error: empty response body]";
      return;
    }

    const reader = r.body.getReader();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += DEC.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const j = JSON.parse(payload);
          const t = j.choices?.[0]?.delta?.content;
          if (t) yield t;
        } catch {
          // skip
        }
      }
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    yield `[Kimi network error: ${message}]`;
  }
}

// ---------------------------------------------------------------------------
// Claude Sonnet 4.6 via AWS Bedrock invoke-with-response-stream
// AWS event-stream format -- minimal binary parser inline.
// ---------------------------------------------------------------------------
function parseAwsEventStream(buf: Uint8Array): { events: { headers: Record<string, string>; payload: Uint8Array }[]; remainder: Uint8Array } {
  const events: { headers: Record<string, string>; payload: Uint8Array }[] = [];
  let offset = 0;

  while (offset + 12 <= buf.length) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const totalLen = dv.getUint32(offset);
    if (offset + totalLen > buf.length) break;
    const headersLen = dv.getUint32(offset + 4);
    const prelude = 12; // 4 totalLen + 4 headersLen + 4 prelude CRC
    const messageEnd = offset + totalLen;
    const headerEnd = offset + prelude + headersLen;

    // Parse headers
    const headers: Record<string, string> = {};
    let hOff = offset + prelude;
    while (hOff < headerEnd) {
      const nameLen = buf[hOff];
      hOff += 1;
      const name = DEC.decode(buf.subarray(hOff, hOff + nameLen));
      hOff += nameLen;
      const valueType = buf[hOff];
      hOff += 1;
      if (valueType === 7) {
        // string
        const valLen = dv.getUint16(hOff);
        hOff += 2;
        headers[name] = DEC.decode(buf.subarray(hOff, hOff + valLen));
        hOff += valLen;
      } else {
        // skip unknown
        break;
      }
    }

    const payload = buf.subarray(headerEnd, messageEnd - 4); // last 4 = msg CRC
    events.push({ headers, payload });
    offset = messageEnd;
  }

  return { events, remainder: buf.subarray(offset) };
}

async function* claudeStream(messages: Message[]): AsyncGenerator<string> {
  const bearer = process.env.AWS_BEARER_TOKEN_BEDROCK!;
  const region = (process.env.AWS_REGION || "us-east-1").trim();
  const modelId = "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke-with-response-stream`;

  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1500,
    temperature: 0.3,
    system: SYSTEM_PROMPTS.engineered,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.amazon.eventstream",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    yield `[Claude error ${r.status}: ${(await r.text()).slice(0, 200)}]`;
    return;
  }
  if (!r.body) return;

  const reader = r.body.getReader();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let leftover: any = new Uint8Array(0);

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    const v: any = value;
    const merged: any = new Uint8Array(leftover.byteLength + v.byteLength);
    merged.set(leftover, 0);
    merged.set(v, leftover.byteLength);
    const { events, remainder } = parseAwsEventStream(merged);
    leftover = remainder;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    for (const ev of events) {
      const type = ev.headers[":message-type"];
      if (type !== "event") continue;
      try {
        const text = DEC.decode(ev.payload);
        const j = JSON.parse(text);
        const inner = j.bytes
          ? JSON.parse(DEC.decode(Uint8Array.from(atob(j.bytes), (c) => c.charCodeAt(0))))
          : j;
        if (inner.type === "content_block_delta") {
          const t = inner.delta?.text;
          if (t) yield t;
        }
      } catch {
        // ignore parse errors per chunk
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Gemini 3.1 Pro Preview via Vertex AI Express Mode (streamGenerateContent SSE)
// ---------------------------------------------------------------------------
async function* geminiStream(messages: Message[]): AsyncGenerator<string> {
  const apiKey = process.env.CLOUD_RUN_API_KEY!;
  const model = process.env.GEMINI_VERTEX_MODEL || "gemini-3.1-pro-preview";

  // Vertex AI Express Mode — no project/region in URL.
  // Standard Vertex URL (with project/region) returns 404 for gemini-3.x in our project;
  // Express endpoint resolves the project from the API key + model availability.
  const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:streamGenerateContent?alt=sse`;

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = {
    contents,
    systemInstruction: { parts: [{ text: SYSTEM_PROMPTS.engineered }] },
    generationConfig: {
      maxOutputTokens: 2000,
      temperature: 0.3,
      // thinkingBudget: 0 disables thinking on gemini-3.x.
      // Pro burns hidden thinking tokens against maxOutputTokens, so demo replies
      // would truncate before any visible text. Off = full budget for output.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    yield `[Gemini error ${r.status}: ${(await r.text()).slice(0, 200)}]`;
    return;
  }
  if (!r.body) return;

  const reader = r.body.getReader();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += DEC.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      try {
        const j = JSON.parse(payload);
        const parts = j.candidates?.[0]?.content?.parts || [];
        for (const p of parts) {
          if (p.text) yield p.text;
        }
      } catch {
        // skip
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const { vendor, messages } = await req.json();
  if (!vendor || !messages) {
    return new Response("Missing vendor or messages", { status: 400 });
  }
  const gen =
    vendor === "kimi"
      ? kimiStream(messages)
      : vendor === "claude"
      ? claudeStream(messages)
      : vendor === "gemini"
      ? geminiStream(messages)
      : null;

  if (!gen) return new Response(`Unknown vendor ${vendor}`, { status: 400 });
  return stream(gen);
}
