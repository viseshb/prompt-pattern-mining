// Source: results/ablation.json (pipeline/run_ablation.py)
export interface AblationEntry {
  group: string;
  nDropped: number;
  auc: number;
  delta: number;
}

export const ablation = {
  primaryAuc: 0.799,
  n: 6413,
  cv: "5-fold stratified",
  ablations: [
    { group: "Prompt-engineering features", nDropped: 11, auc: 0.756, delta: 0.043 },
    { group: "Source type",                 nDropped: 5,  auc: 0.782, delta: 0.016 },
    { group: "Repository language",         nDropped: 12, auc: 0.786, delta: 0.013 },
    { group: "ChatGPT model variant",       nDropped: 8,  auc: 0.794, delta: 0.005 },
    { group: "Snapshot date",               nDropped: 9,  auc: 0.798, delta: 0.001 },
  ] satisfies AblationEntry[],
};
