import { Coefficient } from '@/lib/types';
export const coefficients: Coefficient[] = [
  { feature: "has_output_format_first", coef_log_odds: 0.561, odds_ratio: 1.752, odds_ratio_ci_low: 1.400, odds_ratio_ci_high: 2.193, p_value: 0.0000009 },
  { feature: "first_specification_clarity_count", coef_log_odds: 0.387, odds_ratio: 1.473, odds_ratio_ci_low: 0.972, odds_ratio_ci_high: 2.233, p_value: 0.068 },
  { feature: "refinement_turns", coef_log_odds: 0.172, odds_ratio: 1.188, odds_ratio_ci_low: 1.112, odds_ratio_ci_high: 1.269, p_value: 0.0000003 },
  { feature: "total_example_count", coef_log_odds: 0.004, odds_ratio: 1.004, odds_ratio_ci_low: 0.985, odds_ratio_ci_high: 1.023, p_value: 0.667 },
  { feature: "iteration_count", coef_log_odds: 0.004, odds_ratio: 1.004, odds_ratio_ci_low: 0.997, odds_ratio_ci_high: 1.011, p_value: 0.294 },
  { feature: "first_prompt_tokens", coef_log_odds: -0.0005, odds_ratio: 1.000, odds_ratio_ci_low: 0.999, odds_ratio_ci_high: 1.000, p_value: 0.0007 },
  { feature: "prompt_token_growth", coef_log_odds: -0.0005, odds_ratio: 1.000, odds_ratio_ci_low: 0.999, odds_ratio_ci_high: 1.000, p_value: 0.00006 },
  { feature: "first_constraint_count", coef_log_odds: -0.059, odds_ratio: 0.942, odds_ratio_ci_low: 0.912, odds_ratio_ci_high: 0.974, p_value: 0.0004 },
  { feature: "has_specification_clarity_first", coef_log_odds: -0.074, odds_ratio: 0.929, odds_ratio_ci_low: 0.538, odds_ratio_ci_high: 1.602, p_value: 0.790 },
  { feature: "has_role_instruction_first", coef_log_odds: -0.429, odds_ratio: 0.651, odds_ratio_ci_low: 0.498, odds_ratio_ci_high: 0.851, p_value: 0.002 },
  { feature: "correction_cycles", coef_log_odds: -19.584, odds_ratio: 0.000, odds_ratio_ci_low: null, odds_ratio_ci_high: null, p_value: 0.971 },
];

// Short single-line labels for chart Y-axis
export const featureLabels: Record<string, string> = {
  has_output_format_first: "Output Format",
  first_specification_clarity_count: "Spec Clarity",
  refinement_turns: "Refinement Turns",
  total_example_count: "Examples",
  iteration_count: "Iterations",
  first_prompt_tokens: "Prompt Length",
  prompt_token_growth: "Token Growth",
  first_constraint_count: "Constraints",
  has_specification_clarity_first: "Spec Clarity (bin)",
  has_role_instruction_first: "Role Instructions",
  correction_cycles: "Correction Cycles",
};
