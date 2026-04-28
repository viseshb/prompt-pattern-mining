import { SYSTEM_PROMPTS } from "@/lib/constants";

export const runtime = "nodejs";

const ENC = new TextEncoder();
const DEC = new TextDecoder();

function parseAwsEventStream(buf: Uint8Array): { events: { headers: Record<string, string>; payload: Uint8Array }[]; remainder: Uint8Array } {
  const events: { headers: Record<string, string>; payload: Uint8Array }[] = [];
  let offset = 0;

  while (offset + 12 <= buf.length) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const totalLen = dv.getUint32(offset);
    if (offset + totalLen > buf.length) break;
    const headersLen = dv.getUint32(offset + 4);
    const prelude = 12;
    const messageEnd = offset + totalLen;
    const headerEnd = offset + prelude + headersLen;

    const headers: Record<string, string> = {};
    let hOff = offset + prelude;
    while (hOff < headerEnd) {
      const nameLen = buf[hOff];
      hOff += 1;
      const name = DEC.decode(buf.subarray(hOff, hOff + nameLen));
      hOff += nameLen;
      const valueType = buf[hOff];
      hOff += 1;
      if (valueType !== 7) break;
      const valueLen = dv.getUint16(hOff);
      hOff += 2;
      headers[name] = DEC.decode(buf.subarray(hOff, hOff + valueLen));
      hOff += valueLen;
    }

    events.push({ headers, payload: buf.subarray(headerEnd, messageEnd - 4) });
    offset = messageEnd;
  }

  return { events, remainder: buf.subarray(offset) };
}

export async function POST(request: Request) {
  const bearer = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (!bearer) {
    return new Response("AWS_BEARER_TOKEN_BEDROCK not configured. Add it to .env.local", { status: 500 });
  }

  const { mode, messages } = await request.json();

  if (!mode || !messages) {
    return new Response("Missing mode or messages", { status: 400 });
  }

  const systemPrompt = mode === "engineered" ? SYSTEM_PROMPTS.engineered : SYSTEM_PROMPTS.zero;

  const region = (process.env.AWS_REGION || "us-east-1").trim();
  const modelId = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke-with-response-stream`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
        Accept: "application/vnd.amazon.eventstream",
      },
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        system: systemPrompt,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(`Claude Haiku 4.5 API error: ${errorText}`, { status: response.status });
    }

    if (!response.body) {
      return new Response("Claude Haiku 4.5 returned an empty response body", { status: 502 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        let leftover: Uint8Array = new Uint8Array(0);

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;

            const merged: Uint8Array = new Uint8Array(leftover.byteLength + value.byteLength);
            merged.set(leftover, 0);
            merged.set(value, leftover.byteLength);

            const { events, remainder } = parseAwsEventStream(merged);
            leftover = remainder as Uint8Array;

            for (const event of events) {
              if (event.headers[":message-type"] !== "event") continue;
              try {
                const outer = JSON.parse(DEC.decode(event.payload));
                const inner = outer.bytes
                  ? JSON.parse(DEC.decode(Uint8Array.from(atob(outer.bytes), (char) => char.charCodeAt(0))))
                  : outer;

                if (inner.type === "content_block_delta") {
                  const delta = inner.delta?.text;
                  if (!delta) continue;

                  controller.enqueue(
                    ENC.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`),
                  );
                }
              } catch {
                // Skip malformed chunks and continue streaming the rest.
              }
            }
          }

          controller.enqueue(ENC.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return new Response(`Failed to connect to Claude Haiku 4.5: ${error}`, { status: 500 });
  }
}
