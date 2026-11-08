import { describe, expect, it } from 'vitest';
import {
  compareToBaseline,
  environmentMismatch,
  limitFor,
  quantile,
  summarize,
  type Baseline,
  type BenchSample,
} from '../../docs/bench/baseline.ts';

const tolerance = { ratio: 0.25, floorMs: 1 };

function sample(values: Partial<BenchSample>): BenchSample {
  return {
    domContentLoaded: 0,
    load: 0,
    scriptDuration: 0,
    taskDuration: 0,
    jLatency: NaN,
    jWarmLatency: NaN,
    fLatency: NaN,
    ...values,
  };
}

function baseline(metrics: Partial<Baseline['metrics']>): Baseline {
  return {
    recordedAt: '2026-11-08T00:00:00.000Z',
    commit: 'abc1234',
    iterations: 20,
    environment: { platform: 'linux', arch: 'arm64', container: true, chromium: '142.0.7444.52' },
    tolerance,
    metrics: {
      domContentLoadedOverhead: 0,
      loadOverhead: 0,
      scriptDurationOverhead: 0,
      taskDurationOverhead: 0,
      jLatency: 0,
      jWarmLatency: 0,
      fLatency: 0,
      ...metrics,
    },
  };
}

describe('quantile', () => {
  it('takes the upper middle value as the median of an even count', () => {
    // #given
    const values = [5, 1, 3, 2];
    // #when
    const median = quantile(values, 0.5);
    // #then
    expect(median).toBe(3);
  });

  it('ignores non-finite values', () => {
    // #given
    const values = [NaN, 4, 2];
    // #when
    const median = quantile(values, 0.5);
    // #then
    expect(median).toBe(4);
  });
});

describe('summarize', () => {
  it('reports load overhead as the jk-nav median minus the control median and key latencies as jk-nav medians', () => {
    // #given
    const control = [
      sample({ domContentLoaded: 10, load: 15, scriptDuration: 0.2, taskDuration: 60 }),
      sample({ domContentLoaded: 12, load: 17, scriptDuration: 0.4, taskDuration: 64 }),
      sample({ domContentLoaded: 11, load: 16, scriptDuration: 0.3, taskDuration: 62 }),
    ];
    const jkNav = [
      sample({ domContentLoaded: 13, load: 19, scriptDuration: 1.5, taskDuration: 61, jLatency: 14, jWarmLatency: 2, fLatency: 7 }),
      sample({ domContentLoaded: 15, load: 21, scriptDuration: 1.7, taskDuration: 59, jLatency: 16, jWarmLatency: 3, fLatency: 9 }),
      sample({ domContentLoaded: 14, load: 20, scriptDuration: 1.6, taskDuration: 60, jLatency: 15, jWarmLatency: 2.5, fLatency: 8 }),
    ];
    // #when
    const metrics = summarize(control, jkNav);
    // #then
    expect(metrics).toEqual({
      domContentLoadedOverhead: 3,
      loadOverhead: 4,
      scriptDurationOverhead: 1.3,
      taskDurationOverhead: -2,
      jLatency: 15,
      jWarmLatency: 2.5,
      fLatency: 8,
    });
  });
});

describe('limitFor', () => {
  it('adds the ratio and the floor to the baseline value', () => {
    // #given
    const baselineValue = 2;
    // #when
    const limit = limitFor(baselineValue, tolerance);
    // #then
    expect(limit).toBe(3.5);
  });

  it('clamps a negative baseline value to zero before adding the floor', () => {
    // #given
    const baselineValue = -1.5;
    // #when
    const limit = limitFor(baselineValue, tolerance);
    // #then
    expect(limit).toBe(1);
  });
});

describe('compareToBaseline', () => {
  it('passes a gated metric that equals its limit', () => {
    // #given
    const recorded = baseline({ fLatency: 2 });
    // #when
    const row = compareToBaseline(recorded, { ...recorded.metrics, fLatency: 3.5 }).find((r) => r.metric === 'fLatency');
    // #then
    expect(row).toEqual({ metric: 'fLatency', baseline: 2, current: 3.5, limit: 3.5, status: 'pass' });
  });

  it('fails a gated metric above its limit', () => {
    // #given
    const recorded = baseline({ fLatency: 2 });
    // #when
    const row = compareToBaseline(recorded, { ...recorded.metrics, fLatency: 3.6 }).find((r) => r.metric === 'fLatency');
    // #then
    expect(row?.status).toBe('fail');
  });

  it('fails a gated metric that was not measured', () => {
    // #given
    const recorded = baseline({ jLatency: 14 });
    // #when
    const row = compareToBaseline(recorded, { ...recorded.metrics, jLatency: NaN }).find((r) => r.metric === 'jLatency');
    // #then
    expect(row?.status).toBe('fail');
  });

  it('reports task-time overhead as info even when it is above its limit', () => {
    // #given
    const recorded = baseline({ taskDurationOverhead: -1 });
    // #when
    const row = compareToBaseline(recorded, { ...recorded.metrics, taskDurationOverhead: 30 }).find((r) => r.metric === 'taskDurationOverhead');
    // #then
    expect(row).toEqual({ metric: 'taskDurationOverhead', baseline: -1, current: 30, limit: 1, status: 'info' });
  });
});

describe('environmentMismatch', () => {
  it('returns null for the same environment', () => {
    // #given
    const environment = { platform: 'linux', arch: 'arm64', container: true, chromium: '142.0.7444.52' };
    // #when
    const mismatch = environmentMismatch(environment, { ...environment });
    // #then
    expect(mismatch).toBeNull();
  });

  it('names each field that differs with the baseline and current values', () => {
    // #given
    const recorded = { platform: 'linux', arch: 'arm64', container: true, chromium: '142.0.7444.52' };
    const current = { platform: 'darwin', arch: 'arm64', container: false, chromium: '142.0.7444.52' };
    // #when
    const mismatch = environmentMismatch(recorded, current);
    // #then
    expect(mismatch).toBe('platform: linux (baseline) vs darwin (current); container: true (baseline) vs false (current)');
  });
});
