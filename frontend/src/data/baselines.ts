// Source: results/baselines.json (pipeline/run_baselines.py)
export interface BaselineEntry {
  key: "majority" | "random" | "bow_logistic" | "our_model";
  label: string;
  description: string;
  auc: number;
}

export const baselines: BaselineEntry[] = [
  { key: "majority",      label: "Majority class", description: "Predict success on every row.",                          auc: 0.500 },
  { key: "random",        label: "Random",         description: "Uniform random scores, mean over 20 seeds.",             auc: 0.498 },
  { key: "bow_logistic",  label: "BOW logistic",   description: "Bag-of-words on first prompt (1–2 grams, top 2k).",      auc: 0.782 },
  { key: "our_model",     label: "Our model",      description: "Structured prompt + repo + snapshot features.",          auc: 0.799 },
];

export const baselinesMeta = {
  n: 6413,
  cv: "5-fold stratified",
};
