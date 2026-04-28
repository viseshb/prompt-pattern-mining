import { ModelMetrics } from '@/lib/types';
export const modelMetrics: ModelMetrics = {
  n_observations: 6413,
  n_success: 3529,
  n_failure: 2884,
  cross_validation: {
    n_splits: 5,
    roc_auc_mean: 0.799,
    roc_auc_std: 0.009,
    accuracy_mean: 0.726,
    f1_mean: 0.755,
  },
};
