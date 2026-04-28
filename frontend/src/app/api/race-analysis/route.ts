import { type ComparativeAnalysis, type ModelJudgment, type ResponseSignalKind, type ResponseStructure } from "@/lib/livePromptFeatures";

export const runtime = "nodejs";

const DEC = new TextDecoder();

const VALID_SIGNAL_KINDS: ResponseSignalKind[] = [
  "codeBlock",
  "heading",
  "numberedStep",
  "bulletList",
  "table",
  "example",
  "constraint",
];

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

function extractJsonObject(text: string): string {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Haiku analysis did not return a JSON object");
  }
  return trimmed.slice(firstBrace, lastBrace + 1);
}

function toNonNegativeInt(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num);
}

function toBool(value: unknown): boolean {
  return value === true;
}

function toScore(value: unknown): 0 | 1 | 2 | 3 | 4 {
  return Math.max(0, Math.min(4, toNonNegativeInt(value))) as 0 | 1 | 2 | 3 | 4;
}

function toOverallScore(value: unknown): 1 | 2 | 3 | 4 | 5 {
  return Math.max(1, Math.min(5, toNonNegativeInt(value))) as 1 | 2 | 3 | 4 | 5;
}

function stripMathDelimiters(text: string): string {
  return text.replace(/\$([^$\n]+)\$/g, "$1").replace(/\s+/g, " ").trim();
}

function toShortText(value: unknown): string {
  return typeof value === "string" ? stripMathDelimiters(value).slice(0, 180) : "";
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map(stripMathDelimiters).filter(Boolean).slice(0, 4);
}

function countMatches(text: string, pattern: RegExp): number {
  return Array.from(text.matchAll(pattern)).length;
}

function countCodeBlocks(text: string): number {
  return Math.floor(countMatches(text, /```/g) / 2);
}

function countHeadings(text: string): number {
  return countMatches(text, /^[ \t]{0,3}#{1,6}\s+/gm);
}

function countNumberedSteps(text: string): number {
  return countMatches(text, /^[ \t]*\d+\.\s+/gm);
}

function countBulletLists(text: string): number {
  return countMatches(text, /^[ \t]*[-*+]\s+/gm);
}

function countTables(text: string): number {
  return countMatches(text, /^\|.*\|$/gm) > 0 ? 1 : 0;
}

function countExamples(text: string): number {
  return countMatches(text, /\b(for example|e\.g\.|example|input:|output:)\b/gi);
}

function countConstraints(text: string): number {
  return countMatches(text, /\b(constraint|constraints|must|required|thread-safe|o\([^)]+\))\b/gi);
}

function buildDeterministicAnalysis(text: string): ResponseStructure {
  const codeBlocks = countCodeBlocks(text);
  const headings = countHeadings(text);
  const numberedSteps = countNumberedSteps(text);
  const bulletLists = countBulletLists(text);
  const tables = countTables(text);
  const examples = countExamples(text);
  const constraints = countConstraints(text);
  const textChars = text.trim().length;
  const scoreAxes = {
    codePresent: codeBlocks >= 1,
    addressesTask: textChars >= 120,
    reasoningVisible: numberedSteps >= 1 || examples >= 1 || bulletLists >= 2,
    followsStructure: headings >= 1 || tables >= 1 || numberedSteps + bulletLists >= 2,
  };
  const structureScore = [scoreAxes.codePresent, scoreAxes.addressesTask, scoreAxes.reasoningVisible, scoreAxes.followsStructure].filter(Boolean).length as 0 | 1 | 2 | 3 | 4;
  const qualityScore = structureScore;
  const complexityScore = Math.min(4, Number(codeBlocks > 0) + Number(numberedSteps > 0) + Number(constraints > 0) + Number(examples > 0 || tables > 0)) as 0 | 1 | 2 | 3 | 4;

  return {
    codeBlocks,
    headings,
    numberedSteps,
    bulletLists,
    tables,
    examples,
    constraints,
    totalSignals: codeBlocks + headings + numberedSteps + bulletLists + tables + examples + constraints,
    textChars,
    scoreAxes,
    structureScore,
    qualityScore,
    complexityScore,
    overallScore: Math.max(1, Math.min(5, structureScore + 1)) as 1 | 2 | 3 | 4 | 5,
    excelsAt: "",
    missing: [],
    analysisSummary: "Fallback analysis used structural signals from the final output.",
    newlyDetectedSignals: VALID_SIGNAL_KINDS.filter((kind) => {
      switch (kind) {
        case "codeBlock":
          return codeBlocks > 0;
        case "heading":
          return headings > 0;
        case "numberedStep":
          return numberedSteps > 0;
        case "bulletList":
          return bulletLists > 0;
        case "table":
          return tables > 0;
        case "example":
          return examples > 0;
        case "constraint":
          return constraints > 0;
      }
    }),
  };
}

function buildModelJudgment(parsed: Record<string, unknown>, fallbackScore: number): ModelJudgment {
  const qualityScore = parsed.qualityScore == null ? (fallbackScore as 0 | 1 | 2 | 3 | 4) : toScore(parsed.qualityScore);
  const complexityScore = toScore(parsed.complexityScore);
  return {
    qualityScore,
    complexityScore,
    overallScore: parsed.overallScore == null ? Math.max(1, Math.min(5, Math.round((qualityScore + complexityScore) / 2) + 1)) as 1 | 2 | 3 | 4 | 5 : toOverallScore(parsed.overallScore),
    excelsAt: toShortText(parsed.excelsAt),
    missing: toStringList(parsed.missing),
  };
}

async function analyzeWithHaiku(text: string): Promise<ResponseStructure> {
  const bearer = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (!bearer) {
    throw new Error("AWS_BEARER_TOKEN_BEDROCK not configured");
  }

  const region = (process.env.AWS_REGION || "us-east-1").trim();
  const modelId = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke-with-response-stream`;

  const schemaPrompt = `
You analyze one model answer and return ONLY valid JSON.

Required JSON schema:
{
  "codeBlocks": number,
  "headings": number,
  "numberedSteps": number,
  "bulletLists": number,
  "tables": number,
  "examples": number,
  "constraints": number,
  "scoreAxes": {
    "codePresent": boolean,
    "addressesTask": boolean,
    "reasoningVisible": boolean,
    "followsStructure": boolean
  },
  "structureScore": number,
  "qualityScore": number,
  "complexityScore": number,
  "analysisSummary": string,
  "detectedSignals": ["codeBlock" | "heading" | "numberedStep" | "bulletList" | "table" | "example" | "constraint"]
}

Rules:
- Count only what is visibly present in the answer text.
- Use 0 when a category is absent.
- detectedSignals must include only categories that are actually present.
- structureScore must be an integer from 0 to 4.
- qualityScore is the overall coding-answer quality from 0 to 4.
- complexityScore is how clearly the answer explains time/space complexity and tradeoffs from 0 to 4.
- analysisSummary is one short sentence explaining the main strength or weakness.
- Return raw JSON only, with no markdown fences or extra commentary.
`.trim();

  const requestBody = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 800,
    temperature: 0,
    system: schemaPrompt,
    messages: [
      {
        role: "user",
        content: `Analyze this model output and return only the JSON object.\n\nMODEL OUTPUT:\n${text}`,
      },
    ],
  };

  let response: globalThis.Response | null = null;
  let responseError = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.amazon.eventstream",
      },
      body: JSON.stringify(requestBody),
    });

    if (response.ok) break;
    responseError = `Haiku analysis error ${response.status}: ${(await response.text()).slice(0, 300)}`;
    if (attempt === 0 && response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      continue;
    }
    throw new Error(responseError);
  }

  if (!response || !response.ok) {
    throw new Error(responseError || "Haiku analysis failed");
  }
  if (!response.body) {
    throw new Error("Haiku analysis returned an empty response body");
  }

  const reader = response.body.getReader();
  let leftover = new Uint8Array(0);
  let rawText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;

    const merged = new Uint8Array(leftover.byteLength + value.byteLength);
    merged.set(leftover, 0);
    merged.set(value, leftover.byteLength);
    const { events, remainder } = parseAwsEventStream(merged);
    leftover = new Uint8Array(remainder);

    for (const event of events) {
      if (event.headers[":message-type"] !== "event") continue;
      try {
        const outer = JSON.parse(DEC.decode(event.payload));
        const inner = outer.bytes
          ? JSON.parse(Buffer.from(outer.bytes, "base64").toString("utf-8"))
          : outer;
        if (inner.type === "content_block_delta") {
          const delta = inner.delta?.text;
          if (delta) rawText += delta;
        }
      } catch {
        // Ignore malformed chunks and keep collecting.
      }
    }
  }

  const parsed = JSON.parse(extractJsonObject(rawText)) as Record<string, unknown>;
  const codeBlocks = Math.max(toNonNegativeInt(parsed.codeBlocks), countCodeBlocks(text));
  const headings = Math.max(toNonNegativeInt(parsed.headings), countHeadings(text));
  const numberedSteps = Math.max(toNonNegativeInt(parsed.numberedSteps), countNumberedSteps(text));
  const bulletLists = Math.max(toNonNegativeInt(parsed.bulletLists), countBulletLists(text));
  const tables = Math.max(toNonNegativeInt(parsed.tables), countTables(text));
  const examples = Math.max(toNonNegativeInt(parsed.examples), countExamples(text));
  const constraints = Math.max(toNonNegativeInt(parsed.constraints), countConstraints(text));
  const detectedSignals = Array.isArray(parsed.detectedSignals)
    ? parsed.detectedSignals.filter((value): value is ResponseSignalKind => typeof value === "string" && VALID_SIGNAL_KINDS.includes(value as ResponseSignalKind))
    : [];
  const derivedSignals: ResponseSignalKind[] = [
    ...(codeBlocks > 0 ? ["codeBlock" as const] : []),
    ...(headings > 0 ? ["heading" as const] : []),
    ...(numberedSteps > 0 ? ["numberedStep" as const] : []),
    ...(bulletLists > 0 ? ["bulletList" as const] : []),
    ...(tables > 0 ? ["table" as const] : []),
    ...(examples > 0 ? ["example" as const] : []),
    ...(constraints > 0 ? ["constraint" as const] : []),
  ];
  const uniqueDetectedSignals = VALID_SIGNAL_KINDS.filter((kind) => detectedSignals.includes(kind) || derivedSignals.includes(kind));

  const textChars = text.trim().length;
  const scoreAxes = {
    codePresent: codeBlocks >= 1,
    addressesTask: textChars >= 120,
    reasoningVisible: numberedSteps >= 1 || examples >= 1 || bulletLists >= 2,
    followsStructure: headings >= 1 || tables >= 1 || numberedSteps + bulletLists >= 2,
  };

  const derivedScore = [scoreAxes.codePresent, scoreAxes.addressesTask, scoreAxes.reasoningVisible, scoreAxes.followsStructure].filter(Boolean).length as 0 | 1 | 2 | 3 | 4;
  const structureScore = derivedScore;
  const qualityScore = parsed.qualityScore == null ? structureScore : toScore(parsed.qualityScore);
  const complexityScore = toScore(parsed.complexityScore);
  const modelJudgment = buildModelJudgment(parsed, structureScore);

  return {
    codeBlocks,
    headings,
    numberedSteps,
    bulletLists,
    tables,
    examples,
    constraints,
    totalSignals: codeBlocks + headings + numberedSteps + bulletLists + tables + examples + constraints,
    textChars,
    scoreAxes,
    structureScore,
    qualityScore,
    complexityScore,
    overallScore: modelJudgment.overallScore,
    excelsAt: modelJudgment.excelsAt,
    missing: modelJudgment.missing,
    analysisSummary: toShortText(parsed.analysisSummary),
    newlyDetectedSignals: uniqueDetectedSignals,
  };
}

async function analyzeComparisonWithHaiku(outputs: Record<string, string>, metrics: Record<string, unknown>): Promise<ComparativeAnalysis> {
  const bearer = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (!bearer) throw new Error("AWS_BEARER_TOKEN_BEDROCK not configured");

  const region = (process.env.AWS_REGION || "us-east-1").trim();
  const modelId = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke-with-response-stream`;
  const vendors = Object.keys(outputs);
  const schemaPrompt = `
You are a strict, fair judge for a research demo. Compare three coding answers produced by three different
LLMs from the SAME engineered system prompt and the SAME user request. Return ONLY valid JSON.

REQUIRED JSON SCHEMA:
{
  "winner": "kimi" | "claude" | "gemini",
  "winnerReason": string,
  "ranking": string[],
  "modelJudgments": {
    "kimi":   { "qualityScore": number, "complexityScore": number, "overallScore": number, "excelsAt": string, "missing": string[] },
    "claude": { "qualityScore": number, "complexityScore": number, "overallScore": number, "excelsAt": string, "missing": string[] },
    "gemini": { "qualityScore": number, "complexityScore": number, "overallScore": number, "excelsAt": string, "missing": string[] }
  }
}

================================================================
PRE-SCORING CORRECTNESS CHECKLIST (apply to EACH answer before scoring)
================================================================

Walk through the following for every answer. Each failed check should
lower qualityScore and surface in "missing":

1. RUNNABILITY: Would this code compile / run as written? Watch for
   syntax errors, undeclared variables, missing imports, unmatched
   braces, off-by-one indexing.

2. CORRECTNESS ON THE STATED PROBLEM: Does the algorithm actually solve
   the user's request? For example, a "sort" that returns the input
   unchanged fails. A "longest palindromic substring" that returns ANY
   palindrome fails.

3. EDGE CASES: Does the code handle empty input, single element, all
   equal elements, duplicates, negative values, very large input
   (where applicable)? Missing edge-case handling lowers qualityScore.

4. ALGORITHMIC OPTIMALITY: Is the chosen algorithm the best-known for
   this problem class? Brute force when an optimal exists is a defect.
   E.g. O(n²) sort when O(n log n) was asked for.

5. NAMING & READABILITY: Are variables and functions named to convey
   intent? Is the code idiomatic for its language?

6. WORKED EXAMPLE / TEST: Does the answer demonstrate the function on
   the user's stated input? An "if __name__ == '__main__'" driver, a
   doctest, or an inline call counts.

7. COMPLEXITY JUSTIFICATION: Are time AND space complexity stated AND
   briefly justified (not just asserted)?

8. SAFETY / SIDE EFFECTS: Does the code avoid unsafe patterns
   (eval, raw shell concatenation, unbounded recursion on user input)?

================================================================
SCORING RUBRIC — APPLY THESE STRICTLY
================================================================

qualityScore (0-4): correctness + runnability + edge cases + optimality + style.
  0 = no code, doesn't compile, or fundamentally wrong algorithm
  1 = compiles but has bugs OR uses a clearly suboptimal algorithm
  2 = solves the happy path; misses edge cases or lacks worked example
  3 = correct, runnable, idiomatic, handles main cases, names are clear
  4 = production-grade: correct, optimal algorithm choice, edge cases handled,
      idiomatic, with worked example and clean naming

complexityScore (0-4): how thoroughly the answer covers algorithmic analysis.
  0 = no Big-O at all
  1 = mentions Big-O once without explanation
  2 = states time AND space complexity explicitly
  3 = states T/S complexity AND justifies why (one or two sentences)
  4 = compares >=2 algorithmic approaches with tradeoffs

overallScore (1-5): the OVERALL VALUE the answer delivers, considering:
   * raw quality + correctness (qualityScore)
   * algorithmic depth (complexityScore)
   * structure (headings, code blocks, examples, tests)
   * efficiency (output tokens used, cost, time taken — see METRICS)

  1 = poor; barely usable, broken, or wrong
  2 = weak; missing major pieces or has correctness gaps
  3 = acceptable; solves the problem with some gaps
  4 = strong; high quality with minor tradeoffs
  5 = best-in-class — top quality across every axis (correctness, depth, structure, efficiency)

================================================================
ANTI-TIE / DIFFERENTIATION RULES
================================================================
- The three answers WILL differ. Find the differences and score accordingly.
- DO NOT give all three the same overallScore. If two truly tie on quality+depth, break the tie using cost
  or speed (the answer that delivered equivalent content with fewer tokens / lower cost / faster time
  must score strictly higher).
- If one answer clearly produces stronger code, more thorough complexity analysis, OR better structure,
  it MUST score higher than the others.
- A long, "comprehensive" answer is NOT automatically better than a concise one. Penalize verbosity that
  does not add information. Reward conciseness that delivers the same content for fewer tokens.

================================================================
WINNER PICKING
================================================================
- "winner" = the model with the BEST overall VALUE tradeoff. Not always the highest qualityScore — a model
  that hits equivalent quality at much lower cost is the winner.
- "winner" MUST have the highest overallScore. If two models tie on overallScore, pick the cheaper one.
- "ranking" lists best to worst.
- "winnerReason" is ONE concrete sentence naming the specific tradeoff
  (e.g. "Kimi delivers production-grade code with full Big-O justification at 1/8 the cost of Claude").
  Avoid generic praise.

================================================================
PROS ("excelsAt") AND CONS ("missing")
================================================================
- "excelsAt" (Pros): ONE concrete strength of THIS specific answer.
  Concrete examples: "Explicit O(n)/O(1) analysis with two-pointer justification",
                     "Concise idiomatic Python using slicing with a worked example".
  Avoid generic praise like "well written" or "good code".
  ALLOWED to mention low cost or fast time when that is genuinely a strength.

- "missing" (Cons): list 1-3 concrete weaknesses of THIS specific answer.
  Always cite a specific defect from the PRE-SCORING CHECKLIST when present:
    * runnability (e.g. "Variable 'mid' used before assignment in loop")
    * correctness (e.g. "Returns first palindrome found, not longest")
    * edge cases (e.g. "Crashes on empty input", "Does not handle duplicates")
    * algorithmic optimality (e.g. "Brute force O(n^2) when expand-around-center O(n^2) with O(1) space exists" or "Recursion depth proportional to n risks stack overflow on large input")
    * complexity gaps (e.g. "States time complexity but not space")
    * missing test/example (e.g. "No worked driver showing the function on the user's input")
    * verbosity (e.g. "513 tokens for content Kimi delivered in 280")
  ALLOWED to mention high cost or slow time RELATIVE TO the cheaper/faster answers.
  If a model is significantly more expensive (>= 3x cheapest) for equivalent quality, ALWAYS include cost
  as a con (e.g. "9x more expensive than kimi for the same quality").
  If a model is significantly slower (>= 1.5x fastest), ALWAYS include speed as a con.
  Empty array ONLY when the answer passes EVERY pre-scoring checklist item AND is cost/speed-competitive.

================================================================
NARRATIVE SCORE PHRASING (CRITICAL)
================================================================
- Inside "winnerReason", "excelsAt", and "missing" strings, NEVER write "/4" or "score 3/4" or any
  /4 denominator. The user-visible scale is 1-5; if you must reference a score, use that scale ("5/5").
- Better: avoid numeric scores in narrative entirely. Describe qualitatively.

Return raw JSON only. No markdown fences. No prose before or after.
`.trim();

  const requestBody = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 2500,
    temperature: 0,
    system: schemaPrompt,
    messages: [
      {
        role: "user",
        content: `METRICS:\n${JSON.stringify(metrics, null, 2)}\n\nOUTPUTS:\n${JSON.stringify(outputs, null, 2)}`,
      },
    ],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.amazon.eventstream",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) throw new Error(`Comparison analysis error ${response.status}: ${(await response.text()).slice(0, 300)}`);
  if (!response.body) throw new Error("Comparison analysis returned an empty response body");

  const reader = response.body.getReader();
  let leftover = new Uint8Array(0);
  let rawText = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    const merged = new Uint8Array(leftover.byteLength + value.byteLength);
    merged.set(leftover, 0);
    merged.set(value, leftover.byteLength);
    const { events, remainder } = parseAwsEventStream(merged);
    leftover = new Uint8Array(remainder);
    for (const event of events) {
      if (event.headers[":message-type"] !== "event") continue;
      try {
        const outer = JSON.parse(DEC.decode(event.payload));
        const inner = outer.bytes ? JSON.parse(Buffer.from(outer.bytes, "base64").toString("utf-8")) : outer;
        if (inner.type === "content_block_delta" && inner.delta?.text) rawText += inner.delta.text;
      } catch {}
    }
  }

  const parsed = JSON.parse(extractJsonObject(rawText)) as Record<string, unknown>;
  const judgmentsRaw = (parsed.modelJudgments ?? {}) as Record<string, Record<string, unknown>>;
  const modelJudgments = Object.fromEntries(
    vendors.map((vendor) => [vendor, buildModelJudgment(judgmentsRaw[vendor] ?? {}, 0)]),
  ) as Record<string, ModelJudgment>;
  const ranking = toStringList(parsed.ranking).filter((vendor) => vendors.includes(vendor));
  const fallbackRanking = vendors.sort((a, b) => modelJudgments[b].overallScore - modelJudgments[a].overallScore);

  return {
    winner: vendors.includes(String(parsed.winner)) ? String(parsed.winner) : fallbackRanking[0],
    winnerReason: toShortText(parsed.winnerReason),
    ranking: ranking.length === vendors.length ? ranking : fallbackRanking,
    modelJudgments,
  };
}

export async function POST(request: Request) {
  let text = "";
  try {
    const body = await request.json();
    if (body?.mode === "comparison" && body.outputs && typeof body.outputs === "object") {
      return Response.json(await analyzeComparisonWithHaiku(body.outputs, body.metrics ?? {}));
    }
    text = typeof body?.text === "string" ? body.text : "";
    if (typeof text !== "string" || !text.trim()) {
      return Response.json({ error: "Missing text" }, { status: 400 });
    }

    const analysis = await analyzeWithHaiku(text);
    return Response.json(analysis);
  } catch (error) {
    if (text.trim()) {
      return Response.json(buildDeterministicAnalysis(text));
    }
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
