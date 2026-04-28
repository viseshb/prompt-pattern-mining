// Source: results/interactions.json (pipeline/run_interactions.py)
// Theory-driven 2-way interactions, pre-registered (no blanket screening).

export interface Interaction {
  label: string;
  term: string;
  or: number;
  ciLow: number;
  ciHigh: number;
  pValue: number;
  significant: boolean;
}

export const interactions = {
  n: 6413,
  anySignificant: true,
  rows: [
    {
      label: "Output Format × Refinement",
      term: "has_output_format_first × refinement_turns",
      or: 0.894, ciLow: 0.833, ciHigh: 0.961, pValue: 0.0022, significant: true,
    },
    {
      label: "Role × Output Format",
      term: "has_role_instruction_first × has_output_format_first",
      or: 5.284, ciLow: 3.370, ciHigh: 8.287, pValue: 0.0001, significant: true,
    },
    {
      label: "Iterations × Prompt Length",
      term: "iteration_count × first_prompt_tokens",
      or: 1.000, ciLow: 1.000, ciHigh: 1.000, pValue: 0.0023, significant: true,
    },
    {
      label: "Output Format × Constraints",
      term: "has_output_format_first × first_constraint_count",
      or: 0.957, ciLow: 0.909, ciHigh: 1.006, pValue: 0.0857, significant: false,
    },
  ] satisfies Interaction[],
};
