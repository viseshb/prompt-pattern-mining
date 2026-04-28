# Results Auto-Draft

_Generated on 2026-04-13_

## Dataset and Labels
- Total conversations: 6,413
- Labeled conversations: 6,413 (100.00%)
- Unknown/ambiguous conversations excluded from primary model: 0
- Success rate among labeled conversations: 55.03%

## Primary Model Performance
- Cross-validated ROC-AUC: 0.799 (SD=0.009)
- Cross-validated accuracy: 0.726
- Cross-validated F1: 0.755

## Bivariate Evidence
- Features with Mann-Whitney p<0.05: 7
- See `table_bivariate_effects.csv` for rho, p-values, and Cliff's delta.

## Multivariable Effects (Logistic Regression)
- `source_type_file`: OR=0.103, p=3.413e-35
- `source_type_hn`: OR=0.063, p=1.407e-34
- `repo_language_OTHER`: OR=4.277, p=1.822e-27
- `repo_language_JavaScript`: OR=4.714, p=8.911e-21
- `source_type_issue`: OR=0.186, p=3.969e-17

## Reporting Guidance
- Keep model interpretation at odds-ratio level and avoid causal claims.
- Report both statistical significance and effect size magnitude.
- Pair these outputs with sensitivity and manual-label validation appendices.
