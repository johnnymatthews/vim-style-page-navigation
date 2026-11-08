// Benchmark: page-load overhead and key latency of jk-nav against another
// extension, in Chromium through Playwright. Memory is out of scope.
//
//   npm run build
//   BENCH_OTHER=/path/to/unpacked-extension BENCH_OTHER_NAME="Vimium C" \
//     node docs/bench/bench.ts [iterations]
//   BENCH_JK_NAV_BEFORE=/path/to/before BENCH_JK_NAV_AFTER=.output/chrome-mv3 \
//     node docs/bench/bench.ts --multi-frame 5
//
// Prints a Markdown table and writes docs/bench/results.json.
//
// Baseline gate, run through docs/bench/docker.sh so the environment is fixed:
//   node docs/bench/bench.ts --baseline   writes docs/bench/baseline.json
//   node docs/bench/bench.ts --check      compares with it; exit 1 on a regression
import { chromium, type BrowserContext, type CDPSession, type Frame, type Page } from '@playwright/test';
import http from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareToBaseline,
  environmentMismatch,
  METRIC_LABELS,
  quantile,
  summarize,
  type Baseline,
  type Environment,
} from './baseline.ts';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const args = process.argv.slice(2);
const multiFrame = args.includes('--multi-frame') || process.env.BENCH_SCENARIO === 'multi-frame';
const iterations = Number(args.find((arg) => /^\d+$/.test(arg)) ?? 20);
const mode: 'report' | 'check' | 'baseline' = args.includes('--check')
  ? 'check'
  : args.includes('--baseline') ? 'baseline' : 'report';
if (mode !== 'report' && (multiFrame || process.env.BENCH_OTHER)) {
  throw new Error(`--${mode} runs only the single-page scenario with the no-extension and jk-nav columns`);
}
const LINKS = 3000;
const PARAGRAPHS = 400;
const FRAME_AD_COUNT = 3;
const defaultResultsPath = path.join(root, 'docs/bench/results.json');
const baselinePath = process.env.BENCH_BASELINE_PATH ?? path.join(root, 'docs/bench/baseline.json');
if (mode === 'check' && !existsSync(baselinePath)) {
  throw new Error(`${path.relative(root, baselinePath)} is missing; run with --baseline first`);
}
const recordedBaseline = mode === 'check' ? JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline : null;

interface Config {
  name: string;
  extension?: string;
  role: 'control' | 'comparison' | 'before' | 'after';
}

function createConfigs(): Config[] {
  const jkNavExtension = process.env.BENCH_JK_NAV ?? path.join(root, '.output/chrome-mv3');
  if (!multiFrame) {
    const configs: Config[] = [
      { name: 'no extension', role: 'control' },
      { name: process.env.BENCH_JK_NAV_NAME ?? 'jk-nav', extension: jkNavExtension, role: 'comparison' },
    ];
    if (process.env.BENCH_OTHER) {
      configs.push({
        name: process.env.BENCH_OTHER_NAME ?? 'other',
        extension: process.env.BENCH_OTHER,
        role: 'comparison',
      });
    }
    return configs;
  }

  const before = process.env.BENCH_JK_NAV_BEFORE;
  if (!before) {
    throw new Error('BENCH_JK_NAV_BEFORE is required for --multi-frame');
  }

  return [
    { name: 'no extension', role: 'control' },
    { name: process.env.BENCH_JK_NAV_BEFORE_NAME ?? 'jk-nav before', extension: before, role: 'before' },
    {
      name: process.env.BENCH_JK_NAV_AFTER_NAME ?? 'jk-nav after',
      extension: process.env.BENCH_JK_NAV_AFTER ?? jkNavExtension,
      role: 'after',
    },
  ];
}

const configs = createConfigs();

function singlePageFixture(): string {
  const parts: string[] = [];
  for (let i = 0; i < PARAGRAPHS; i += 1) {
    const links: string[] = [];
    for (let j = 0; j < LINKS / PARAGRAPHS; j += 1) {
      links.push(`<a href="#t${i}-${j}">link ${i}-${j}</a>`);
    }
    parts.push(`<p>Paragraph ${i}. ${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(6)} ${links.join(' ')}</p>`);
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>bench</title>
<script>
  // Another extension may stop keydown before this page sees it, so the start
  // time is taken by the benchmark through evaluate() right before the key press.
  window.__bench = { armed: false, scroll: 0, mutation: 0 };
  addEventListener('scroll', () => { if (__bench.armed && !__bench.scroll) __bench.scroll = performance.now(); }, true);
  const observer = new MutationObserver(() => { if (__bench.armed && !__bench.mutation) __bench.mutation = performance.now(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
</script></head><body><main>${parts.join('\n')}</main></body></html>`;
}

function multiFrameFixture(port: number): string {
  const parts: string[] = [];
  for (let i = 0; i < PARAGRAPHS; i += 1) {
    const links: string[] = [];
    for (let j = 0; j < LINKS / PARAGRAPHS; j += 1) {
      links.push(`<a href="#t${i}-${j}">link ${i}-${j}</a>`);
    }
    parts.push(`<p>Paragraph ${i}. ${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(6)} ${links.join(' ')}</p>`);
  }
  const sameOrigin = `http://127.0.0.1:${port}`;
  const crossOrigin = `http://localhost:${port}`;
  const adFrames = Array.from({ length: FRAME_AD_COUNT }, (_, index) => `
    <iframe class="bench-frame" title="same-origin ad ${index}" src="${sameOrigin}/frame.html?kind=ad&slot=same-${index}"></iframe>
    <iframe class="bench-frame" title="cross-origin ad ${index}" src="${crossOrigin}/frame.html?kind=ad&slot=cross-${index}"></iframe>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>bench</title>
<style>
  .bench-frame { position: absolute; left: -10000px; width: 2px; height: 2px; border: 0; }
  #content-frame { width: 320px; height: 160px; }
</style>
<script>
  // Another extension may stop keydown before this page sees it, so the start
  // time is taken by the benchmark through evaluate() right before the key press.
  window.__bench = { armed: false, scroll: 0, mutation: 0 };
  addEventListener('scroll', () => { if (__bench.armed && !__bench.scroll) __bench.scroll = performance.now(); }, true);
  const observer = new MutationObserver(() => { if (__bench.armed && !__bench.mutation) __bench.mutation = performance.now(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
</script></head><body>${adFrames}
<iframe id="content-frame" class="bench-frame" title="content frame" src="${sameOrigin}/frame.html?kind=content"></iframe>
<main>${parts.join('\n')}</main></body></html>`;
}

function frameFixture(kind: string): string {
  const contentFrame = kind === 'content';
  const links = Array.from(
    { length: contentFrame ? 150 : 12 },
    (_, index) => `<a href="#frame-${index}">frame link ${index}</a>`,
  ).join(' ');
  const minHeight = contentFrame ? '2400px' : '900px';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>bench frame</title>
<style>body { margin: 0; min-height: ${minHeight}; font: 12px sans-serif; }</style>
</head><body data-frame-kind="${kind}">${links}</body></html>`;
}

function serve(): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
      const port = (server.address() as { port: number }).port;
      let html: string;
      if (multiFrame && requestUrl.pathname === '/frame.html') {
        html = frameFixture(requestUrl.searchParams.get('kind') ?? 'ad');
      } else {
        html = multiFrame ? multiFrameFixture(port) : singlePageFixture();
      }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(html);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${port}/bench.html`, close: () => server.close() });
    });
  });
}

async function launch(config: Config): Promise<BrowserContext> {
  const args = config.extension
    ? [`--disable-extensions-except=${config.extension}`, `--load-extension=${config.extension}`]
    : [];
  return chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args });
}

interface OopifSample {
  targetId: string;
  url: string;
  contentScriptReady: boolean;
  scriptDuration: number;
  taskDuration: number;
}

interface Sample {
  domContentLoaded: number;
  load: number;
  scriptDuration: number;
  taskDuration: number;
  jLatency: number;
  jWarmLatency: number;
  fLatency: number;
  sameOriginFrameCount?: number;
  crossOriginFrameCount?: number;
  outOfProcessFrameCount?: number;
  oopifFrames?: OopifSample[];
}

interface FrameMetricSession {
  frame: Frame;
  session: CDPSession;
  targetId: string;
}

interface TargetInfo {
  targetId: string;
  type: string;
  url: string;
  parentFrameId?: string;
}

interface TargetAttachedEvent {
  targetInfo: TargetInfo;
}

interface TargetListResponse {
  targetInfos: TargetInfo[];
}

interface RuntimeEvaluateResponse {
  result?: {
    value?: unknown;
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function findChildFrame(
  parentFrame: Frame,
  mainOrigin: string,
  targetUrl: string,
  knownFrames: Set<Frame>,
): Promise<Frame | null> {
  const deadline = Date.now() + 1000;
  while (!parentFrame.isDetached() && Date.now() < deadline) {
    const childFrame = parentFrame.childFrames().find((candidate) => {
      if (knownFrames.has(candidate) || !candidate.url()) {
        return false;
      }

      if (new URL(candidate.url()).origin === mainOrigin) {
        return false;
      }

      return targetUrl === '' || candidate.url() === targetUrl;
    });
    if (childFrame !== undefined) {
      return childFrame;
    }
    await delay(5);
  }
  return null;
}

async function attachFrameMetrics(
  parentFrame: Frame,
  targetInfo: TargetInfo,
  context: BrowserContext,
  mainOrigin: string,
  knownFrames: Set<Frame>,
  frameTasks: Array<Promise<FrameMetricSession | null>>,
): Promise<FrameMetricSession | null> {
  const frame = await findChildFrame(parentFrame, mainOrigin, targetInfo.url, knownFrames);
  if (frame === null) {
    return null;
  }

  knownFrames.add(frame);
  const session = await context.newCDPSession(frame);
  session.on('Target.attachedToTarget', (event: TargetAttachedEvent) => {
    if (event.targetInfo.type !== 'iframe') {
      return;
    }

    frameTasks.push(
      attachFrameMetrics(frame, event.targetInfo, context, mainOrigin, knownFrames, frameTasks),
    );
  });
  await session.send('Target.setAutoAttach', {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
    filter: [{ type: 'iframe' }],
  });
  await session.send('Performance.enable');
  await session.send('Runtime.runIfWaitingForDebugger');
  return { frame, session, targetId: targetInfo.targetId };
}

async function collectOopifMetrics(
  frameSessions: FrameMetricSession[],
): Promise<OopifSample[]> {
  const samples: OopifSample[] = [];
  for (const frameSession of frameSessions) {
    try {
      const { metrics } = await frameSession.session.send('Performance.getMetrics');
      const metric = (name: string) => metrics.find((item) => item.name === name)?.value ?? 0;
      const runtime = await frameSession.session.send('Runtime.evaluate', {
        expression: 'document.documentElement?.dataset.jkNav === "ready"',
        returnByValue: true,
      }) as RuntimeEvaluateResponse;
      samples.push({
        targetId: frameSession.targetId,
        url: frameSession.frame.url(),
        contentScriptReady: runtime.result?.value === true,
        scriptDuration: metric('ScriptDuration') * 1000,
        taskDuration: metric('TaskDuration') * 1000,
      });
    } finally {
      await frameSession.session.detach();
    }
  }
  return samples;
}

function verifyAfterOopifMetrics(config: Config, samples: Sample[]): void {
  if (!multiFrame || config.role !== 'after') {
    return;
  }

  const failures: string[] = [];
  samples.forEach((sample, runIndex) => {
    sample.oopifFrames?.forEach((frame, frameIndex) => {
      process.stderr.write(
        `D6 control: column=${config.name} run=${runIndex + 1} target=${frameIndex + 1} `
        + `targetId=${frame.targetId} contentScriptReady=${frame.contentScriptReady} `
        + `scriptDurationMs=${frame.scriptDuration.toFixed(3)}\n`,
      );
      if (!frame.contentScriptReady) {
        failures.push(`run ${runIndex + 1}, target ${frameIndex + 1}`);
      }
    });
  });
  if (failures.length > 0) {
    throw new Error(`D6 control failed for ${failures.join('; ')}`);
  }
}

async function keyLatency(page: Page, key: string, field: 'scroll' | 'mutation'): Promise<number> {
  const t0 = await page.evaluate(() => {
    Object.assign(window.__bench, { armed: true, scroll: 0, mutation: 0 });
    return performance.now();
  });
  await page.keyboard.press(key);
  await page.waitForFunction((f) => window.__bench[f] > 0, field, { timeout: 5000 }).catch(() => undefined);
  const t1 = await page.evaluate((f) => window.__bench[f], field);
  await page.evaluate(() => { window.__bench.armed = false; });
  return t1 ? t1 - t0 : NaN;
}

async function measure(page: Page, url: string): Promise<Sample> {
  const session = await page.context().newCDPSession(page);
  await session.send('Performance.enable');
  const frameTasks: Array<Promise<FrameMetricSession | null>> = [];
  const knownFrames = new Set<Frame>();
  const seenTargets = new Set<string>();
  const mainOrigin = new URL(url).origin;
  const browser = page.context().browser();
  if (browser === null) {
    throw new Error('A browser is required for OOPIF metrics');
  }
  if (multiFrame) {
    const browserSession = await browser.newBrowserCDPSession();
    await browserSession.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
      filter: [{ type: 'iframe' }],
    });
    const targetList = await session.send('Target.getTargets') as TargetListResponse;
    const pageTarget = targetList.targetInfos.find((target) => target.type === 'page');
    const parentFrames = new Map<string, Frame>();
    if (pageTarget !== undefined) {
      parentFrames.set(pageTarget.targetId, page.mainFrame());
    }
    session.on('Target.attachedToTarget', (event: TargetAttachedEvent) => {
      if (event.targetInfo.type !== 'iframe' || seenTargets.has(event.targetInfo.targetId)) {
        return;
      }

      seenTargets.add(event.targetInfo.targetId);
      const parentFrame = parentFrames.get(event.targetInfo.parentFrameId ?? '') ?? page.mainFrame();
      const frameTask = attachFrameMetrics(
        parentFrame,
        event.targetInfo,
        page.context(),
        mainOrigin,
        knownFrames,
        frameTasks,
      );
      frameTasks.push(frameTask);
      void frameTask.then((frameSession) => {
        if (frameSession !== null) {
          parentFrames.set(frameSession.targetId, frameSession.frame);
        }
      }).catch(() => undefined);
    });
    await session.send('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
      filter: [{ type: 'iframe' }],
    });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    const frameSessions: FrameMetricSession[] = [];
    let processedTasks = 0;
    while (processedTasks < frameTasks.length) {
      const tasks = frameTasks.slice(processedTasks);
      processedTasks += tasks.length;
      const resolved = await Promise.all(tasks);
      frameSessions.push(...resolved.filter(
        (frameSession): frameSession is FrameMetricSession => frameSession !== null,
      ));
    }
    const nav = await page.evaluate(() => {
      const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return { domContentLoaded: entry.domContentLoadedEventEnd, load: entry.loadEventEnd };
    });
    const { metrics } = await session.send('Performance.getMetrics');
    const metric = (name: string) => metrics.find((item) => item.name === name)?.value ?? 0;
    const scriptDuration = metric('ScriptDuration') * 1000;
    const taskDuration = metric('TaskDuration') * 1000;
    const oopifFrames = await collectOopifMetrics(frameSessions);
    await browserSession.send('Target.setAutoAttach', {
      autoAttach: false,
      waitForDebuggerOnStart: false,
      flatten: true,
    });
    await browserSession.detach();
    const childFrames = page.frames().filter((frame) => frame !== page.mainFrame());
    const sameOriginFrameCount = childFrames.filter((frame) => new URL(frame.url()).origin === mainOrigin).length;
    const crossOriginFrameCount = childFrames.length - sameOriginFrameCount;

    await page.locator('main').click({ position: { x: 10, y: 10 } });
    const jLatency = await keyLatency(page, 'j', 'scroll');
    await page.waitForTimeout(700);
    const jWarmLatency = await keyLatency(page, 'j', 'scroll');
    await page.waitForTimeout(700);
    const fLatency = await keyLatency(page, 'f', 'mutation');
    await page.keyboard.press('Escape');
    await session.detach();
    return {
      ...nav,
      scriptDuration,
      taskDuration,
      jLatency,
      jWarmLatency,
      fLatency,
      sameOriginFrameCount,
      crossOriginFrameCount,
      outOfProcessFrameCount: oopifFrames.length,
      oopifFrames,
    };
  }
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const nav = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return { domContentLoaded: entry.domContentLoadedEventEnd, load: entry.loadEventEnd };
  });
  const { metrics } = await session.send('Performance.getMetrics');
  const metric = (name: string) => metrics.find((item) => item.name === name)?.value ?? 0;
  const scriptDuration = metric('ScriptDuration') * 1000;
  const taskDuration = metric('TaskDuration') * 1000;

  await page.mouse.click(10, 10);
  const jLatency = await keyLatency(page, 'j', 'scroll');
  await page.waitForTimeout(700);
  const jWarmLatency = await keyLatency(page, 'j', 'scroll');
  await page.waitForTimeout(700);
  const fLatency = await keyLatency(page, 'f', 'mutation');
  await page.keyboard.press('Escape');
  await session.detach();
  return { ...nav, scriptDuration, taskDuration, jLatency, jWarmLatency, fLatency };
}

const fmt = (value: number) => (Number.isFinite(value) ? value.toFixed(1) : 'n/a');

function printTable(results: Record<string, Sample[]>): void {
  const names = Object.keys(results);
  const keys: (keyof Sample)[] = [
    'domContentLoaded',
    'load',
    'scriptDuration',
    'taskDuration',
    'jLatency',
    'jWarmLatency',
    'fLatency',
  ];
  const labels: Record<string, string> = {
    domContentLoaded: 'DOMContentLoaded, ms',
    load: 'load event, ms',
    scriptDuration: multiFrame
      ? 'top-frame renderer script time until load+500 ms, ms'
      : 'script time until load+500 ms, ms',
    taskDuration: multiFrame
      ? 'top-frame main-thread task time until load+500 ms, ms'
      : 'main-thread task time until load+500 ms, ms',
    jLatency: 'first j → first scroll event, ms',
    jWarmLatency: 'second j → first scroll event, ms',
    fLatency: 'f → first hint node, ms',
  };
  console.log(`Fixture: ${multiFrame ? `${LINKS} links, ${PARAGRAPHS} paragraphs, ${FRAME_AD_COUNT} same-origin and ${FRAME_AD_COUNT} cross-origin ad frames, 1 content frame` : `${LINKS} links, ${PARAGRAPHS} paragraphs`}; ${iterations} runs per column; median (p90).\n`);
  console.log(`| Metric | ${names.join(' | ')} |`);
  console.log(`| --- | ${names.map(() => '---').join(' | ')} |`);
  for (const key of keys) {
    const cells = names.map((name) => {
      const values = results[name]!.map((sample) => sample[key]).filter(
        (value): value is number => typeof value === 'number',
      );
      return `${fmt(quantile(values, 0.5))} (${fmt(quantile(values, 0.9))})`;
    });
    console.log(`| ${labels[key]} | ${cells.join(' | ')} |`);
  }
  if (!multiFrame) return;

  const maxFrameCount = Math.max(...Object.values(results).map((samples) =>
    Math.max(...samples.map((sample) => sample.oopifFrames?.length ?? 0)),
  ));
  for (let frameIndex = 0; frameIndex < maxFrameCount; frameIndex += 1) {
    for (const metric of ['scriptDuration', 'taskDuration'] as const) {
      const cells = names.map((name) => {
        const values = results[name]!.map((sample) => sample.oopifFrames?.[frameIndex]?.[metric] ?? NaN);
        return `${fmt(quantile(values, 0.5))} (${fmt(quantile(values, 0.9))})`;
      });
      const label = metric === 'scriptDuration'
        ? 'ScriptDuration'
        : 'task time';
      console.log(`| OOPIF target ${frameIndex + 1} ${label}, ms | ${cells.join(' | ')} |`);
    }
  }
}

function printCheck(baseline: Baseline, rows: ReturnType<typeof compareToBaseline>): void {
  console.log(`\nBaseline ${baseline.commit ?? 'unknown commit'}, recorded ${baseline.recordedAt}, `
    + `${baseline.iterations} runs; limit = max(baseline, 0) × ${1 + baseline.tolerance.ratio} + ${baseline.tolerance.floorMs} ms.\n`);
  console.log('| Metric | baseline | current | limit | status |');
  console.log('| --- | --- | --- | --- | --- |');
  for (const row of rows) {
    console.log(`| ${METRIC_LABELS[row.metric]} | ${fmt(row.baseline)} | ${fmt(row.current)} | ${fmt(row.limit)} | ${row.status} |`);
  }
}

const server = await serve();
const results: Record<string, Sample[]> = {};
let chromiumVersion = 'unknown';
const currentEnvironment = (): Environment => ({
  platform: process.platform,
  arch: process.arch,
  container: process.env.BENCH_CONTAINER === '1',
  chromium: chromiumVersion,
});
for (const config of configs) {
  const context = await launch(config);
  chromiumVersion = context.browser()?.version() ?? chromiumVersion;
  if (recordedBaseline !== null) {
    // Fail before the runs, not after minutes of measuring.
    const mismatch = environmentMismatch(recordedBaseline.environment, currentEnvironment());
    if (mismatch !== null) {
      await context.close();
      server.close();
      throw new Error(`The baseline was recorded in another environment (${mismatch}); `
        + 'run through docs/bench/docker.sh or record a new baseline');
    }
  }
  await context.waitForEvent('page', { timeout: 3000 }).catch(() => undefined); // extension welcome tabs
  const samples: Sample[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const page = await context.newPage();
    samples.push(await measure(page, server.url));
    await page.close();
  }
  await context.close();
  results[config.name] = samples;
  verifyAfterOopifMetrics(config, samples);
  process.stderr.write(`${config.name}: ${samples.length} samples\n`);
}
server.close();

printTable(results);
const outputPath = process.env.BENCH_RESULTS_PATH ?? defaultResultsPath;
if (mode === 'baseline') {
  const [control, jkNav] = configs.map((config) => results[config.name]!);
  const baseline: Baseline = {
    recordedAt: new Date().toISOString(),
    commit: process.env.BENCH_COMMIT ?? null,
    iterations,
    environment: currentEnvironment(),
    tolerance: { ratio: 0.25, floorMs: 2 },
    metrics: summarize(control!, jkNav!),
  };
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`\nBaseline written to ${path.relative(root, baselinePath)}`);
} else if (recordedBaseline !== null) {
  const [control, jkNav] = configs.map((config) => results[config.name]!);
  const rows = compareToBaseline(recordedBaseline, summarize(control!, jkNav!));
  printCheck(recordedBaseline, rows);
  const failed = rows.filter((row) => row.status === 'fail');
  if (failed.length > 0) {
    console.error(`\n${failed.length} metric(s) above the limit: ${failed.map((row) => row.metric).join(', ')}`);
    process.exit(1);
  }
  console.log('\nAll gated metrics are within the limit.');
} else if (multiFrame) {
  const multiFrameResult = {
    iterations,
    fixture: {
      sameOriginChildFrames: FRAME_AD_COUNT + 1,
      crossOriginChildFrames: FRAME_AD_COUNT,
      outOfProcessFrameTargets: FRAME_AD_COUNT,
    },
    beforeBuild: process.env.BENCH_JK_NAV_BEFORE_BUILD ?? null,
    afterBuild: process.env.BENCH_JK_NAV_AFTER_BUILD ?? null,
    oopifScriptMetric: 'Chrome Performance.ScriptDuration',
    results,
  };
  if (outputPath === defaultResultsPath && existsSync(outputPath)) {
    const existing = JSON.parse(readFileSync(outputPath, 'utf8')) as Record<string, unknown>;
    writeFileSync(outputPath, JSON.stringify({ ...existing, multiFrame: multiFrameResult }, null, 2));
  } else {
    writeFileSync(
      outputPath,
      JSON.stringify({ iterations, LINKS, PARAGRAPHS, FRAME_AD_COUNT, multiFrame: multiFrameResult }, null, 2),
    );
  }
} else {
  const existing = outputPath === defaultResultsPath && existsSync(outputPath)
    ? JSON.parse(readFileSync(outputPath, 'utf8')) as { multiFrame?: unknown }
    : {};
  writeFileSync(
    outputPath,
    JSON.stringify({
      iterations,
      LINKS,
      PARAGRAPHS,
      results,
      ...(existing.multiFrame === undefined ? {} : { multiFrame: existing.multiFrame }),
    }, null, 2),
  );
}

declare global {
  interface Window { __bench: { armed: boolean; scroll: number; mutation: number } }
}
