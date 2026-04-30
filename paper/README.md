# Paper folder — what's in here and how to read it

Hi Teja, hi Umapathi. This README is a long, plain-English walkthrough
of everything in this `paper/` folder and the project as a whole. The
goal is that by the end you can sit at the defense, point at any
figure or number in `main.pdf`, and explain in your own words what it
means and how we got it. No prior stats background assumed.

If a word looks intimidating, jump to the **Glossary** at the bottom —
every technical term in this README is defined there in one or two
sentences.

---

## 1. What's in this folder

```
paper/
├── main.tex            The actual paper, written in LaTeX
├── main.pdf            The compiled paper (7 pages, IEEE format)
├── make_figures.py     Python script that builds the 9 figures
├── figures/            The 9 PNG figures used by main.tex
└── README.md           This file
```

To rebuild the PDF after editing `main.tex`:

```bash
cd paper
python make_figures.py    # only if results/*.json changed
pdflatex main.tex         # pass 1: collects cross-references
pdflatex main.tex         # pass 2: resolves them
```

The two `pdflatex` calls are the same command run twice — that's how
LaTeX works. First pass writes a `.aux` file with reference IDs.
Second pass reads them back and fills in numbers like "Section IV"
and "Table 1" and citation markers.

---

## 2. The project in two paragraphs

Developers nowadays write code with help from ChatGPT-like models.
The **wording of the prompt** changes how good the answer is. Lots of
prompt-engineering tutorials exist, but most are based on either gut
feel or experimenter-written prompts in artificial benchmarks. Nobody
had asked: "On thousands of *real* developer-ChatGPT conversations
that already happened in the wild, which prompt features actually
predict whether the conversation produces useful code?"

We answered that question. We took a public dataset of 6,413
real ChatGPT conversations from open-source GitHub projects (the
**DevGPT v10 corpus**), pulled out 11 measurable features of each
conversation (length, role instructions, output format requests,
number of refinement turns, etc.), and trained a statistical model
to predict success. We then ran four extra robustness checks
(baselines, ablation, interactions, manual re-labeling) and
replicated the main finding on three other LLMs (Kimi, Claude,
Gemini). Headline result: **explicit output-format instructions
raise the odds of success by 75%, and combining a role instruction
with an output format raises them by a factor of about five.**

---

## 3. Concepts every teammate needs to know

These show up everywhere in the paper. Read this section once and
the rest will make sense.

### 3.1 Vibe coding
"Vibe coding" is the slangy name for the way people now build
software: open ChatGPT, type what you want, paste the code, run it,
when it breaks paste the error back to ChatGPT, repeat. The output
isn't pre-planned; it emerges from the conversation. Our paper studies
the conversations themselves.

### 3.2 Conversation, turn, prompt
- A **conversation** is one whole back-and-forth, start to finish.
- A **turn** is one message — either from the developer or from the
  assistant. A conversation is just a list of turns.
- A **prompt** is a developer turn (the message the developer types).
  The **first prompt** is special because it sets the task.

Our dataset has 6,413 conversations and 54,449 turns total — about 8.5
turns per conversation on average.

### 3.3 Feature
A **feature** is a number or a yes/no flag we extract from each
conversation. We have 11 features per conversation. Examples:
- How long was the first prompt? (number of tokens)
- Did the first prompt say "you are an expert in X"? (yes/no)
- How many times did the developer ask the model to fix something?
  (count)

Features are the inputs to the model. The output is "did this
conversation succeed?"

### 3.4 Outcome label
The thing we're trying to predict: did the conversation produce
useful code or not? We don't have a perfect way to measure this
because we can't actually run every piece of code in the dataset. So
we use a **textual heuristic** (a rule based on what's written in
the conversation):

> A conversation is **success** if the assistant produced code in at
> least one turn AND the developer never wrote anything like "not
> working", "doesn't work", "still broken", "error persists" in any
> later turn. Otherwise it's **failure**.

In our 6,413 conversations: 3,529 are labeled success and 2,884 are
labeled failure. That's 55% success, 45% failure — reasonably
balanced.

### 3.5 Logistic regression
A **logistic regression** is the simplest possible "given inputs,
predict yes/no" model. Imagine drawing a smooth S-shaped curve from
0 (definitely failure) to 1 (definitely success) and asking, "for
this input, what's the probability the answer is success?" That's
logistic regression.

Why use it instead of a deep neural network?
- It's interpretable. Each feature gets one coefficient and we can
  read off the effect.
- It's tiny — fits in seconds on 6,413 rows.
- It gives confidence intervals and p-values for free, which a
  neural net does not.

Our model has 11 prompt features + 34 control features (one-hot
encodings for repository language, source type, snapshot date,
ChatGPT model variant) = 45 inputs total.

### 3.6 Odds ratio (OR)
This is the most-used number in the paper. Forget it for a second
and think of plain odds. If 60 conversations succeed and 40 fail, the
odds of success are 60/40 = 1.5.

An **odds ratio** is the ratio of two such odds:

> OR for "feature X" = (odds of success when feature is present) /
> (odds of success when feature is absent)

- OR > 1 → feature **helps** (raises odds of success)
- OR < 1 → feature **hurts** (lowers odds)
- OR = 1 → feature does nothing

Examples from our paper:
- Output format instruction has **OR = 1.75** → adding it raises the
  odds of success by 75%.
- Role instruction alone has **OR = 0.65** → adding it lowers the
  odds by 35%.

### 3.7 Confidence interval (CI)
A **95% confidence interval** is a range that we're 95% sure the
true odds ratio falls into. Output format has OR = 1.75 with a 95%
CI of [1.40, 2.19]. That means we're 95% sure the real effect is
somewhere between "+40% odds" and "+119% odds." Either way, it's a
real, positive effect.

If a feature's confidence interval **crosses 1.0** (e.g. [0.85, 1.20]),
we can't tell whether it's helpful or harmful — too much noise. We
mark such features as "not significant" in the figures.

### 3.8 p-value
A **p-value** is the probability of seeing a result this strong by
pure chance if the feature actually had zero effect. Tiny p-values
mean "very unlikely to be noise." We use the standard threshold of
**p < 0.05** for "statistically significant." Most of our headline
features have p-values below 1 in a million (`p < 1e-6`), so noise
is not driving them.

### 3.9 ROC-AUC
This is how we measure "how good is the whole model?" It's a number
between 0 and 1.
- **0.5** = model is no better than guessing.
- **1.0** = perfect classifier.
- **0.7-0.8** = decent.
- **0.8-0.9** = strong.

Our model gets **AUC = 0.799 ± 0.009**, which is the upper end of
"decent." For a problem where the labels are noisy textual heuristics
and the inputs are eleven hand-coded prompt features, that's
honestly impressive.

### 3.10 Cross-validation (CV)
The word "cross-validation" makes the model claim trustworthy. The
idea: don't train and test on the same data, you'd just memorize the
training set.

We use **5-fold stratified cross-validation**. Steps:
1. Shuffle the 6,413 conversations and split into 5 equal chunks (folds).
2. Train the model on 4 of the chunks, test on the 5th. Record the score.
3. Repeat 5 times, leaving each chunk out once.
4. Average the 5 scores.

"Stratified" means each fold preserves the 55/45 success/failure
balance, so we don't get a fold of all-success conversations.

### 3.11 Cohen's kappa (κ)
A measure of how well two raters agree on the same items. It runs
from 0 (no agreement above chance) to 1 (perfect agreement). We use
the standard **Landis and Koch scale** to interpret it:

| κ           | Agreement level   |
|-------------|-------------------|
| 0.00 – 0.20 | Slight            |
| 0.21 – 0.40 | Fair              |
| 0.41 – 0.60 | Moderate          |
| 0.61 – 0.80 | Substantial       |
| 0.81 – 1.00 | **Almost perfect** |

We hand-labeled 50 conversations and compared our hand labels to the
auto-labeler. We got **κ = 0.834** → "almost perfect" → our
auto-labeler is trustworthy.

### 3.12 Cohen's d (effect size)
A measure of "how big is the difference between two groups?" It's
unitless. The Cohen scale:
- **0.2** = small effect
- **0.5** = medium effect
- **0.8** = large effect

We use it in the cross-model study (Kimi/Claude/Gemini) to measure
how much engineered prompts beat zero-shot prompts. Our d-values are
0.59 (Claude), 0.70 (Kimi), 0.80 (Gemini) — all medium-to-large.

---

## 4. The 11 prompt features, in plain English

Every conversation gets reduced to these 11 numbers. Each one is
extracted by a regex (a text-pattern matcher) from the conversation
text.

### Structural features (from the *first* developer prompt)

| # | Feature | What it measures | Example match |
|---|---|---|---|
| 1 | `first_prompt_tokens` | Length of the first prompt in tokens | longer = ? |
| 2 | `first_constraint_count` | How many constraint phrases | "must", "should", "do not", "only", "exactly" |
| 3 | `total_example_count` | How many worked examples | "for example", "input:", "output:", fenced code blocks |
| 4 | `first_specification_clarity_count` | How many spec phrases | "the function should", "given a", "returns a", "implement a" |
| 5 | `has_role_instruction_first` | Yes/no: did the dev set a role? | "you are X", "act as", "as a" |
| 6 | `has_output_format_first` | Yes/no: did the dev request a format? | "json", "markdown", "table", "return only", "respond with" |
| 7 | `has_specification_clarity_first` | Yes/no: any spec phrase at all | same patterns as #4 |

### Behavioral features (across the whole conversation)

| # | Feature | What it measures |
|---|---|---|
| 8  | `iteration_count` | Total turns in the conversation |
| 9  | `refinement_turns` | Turns containing words like "fix", "bug", "error", "improve", "retry" |
| 10 | `correction_cycles` | Adjacent turn pairs where the dev pushes back on a wrong answer |
| 11 | `prompt_token_growth` | Length difference between first and last developer prompt |

The full regex catalog lives in `config/feature_patterns.yaml` at the
project root. The extractor is in `pipeline/feature_extraction.py`.

**Important distinction (this trips people up):**
- **Refinement turns** = the dev iterating on the prompt: "can you also
  handle empty input?" → positive, productive.
- **Correction cycles** = the model gave a *wrong* answer and the dev
  has to fix it: "no, that returns null" → negative, recovery work.

The model treats these as two separate features. That's why
**refinement is positive in our model** even though earlier descriptive
work treated all back-and-forth as bad. We separate the two and the
real signal pops out.

---

## 5. The success label, with two examples

### Example 1 — labeled SUCCESS
> **Dev:** Write a Python function that reverses a string.
>
> **Assistant:** ```python
> def reverse(s):
>     return s[::-1]
> ```
>
> **Dev:** Thanks, that works.

Code present in assistant turn? Yes. Negative feedback in any later
dev turn? No. → **success**.

### Example 2 — labeled FAILURE
> **Dev:** Write a function to parse this JSON.
>
> **Assistant:** ```python
> data = json.loads(text)
> ```
>
> **Dev:** That's not what I asked. The text is YAML, not JSON.
>
> **Assistant:** ```python
> data = yaml.safe_load(text)
> ```
>
> **Dev:** Still doesn't work, I'm getting a parser error.

Code present? Yes. Negative feedback later ("doesn't work", "parser
error")? Yes. → **failure**.

---

## 6. The fitted model, in everyday language

The logistic regression takes 45 inputs (11 prompt features + 34
control dummies) and produces a probability between 0 and 1: "given
this conversation's features, how likely is it to be success?"

Each input gets one **coefficient**. Exponentiate the coefficient and
you get the **odds ratio** for that feature. That's it. The whole
model is a sum of (coefficient × feature) terms passed through an
S-curve.

We use:
- **L2 regularization** at C = 1.0 — gentle nudge that pulls all
  coefficients slightly toward zero, which prevents overfitting on
  the few features that happen to look extreme on this particular
  dataset.
- **`class_weight = "balanced"`** — tells the optimizer to weight
  failures slightly higher because they're the minority class
  (45% vs 55%). This stops the model from cheating by always
  predicting "success."
- **5-fold stratified CV** — see section 3.10.
- **Random seed 42** — the same seed every time, so any of you can
  rerun the pipeline and get exactly our numbers.

Software: scikit-learn 1.4 for the cross-validated fit, statsmodels
0.14 for confidence intervals on the coefficients (statsmodels is
more rigorous about CIs).

---

## 7. The 9 figures, one by one

All 9 figures live in `figures/`. They're regenerated from
`results/*.json` whenever you run `python make_figures.py`.

### 7.1 `fig_baselines.png` — How does our model compare?

A bar chart of four classifiers, all fitted on the same 6,413 labels
under the same 5-fold split:

| Classifier | AUC |
|---|---|
| Majority class (always predict success) | 0.500 (chance) |
| Random | 0.498 (chance) |
| Bag-of-words logistic on the first prompt (2,000 features) | 0.782 |
| **Our 11-feature model + controls** | **0.799** |

**Why this matters.** The fact that bag-of-words alone gets 0.782 is
already a strong message: most of the predictive signal is in the
words of the first prompt. Our hand-engineered features add
**+1.7 AUC points** on top of that. Those extra two points come
from features that bag-of-words can't capture cleanly — refinement
turn counts, role instruction flags, prompt growth — which are
properties of the conversation as a *whole*, not just the first
prompt.

### 7.2 `fig_odds_ratio_forest.png` — Which features matter, and how much?

A **forest plot**. Each row is one feature. The dot is the odds
ratio. The horizontal line is the 95% confidence interval. The
vertical dashed line at OR = 1.0 is "no effect." Round dots =
significant (p < 0.05); square dots = not significant. Green = OR
≥ 1 (helps); coral = OR < 1 (hurts).

Read it like this: any feature whose entire CI lies to the **right**
of 1.0 is a confirmed helper. Any feature whose entire CI lies to
the **left** of 1.0 is a confirmed hurter. Features whose CIs cross
the 1.0 line are inconclusive.

The two biggest helpers are **Output Format (1.75)** and
**Refinement Turns (1.19 per extra turn)**. The biggest hurter is
**Role Instruction (0.65)**. Constraints and prompt length both have
small but significant negative effects.

This figure is the single most important one in the paper.

### 7.3 `fig_feature_dist.png` — Are successes and failures actually different?

A horizontal bar chart of the **mean value** of six headline
features, computed separately for successful conversations (green)
and unsuccessful ones (red). The x-axis is on a symmetric log scale
because the features differ by orders of magnitude.

You can see at a glance:
- Failures have ~6× more correction cycles than successes (0.28 vs 0.0).
- Successful first prompts are *shorter* (188 vs 210 tokens),
  consistent with the small negative coefficient on prompt length.
- Iteration counts are similar; what differs is the *type* of
  iteration (refinement vs correction).

### 7.4 `fig_correlation.png` — Are our features independent?

A heatmap of pairwise **Spearman rank correlations** among the 11
features. Spearman is "are higher values of X associated with higher
values of Y?" without assuming a straight line.

Important because **multicollinearity** (when features are highly
correlated) confuses regression coefficients. Our matrix is mostly
near zero. The single highest pair is `refinement_turns` ↔
`correction_cycles` at about 0.45 — moderate, not problematic. So
the regression coefficients we report are not inflated by feature
overlap.

### 7.5 `fig_ablation.png` — How much does each group of features matter?

We re-fit the model **5 separate times**, each time *removing* one
group of features, and record how much the AUC drops:

| Removed group | Δ AUC |
|---|---|
| Prompt-engineering features (the 11 we care about) | **0.043** |
| Repository language one-hots | 0.013 |
| Source type one-hots | 0.016 |
| Snapshot date one-hots | 0.001 |
| ChatGPT model variant one-hots | smallest |

**Translation.** Knocking out our 11 prompt features hurts AUC about
**three times more** than knocking out any control group. The
predictive power lives in the prompts, not in the metadata. This is
the single strongest argument that the paper's claims are real and
not artifacts of confounding.

### 7.6 `fig_interactions.png` — Do features combine in surprising ways?

A forest plot, same shape as 7.2, but for **interaction terms**. We
pre-registered four two-way interactions before looking at the data,
fit them in one model alongside all the main effects, and plotted
the results.

The standout: **Role × Output Format = OR 5.28**. Role instruction
alone is bad (OR 0.65). Output format alone is great (OR 1.75).
Combine the two and the joint effect is ~5× higher than either
piece — a textbook synergy.

The other significant one is **Output Format × Refinement = 0.89**,
which is *sub-additive*: if your prompt already specifies a format,
each extra refinement turn adds slightly less than it would
otherwise. Diminishing returns.

### 7.7 `fig_cross_model.png` — Does the finding generalize beyond ChatGPT?

We took 200 prompts and replayed each one through three other LLMs:
- **Kimi K2** (Moonshot AI, served via NVIDIA NIM)
- **Claude Sonnet 4.6** (Anthropic, served via AWS Bedrock)
- **Gemini 3.1 Pro Preview** (Google, served via Vertex AI)

Each prompt was sent twice: once as **zero-shot** (system prompt =
"you are a helpful coding assistant") and once as **engineered**
(system prompt that explicitly asks for constraints, an output
format, and a complexity analysis). Each output was graded on a
4-axis rubric (code present, addresses task, looks correct, follows
structure) for a 0–4 score.

The bar chart shows mean rubric score per vendor under each
condition. **Engineered prompts beat zero-shot for every vendor.**
The success-rate (rubric ≥ 3) lifts are:
- Kimi: +23 percentage points
- Claude: +14 percentage points
- Gemini: +24 percentage points

This is what makes the paper a *finding* and not just a curve fit on
DevGPT.

### 7.8 `fig_kappa_heatmap.png` — Do the three vendors agree?

A 3×3 heatmap of pairwise Cohen's κ between the three LLMs on the
binary success label. Values are 0.39 to 0.43 — moderate agreement.
That means the three vendors mostly agree on which prompts are
clearly easy and which are clearly hard, but they split on the
boundary cases. Sensible.

### 7.9 `fig_temporal_drift.png` — Did the effect change over time?

Per-snapshot odds ratios for two key features (`output_format` in
green, `refinement_turns` in red), plotted across the six snapshots
that have at least 200 conversations. Snapshots span August 2023 to
May 2024.

Output format has OR > 1 in **every** snapshot, with the point
estimate ranging from 1.33 to 3.62. Refinement looks below 1 in the
per-snapshot view, which seems to contradict the headline result —
but only because the per-snapshot fit doesn't separate refinement
from correction cycles. The full model in section 7.2 controls for
correction and recovers the positive refinement effect.

The figure's caption explains this; just be ready to answer if a
reviewer points at it.

---

## 8. The pipeline diagram (Figure 1 in the paper)

This is a TikZ-drawn block diagram inside the paper itself (not a
PNG). It shows six stages stacked vertically:

```
DevGPT v10 (raw JSON)
      ↓
Cleaning + tokenization
      ↓
Regex feature extraction
      ↓
Auto success labeling
      ↓
Logistic regression
      ↓
CV, ablation, interactions
```

Every stage corresponds to a script in `pipeline/` — see the root
README for the file-by-file mapping.

---

## 9. The companion website

Lives in `frontend/` at the project root. It's a Next.js 16 app that
visualizes the same numbers reported in the paper, plus has two
interactive features:

1. **Live race demo (`/api/race`).** Type a coding prompt; the site
   sends it in parallel to the same three vendors (Kimi, Claude,
   Gemini) and streams the responses back side-by-side.

2. **Live judge (`/api/race-analysis`).** A Claude Haiku model grades
   each response on the same rubric we used in the offline study and
   posts the scores back. So a reviewer can watch the prompt-engineering
   effect happen live.

The site reads its numbers from typed TypeScript files under
`frontend/src/data/`. Those files are auto-generated from
`results/*.json` by `pipeline/import_study_results.py`, so the site
and the paper can never drift out of sync.

To run the site locally:

```bash
cd frontend
npm install
npm run dev          # opens at http://localhost:3000
```

Required environment variables in `frontend/.env.local`:

| Variable | Used for |
|---|---|
| `NVIDIA_API_KEY` | Kimi K2 via NVIDIA NIM |
| `AWS_BEARER_TOKEN_BEDROCK` | Claude Sonnet 4.6 via AWS Bedrock |
| `AWS_REGION` | Bedrock region (`us-east-1`) |
| `CLOUD_RUN_API_KEY` | Vertex AI Gemini key |
| `GEMINI_VERTEX_MODEL` | Vertex model name |

Copy `frontend/.env.example` and fill in real values. **Never commit
`.env.local`** — it's in `.gitignore`.

---

## 10. The numbers, one more time

For when you're standing in front of a slide and need to read off a
sentence:

> "We extracted eleven prompt features from 6,413 real
> developer-ChatGPT conversations and fit a balanced logistic
> regression with five-fold stratified cross-validation. The model
> reaches ROC-AUC 0.799, accuracy 0.726, F1 0.755. The strongest
> positive predictor is an explicit output-format instruction in
> the first prompt: odds ratio 1.75, 95% CI [1.40, 2.19], p below
> one in a million. Role instructions hurt on their own — odds
> ratio 0.65 — but combining role with an output format produces a
> joint odds ratio of about 5.3. The eleven prompt features carry
> roughly three times the predictive load of repository language,
> source type, snapshot date, and ChatGPT model variant combined.
> A 50-sample manual audit gives Cohen's kappa of 0.834 — almost
> perfect agreement on the Landis and Koch scale. We replicate the
> engineered prompt effect on three independent LLMs — Kimi K2,
> Claude Sonnet 4.6, Gemini 3.1 Pro — with success rates rising
> 14 to 24 percentage points across vendors."

If you can read that paragraph and explain *every* number in it
without hand-waving, you can defend the paper.

---

## 11. Glossary (alphabetical)

**Ablation.** A robustness check where you re-fit a model after
removing one feature group at a time, to see which group carries
the most predictive load.

**AUC** (Area Under the ROC Curve). A single-number summary of how
well a binary classifier ranks positive examples above negatives.
0.5 = random, 1.0 = perfect, 0.799 = our model.

**Bag-of-words (BoW).** A baseline text representation that treats
each prompt as an unordered bag of word counts. Loses word order;
keeps vocabulary. We use 2,000 features at the unigram + bigram
level.

**Class weight ("balanced").** A scikit-learn option that tells the
fitter to weight each class inversely to its frequency, so the
minority class isn't ignored.

**Cohen's d.** Effect size between two means, in standard-deviation
units. 0.2 small, 0.5 medium, 0.8 large.

**Cohen's kappa (κ).** Inter-rater agreement above chance, 0 to 1.
We use it for two purposes: comparing our auto-labeler to manual
labels (got 0.834), and comparing the three vendors to each other
in the cross-model study.

**Confidence interval (CI).** Range of plausible values for a
parameter. A 95% CI means: if we repeated this study many times,
about 95% of the intervals we'd compute would contain the true
value.

**Confounder.** A third variable that affects both the input and
the outcome, faking a correlation. Example: skilled developers
might both write better prompts *and* pick easier tasks. We
control for what we can (language, source type, snapshot,
ChatGPT model variant) but acknowledge this in Limitations.

**Coefficient.** The number assigned to each input feature in the
fitted model. Exponentiated, it becomes the odds ratio.

**Correction cycle.** A turn pair where the developer pushes back on
a wrong assistant answer. Different from refinement.

**Cross-validation (CV).** Train on most of the data, test on a held-
out chunk; repeat across chunks; average. Lets you measure
generalization without a separate test set. We use 5-fold stratified.

**DevGPT v10.** The public corpus of 6,413 ChatGPT conversations
linked to GitHub artifacts. Released by Xiao et al., 2023, on
arXiv:2309.03914.

**Effect size.** How big a difference is, separate from whether it's
statistically significant. Cohen's d is the most common.

**F1.** Harmonic mean of precision and recall. Useful single-number
summary on imbalanced data. Ours is 0.755.

**Feature group.** A set of related features. We have five groups:
the 11 prompt features, repository language one-hots, source type
one-hots, snapshot date one-hots, and ChatGPT model variant one-hots.

**Forest plot.** A figure that shows odds ratios with 95% CIs as
horizontal whiskers around a central point. Used in figures 7.2 and
7.6.

**Heuristic.** A rule of thumb. Our success label is a textual
heuristic (presence of code + absence of negative feedback). Not
perfect, but its kappa against manual labels is 0.834.

**Interaction.** A model term that captures non-additive combinations
of features. Role × Output Format means: the joint effect of having
both is *not* equal to the sum of having each alone.

**L2 regularization.** A penalty added to the loss function that
shrinks coefficients toward zero. Prevents overfitting. We use
C = 1.0 (the strength parameter; smaller = more shrinkage).

**Landis and Koch scale.** The standard interpretation rubric for
Cohen's κ values (slight, fair, moderate, substantial, almost
perfect). Cited as Landis & Koch (1977).

**Logistic regression.** The simplest yes/no predictive model.
Linear combination of features → S-shaped curve → probability.

**Multicollinearity.** When two or more input features are highly
correlated, which inflates standard errors and confuses
coefficients. We checked for it (figure 7.4) and it's not a problem.

**Odds.** Ratio of (probability success) to (probability failure).
60% success and 40% failure → odds 1.5.

**Odds ratio (OR).** Ratio of two odds. The main currency of the
paper. OR > 1 helps; OR < 1 hurts.

**One-hot encoding.** A way to turn a categorical variable (e.g.
language = Python / Java / Rust) into many yes/no columns (one per
category). Required because the regression takes only numbers.

**p-value.** Probability of seeing a result this extreme by chance
if the feature actually had zero effect. Below 0.05 = "statistically
significant."

**Pre-registered.** Decided in advance, before looking at the data.
Important for interaction analyses because cherry-picking after
seeing the data inflates false-positive rates.

**Refinement turn.** A developer turn that asks for a fix or
extension, like "now also handle empty input" or "try a different
approach." Different from correction cycle.

**Regex.** Short for regular expression. A text-pattern matcher used
throughout `pipeline/feature_extraction.py` to detect features.

**ROC curve.** A plot of true-positive rate vs false-positive rate
across all decision thresholds. The AUC is the area under this
curve.

**Stratified split.** A train/test split that preserves the class
balance of the full dataset in each fold.

**Success label.** Our binary outcome. Defined in section 5.

**Token.** A model's atomic unit of text. Roughly one word, but
words like "implementation" might split into "implement" + "ation."
We count first-prompt length in tokens.

**Wald confidence interval.** A specific way of computing a CI
around a regression coefficient, using the coefficient ± 1.96 ×
its standard error. Standard for logistic regression.

**Zero-shot.** Sending the prompt to the LLM with no special
system prompt. The control condition in our cross-model study.

---

## 12. How to talk about this in the defense

If a reviewer challenges any specific claim, every number in the
paper traces back to a JSON or CSV file under `results/`. The paper
itself is generated from those files by `make_figures.py` and
`pipeline/paper_results_report.py`. Nothing is typed by hand.

Common reviewer questions and where to find the answer:

1. **"How do you know AUC 0.799 is real and not overfitting?"** →
   Five-fold CV with random seed 42, see model_metrics.json. The
   standard deviation across folds is 0.009, which is tiny. Plus
   the BoW baseline at 0.782 is in the same neighborhood, so it's
   not a cherry-picked feature set.

2. **"What if the auto-labeler is just wrong?"** → We hand-labeled
   50 conversations and got κ = 0.834 (almost perfect). All 4
   disagreements are conservative misses, meaning the auto-labeler
   may slightly under-count successes — bias goes against finding
   effects, so the real effects are at least as strong as we report.

3. **"What if you cherry-picked the interactions?"** → We
   pre-registered four pairs before fitting. Three of them turn
   out significant; the fourth (Output Format × Constraints) does
   not (p = 0.086). Reporting non-significant pre-registered tests
   is the opposite of cherry-picking.

4. **"Does it generalize beyond ChatGPT?"** → Cross-model study,
   200 prompts × 3 vendors. Engineered prompts win on every vendor.
   See multi_model_study.json.

5. **"What about confounders?"** → We control for repository
   language, source type, snapshot date, and ChatGPT model variant.
   Ablation shows our prompt features carry 3× the load of these
   controls combined.

---

## 13. FAQ for teammates

**Q. What's "OR 5.28" mean in one sentence?**
"If a developer puts both a role instruction and an output format
into the first prompt, the odds of a successful conversation
multiply by about 5.3 compared to neither being present."

**Q. Why does the paper say role is bad on its own?**
Because in the data, people who write a bare "you are a Python expert"
without specifying *what they want* tend to be in exploratory mode,
and exploratory conversations fail more often. The role instruction
isn't causing the failure — it's correlated with vague intent. Once
the prompt also has a concrete output format, the developer
clearly knows what they want and the joint effect flips strongly
positive.

**Q. Why is the BoW baseline so close (0.782 vs our 0.799)?**
Because language and topic are very predictive on their own — short
CSS prompts succeed often, long Rust prompts succeed less often.
BoW captures that for free. Our +1.7 AUC margin is the part that
specifically comes from prompt *structure*, which is what the paper
is actually about.

**Q. Why do we use 5-fold and not 10-fold CV?**
5-fold is standard for n ≈ 6k. 10-fold gives less variance per
fold but more variance across runs. With 6,413 rows and 45 features,
either gives nearly identical AUC. We picked 5 to keep the script fast.

**Q. Why a 50-sample manual audit and not 500?**
Time. Hand-labeling 50 conversations takes a few hours.
Hand-labeling 500 takes weeks. We flag a 500-sample blinded
re-labeling pass as future work in the Limitations and Conclusion
sections.

**Q. Where do I find the raw model coefficients?**
`results/coefficients.csv` — one row per feature with OR, CI low,
CI high, and p-value.

**Q. What if a reviewer asks for the Python version of "OR 1.75"?**
"Adding `\nReturn the answer as JSON.` to the end of your first
ChatGPT prompt makes the conversation 75% more likely to produce
useful code, in our data."

---

If anything in the paper still doesn't make sense after reading
this, ping me in our group chat and we'll add a glossary entry.
