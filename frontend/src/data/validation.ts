// Source: results/validation_kappa.json (pipeline/run_validation_kappa.py)

export interface ValidationResult {
  nTotalSampled: number;
  nLabeled: number;
  preliminary: boolean;
  kappa: number | null;
  agreementPct: number | null;
  disagreements: number | null;
  protocolPath: string;
}

export const validation: ValidationResult = {
  nTotalSampled: 200,
  nLabeled: 50,
  preliminary: false,
  kappa: 0.834,
  agreementPct: 92.0,
  disagreements: 4,
  protocolPath: "results/validation/manual_validation_protocol.md",
};
