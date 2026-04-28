export interface Coefficient {
  feature: string;
  coef_log_odds: number;
  odds_ratio: number;
  odds_ratio_ci_low: number | null;
  odds_ratio_ci_high: number | null;
  p_value: number | null;
}

export interface ModelMetrics {
  n_observations: number;
  n_success: number;
  n_failure: number;
  cross_validation: {
    n_splits: number;
    roc_auc_mean: number;
    roc_auc_std: number;
    accuracy_mean: number;
    f1_mean: number;
  };
}

export interface LanguageSubgroup {
  language: string;
  n_conversations: number;
  n_success: number;
  n_failure: number;
  roc_auc_mean: number;
  accuracy_mean: number;
  f1_mean: number;
}

export interface DescriptiveBySuccess {
  label: string;
  first_prompt_tokens_median: number;
  first_prompt_tokens_mean: number;
  first_constraint_count_median: number;
  first_constraint_count_mean: number;
  total_example_count_mean: number;
  iteration_count_median: number;
  iteration_count_mean: number;
  refinement_turns_mean: number;
  correction_cycles_mean: number;
}

export interface BivariateEffect {
  feature: string;
  spearman_rho: number;
  spearman_p: number;
  mannwhitney_p: number;
  cliffs_delta: number;
  success_median: number;
  failure_median: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
