// Source: results/temporal_drift.json (pipeline/run_temporal_drift.py)
// Per-snapshot logistic on success ~ four headline features.
// Snapshots with n < 200 dropped before fitting.

export interface SnapshotPoint {
  date: string;
  n: number;
  or: number;
  ciLow: number;
  ciHigh: number;
  p: number;
}

export interface DriftSeries {
  feature: string;
  label: string;
  description: string;
  points: SnapshotPoint[];
}

export const temporalDrift: DriftSeries[] = [
  {
    feature: "has_output_format_first",
    label: "Output Format",
    description: "Effect of formatting instructions in the first prompt, per snapshot.",
    points: [
      { date: "2023-08-10", n: 221,  or: 3.319, ciLow: 1.532, ciHigh: 7.192, p: 0.0024 },
      { date: "2023-08-17", n: 209,  or: 1.731, ciLow: 0.507, ciHigh: 5.914, p: 0.3814 },
      { date: "2023-08-31", n: 204,  or: 1.329, ciLow: 0.411, ciHigh: 4.294, p: 0.6351 },
      { date: "2023-09-14", n: 225,  or: 1.695, ciLow: 0.621, ciHigh: 4.628, p: 0.3030 },
      { date: "2023-10-12", n: 912,  or: 3.617, ciLow: 2.317, ciHigh: 5.645, p: 0.0000 },
      { date: "2024-05-14", n: 2633, or: 2.728, ciLow: 2.010, ciHigh: 3.701, p: 0.0000 },
    ],
  },
  {
    feature: "refinement_turns",
    label: "Refinement Turns",
    description: "Effect of additional refinement iterations, per snapshot.",
    points: [
      { date: "2023-08-10", n: 221,  or: 0.949, ciLow: 0.889, ciHigh: 1.013, p: 0.1139 },
      { date: "2023-08-17", n: 209,  or: 0.709, ciLow: 0.545, ciHigh: 0.922, p: 0.0104 },
      { date: "2023-08-31", n: 204,  or: 0.889, ciLow: 0.699, ciHigh: 1.132, p: 0.3400 },
      { date: "2023-09-14", n: 225,  or: 0.894, ciLow: 0.790, ciHigh: 1.012, p: 0.0755 },
      { date: "2023-10-12", n: 912,  or: 0.899, ciLow: 0.834, ciHigh: 0.969, p: 0.0052 },
      { date: "2024-05-14", n: 2633, or: 0.948, ciLow: 0.905, ciHigh: 0.994, p: 0.0263 },
    ],
  },
];

export const temporalDriftMeta = {
  minSnapshotN: 200,
  totalFitted: 6,
  totalSkipped: 4,
};
