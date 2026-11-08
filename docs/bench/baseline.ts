// Baseline summary and comparison for the single-page benchmark scenario.
// Pure functions; bench.ts owns the browser and the files.

export interface BenchSample {
  domContentLoaded: number;
  load: number;
  scriptDuration: number;
  taskDuration: number;
  jLatency: number;
  jWarmLatency: number;
  fLatency: number;
}

export interface Environment {
  platform: string;
  arch: string;
  container: boolean;
  chromium: string;
}

export interface Tolerance {
  // A metric fails when its median is above max(baseline, 0) * (1 + ratio) + floorMs.
  ratio: number;
  floorMs: number;
}

// Load metrics are stored as jk-nav median minus no-extension median, so the
// page's own cost drops out. Key latencies are jk-nav medians; the control
// column has none.
export const GATED_METRICS = [
  'domContentLoadedOverhead',
  'loadOverhead',
  'scriptDurationOverhead',
  'jLatency',
  'jWarmLatency',
  'fLatency',
] as const;

// Main-thread task time is dominated by the page itself and moves by several
// milliseconds between runs, so it is shown but never fails the check.
export const INFO_METRICS = ['taskDurationOverhead'] as const;

export type BaselineMetric = (typeof GATED_METRICS)[number] | (typeof INFO_METRICS)[number];

export const METRIC_LABELS: Record<BaselineMetric, string> = {
  domContentLoadedOverhead: 'DOMContentLoaded overhead, ms',
  loadOverhead: 'load event overhead, ms',
  scriptDurationOverhead: 'script time overhead until load+500 ms, ms',
  taskDurationOverhead: 'main-thread task time overhead until load+500 ms, ms',
  jLatency: 'first j → first scroll event, ms',
  jWarmLatency: 'second j → first scroll event, ms',
  fLatency: 'f → first hint node, ms',
};

export interface Baseline {
  recordedAt: string;
  commit: string | null;
  iterations: number;
  environment: Environment;
  tolerance: Tolerance;
  metrics: Record<BaselineMetric, number>;
}

export interface CheckRow {
  metric: BaselineMetric;
  baseline: number;
  current: number;
  limit: number;
  status: 'pass' | 'fail' | 'info';
}

export function quantile(values: number[], q: number): number {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

function median(samples: BenchSample[], key: keyof BenchSample): number {
  return quantile(samples.map((sample) => sample[key]), 0.5);
}

// CDP reports microseconds; three decimals keep that and drop float noise.
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function summarize(control: BenchSample[], jkNav: BenchSample[]): Record<BaselineMetric, number> {
  const overhead = (key: keyof BenchSample) => round(median(jkNav, key) - median(control, key));
  return {
    domContentLoadedOverhead: overhead('domContentLoaded'),
    loadOverhead: overhead('load'),
    scriptDurationOverhead: overhead('scriptDuration'),
    taskDurationOverhead: overhead('taskDuration'),
    jLatency: round(median(jkNav, 'jLatency')),
    jWarmLatency: round(median(jkNav, 'jWarmLatency')),
    fLatency: round(median(jkNav, 'fLatency')),
  };
}

export function limitFor(baselineValue: number, tolerance: Tolerance): number {
  return Math.max(baselineValue, 0) * (1 + tolerance.ratio) + tolerance.floorMs;
}

export function compareToBaseline(baseline: Baseline, current: Record<BaselineMetric, number>): CheckRow[] {
  const rows: CheckRow[] = [];
  for (const metric of [...GATED_METRICS, ...INFO_METRICS]) {
    const recorded = baseline.metrics[metric];
    const value = current[metric];
    const limit = limitFor(recorded, baseline.tolerance);
    const gated = (GATED_METRICS as readonly string[]).includes(metric);
    const status = !gated ? 'info' : Number.isFinite(value) && value <= limit ? 'pass' : 'fail';
    rows.push({ metric, baseline: recorded, current: value, limit, status });
  }
  return rows;
}

export function environmentMismatch(baseline: Environment, current: Environment): string | null {
  const fields: (keyof Environment)[] = ['platform', 'arch', 'container', 'chromium'];
  const differences = fields
    .filter((field) => baseline[field] !== current[field])
    .map((field) => `${field}: ${String(baseline[field])} (baseline) vs ${String(current[field])} (current)`);
  return differences.length === 0 ? null : differences.join('; ');
}
