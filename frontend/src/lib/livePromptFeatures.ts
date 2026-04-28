import { coefficients, featureLabels } from "@/data/coefficients";

export type PromptFeatureId =
  | "has_output_format_first"
  | "first_specification_clarity_count"
  | "first_constraint_count"
  | "total_example_count"
  | "has_role_instruction_first";

export type ResponseSignalKind =
  | "codeBlock"
  | "heading"
  | "numberedStep"
  | "bulletList"
  | "table"
  | "example"
  | "constraint";

export interface PromptSignal {
  feature: PromptFeatureId;
  label: string;
  oddsRatio: number;
  pValue: number | null;
  polarity: "positive" | "negative" | "neutral";
}

export interface PromptEvidence {
  hasOutputFormat: boolean;
  outputFormatHits: number;
  specificationClarityHits: number;
  constraintHits: number;
  exampleHits: number;
  roleInstructionHits: number;
  detectedSignals: PromptSignal[];
  strongestSignal: PromptSignal | null;
}

export interface ModelJudgment {
  qualityScore: 0 | 1 | 2 | 3 | 4;
  complexityScore: 0 | 1 | 2 | 3 | 4;
  overallScore: 1 | 2 | 3 | 4 | 5;
  excelsAt: string;
  missing: string[];
}

export interface ComparativeAnalysis {
  winner: string;
  winnerReason: string;
  ranking: string[];
  modelJudgments: Record<string, ModelJudgment>;
}

export interface ResponseStructure {
  codeBlocks: number;
  headings: number;
  numberedSteps: number;
  bulletLists: number;
  tables: number;
  examples: number;
  constraints: number;
  totalSignals: number;
  textChars: number;
  scoreAxes: {
    codePresent: boolean;
    addressesTask: boolean;
    reasoningVisible: boolean;
    followsStructure: boolean;
  };
  structureScore: 0 | 1 | 2 | 3 | 4;
  qualityScore: 0 | 1 | 2 | 3 | 4;
  complexityScore: 0 | 1 | 2 | 3 | 4;
  overallScore: 1 | 2 | 3 | 4 | 5;
  excelsAt: string;
  missing: string[];
  analysisSummary: string;
  newlyDetectedSignals: ResponseSignalKind[];
}

const PROMPT_PATTERNS = {
  constraints: /\b(must|should|need\s+to|required|do\s+not|don't|cannot|only|exactly|at\s+least|at\s+most|strictly|without)\b/gi,
  examples: /(for\s+example|for\s+instance|e\.g\.|example:|input:|output:|```[\s\S]*?```)/gi,
  roleInstructions: /^\s*(you\s+are|act\s+as|as\s+a)\b/gim,
  outputFormat: /\b(output\s+format|return\s+only|respond\s+with|json|markdown|table|bullet\s+list)\b/gi,
  specificationClarity:
    /\b(the\s+function\s+should|it\s+should\s+return|the\s+input\s+is|the\s+output\s+should|make\s+sure|ensure\s+that|given\s+a|takes?\s+as\s+input|returns?\s+a|accepts?\s+a|implement\s+a|create\s+a\s+function|write\s+a\s+function|build\s+a)\b/gi,
} as const;

const RESPONSE_PATTERNS = {
  codeFence: /^```/gm,
  headings: /^#{1,6}\s+/gm,
  numberedSteps: /^\d+\.\s+/gm,
  bulletLists: /^[*-]\s+/gm,
  tables: /^\|.*\|$/gm,
  examples: /(for\s+example|for\s+instance|e\.g\.|example:|input:|output:)/gi,
  constraints: /\b(must|should|need\s+to|required|do\s+not|don't|cannot|only|exactly|at\s+least|at\s+most|strictly|without)\b/gi,
} as const;

const PROMPT_SIGNAL_ORDER: Array<{
  feature: PromptFeatureId;
  countKey:
    | "outputFormatHits"
    | "specificationClarityHits"
    | "constraintHits"
    | "exampleHits"
    | "roleInstructionHits";
}> = [
  { feature: "has_output_format_first", countKey: "outputFormatHits" },
  { feature: "first_specification_clarity_count", countKey: "specificationClarityHits" },
  { feature: "first_constraint_count", countKey: "constraintHits" },
  { feature: "total_example_count", countKey: "exampleHits" },
  { feature: "has_role_instruction_first", countKey: "roleInstructionHits" },
];

const COEFFICIENT_BY_FEATURE = new Map(coefficients.map((entry) => [entry.feature, entry]));

function countMatches(pattern: RegExp, text: string): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function getPromptSignal(feature: PromptFeatureId): PromptSignal {
  const coefficient = COEFFICIENT_BY_FEATURE.get(feature);
  const oddsRatio = coefficient?.odds_ratio ?? 1;
  return {
    feature,
    label: featureLabels[feature] ?? feature,
    oddsRatio,
    pValue: coefficient?.p_value ?? null,
    polarity: oddsRatio > 1 ? "positive" : oddsRatio < 1 ? "negative" : "neutral",
  };
}

export function emptyResponseStructure(): ResponseStructure {
  return {
    codeBlocks: 0,
    headings: 0,
    numberedSteps: 0,
    bulletLists: 0,
    tables: 0,
    examples: 0,
    constraints: 0,
    totalSignals: 0,
    textChars: 0,
    scoreAxes: {
      codePresent: false,
      addressesTask: false,
      reasoningVisible: false,
      followsStructure: false,
    },
    structureScore: 0,
    qualityScore: 0,
    complexityScore: 0,
    overallScore: 1,
    excelsAt: "",
    missing: [],
    analysisSummary: "",
    newlyDetectedSignals: [],
  };
}

export function analyzePromptEvidence(promptBundle: string): PromptEvidence {
  const outputFormatHits = countMatches(PROMPT_PATTERNS.outputFormat, promptBundle);
  const specificationClarityHits = countMatches(PROMPT_PATTERNS.specificationClarity, promptBundle);
  const constraintHits = countMatches(PROMPT_PATTERNS.constraints, promptBundle);
  const exampleHits = countMatches(PROMPT_PATTERNS.examples, promptBundle);
  const roleInstructionHits = countMatches(PROMPT_PATTERNS.roleInstructions, promptBundle);

  const evidence: PromptEvidence = {
    hasOutputFormat: outputFormatHits > 0,
    outputFormatHits,
    specificationClarityHits,
    constraintHits,
    exampleHits,
    roleInstructionHits,
    detectedSignals: [],
    strongestSignal: null,
  };

  evidence.detectedSignals = PROMPT_SIGNAL_ORDER.filter(({ countKey }) => evidence[countKey] > 0).map(({ feature }) =>
    getPromptSignal(feature),
  );

  evidence.strongestSignal =
    evidence.detectedSignals.reduce<PromptSignal | null>((strongest, signal) => {
      const currentMagnitude = Math.abs(Math.log(signal.oddsRatio || 1));
      const strongestMagnitude = strongest ? Math.abs(Math.log(strongest.oddsRatio || 1)) : -1;
      return currentMagnitude > strongestMagnitude ? signal : strongest;
    }, null) ?? null;

  return evidence;
}

export function analyzeResponseStructure(text: string, prev: ResponseStructure = emptyResponseStructure()): ResponseStructure {
  const codeFenceCount = countMatches(RESPONSE_PATTERNS.codeFence, text);
  const codeBlocks = Math.floor(codeFenceCount / 2);
  const headings = countMatches(RESPONSE_PATTERNS.headings, text);
  const numberedSteps = countMatches(RESPONSE_PATTERNS.numberedSteps, text);
  const bulletLists = countMatches(RESPONSE_PATTERNS.bulletLists, text);
  const tables = countMatches(RESPONSE_PATTERNS.tables, text);
  const examples = countMatches(RESPONSE_PATTERNS.examples, text);
  const constraints = countMatches(RESPONSE_PATTERNS.constraints, text);
  const textChars = text.trim().length;

  const scoreAxes = {
    codePresent: codeBlocks >= 1,
    addressesTask: textChars >= 120,
    reasoningVisible: numberedSteps >= 1 || examples >= 1 || bulletLists >= 2,
    followsStructure: headings >= 1 || tables >= 1 || numberedSteps + bulletLists >= 2,
  };

  const structureScore = (Object.values(scoreAxes).filter(Boolean).length as 0 | 1 | 2 | 3 | 4);
  const totalSignals = codeBlocks + headings + numberedSteps + bulletLists + tables + examples + constraints;
  const newlyDetectedSignals: ResponseSignalKind[] = [];

  if (codeBlocks > 0 && prev.codeBlocks === 0) newlyDetectedSignals.push("codeBlock");
  if (headings > 0 && prev.headings === 0) newlyDetectedSignals.push("heading");
  if (numberedSteps > 0 && prev.numberedSteps === 0) newlyDetectedSignals.push("numberedStep");
  if (bulletLists > 0 && prev.bulletLists === 0) newlyDetectedSignals.push("bulletList");
  if (tables > 0 && prev.tables === 0) newlyDetectedSignals.push("table");
  if (examples > 0 && prev.examples === 0) newlyDetectedSignals.push("example");
  if (constraints > 0 && prev.constraints === 0) newlyDetectedSignals.push("constraint");

  return {
    codeBlocks,
    headings,
    numberedSteps,
    bulletLists,
    tables,
    examples,
    constraints,
    totalSignals,
    textChars,
    scoreAxes,
    structureScore,
    qualityScore: structureScore,
    complexityScore: structureScore,
    overallScore: Math.max(1, Math.min(5, structureScore + 1)) as 1 | 2 | 3 | 4 | 5,
    excelsAt: "",
    missing: [],
    analysisSummary: "",
    newlyDetectedSignals,
  };
}
