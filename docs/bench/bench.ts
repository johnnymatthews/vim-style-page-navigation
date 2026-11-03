// Benchmark: page-load overhead and key latency of jk-nav against another
// extension, in Chromium through Playwright. Memory is out of scope.
//
//   npm run build
//   BENCH_OTHER=/path/to/unpacked-extension BENCH_OTHER_NAME="Vimium C" \
//     npx tsx docs/bench/bench.ts [iterations]
//
// Prints a Markdown table and writes docs/bench/results.json.
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import http from 'node:http';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const iterations = Number(process.argv[2] ?? 20);
const LINKS = 3000;
const PARAGRAPHS = 400;

interface Config {
  name: string;
  extension?: string;
}

const configs: Config[] = [
  { name: 'no extension' },
  { name: 'jk-nav', extension: path.join(root, '.output/chrome-mv3') },
];
if (process.env.BENCH_OTHER) {
  configs.push({ name: process.env.BENCH_OTHER_NAME ?? 'other', extension: process.env.BENCH_OTHER });
}

function fixture(): string {
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

function serve(html: string): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
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

interface Sample {
  domContentLoaded: number;
  load: number;
  scriptDuration: number;
  taskDuration: number;
  jLatency: number;
  jWarmLatency: number;
  fLatency: number;
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
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  const nav = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return { domContentLoaded: entry.domContentLoadedEventEnd, load: entry.loadEventEnd };
  });
  const { metrics } = await session.send('Performance.getMetrics');
  const metric = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
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

function quantile(values: number[], q: number): number {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : 'n/a');

const html = fixture();
const server = await serve(html);
const results: Record<string, Sample[]> = {};
for (const config of configs) {
  const context = await launch(config);
  await context.waitForEvent('page', { timeout: 3000 }).catch(() => undefined); // extension welcome tabs
  const samples: Sample[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const page = await context.newPage();
    samples.push(await measure(page, server.url));
    await page.close();
  }
  await context.close();
  results[config.name] = samples;
  process.stderr.write(`${config.name}: ${samples.length} samples\n`);
}
server.close();

const keys: (keyof Sample)[] = ['domContentLoaded', 'load', 'scriptDuration', 'taskDuration', 'jLatency', 'jWarmLatency', 'fLatency'];
const labels: Record<keyof Sample, string> = {
  domContentLoaded: 'DOMContentLoaded, ms',
  load: 'load event, ms',
  scriptDuration: 'script time until load+500 ms, ms',
  taskDuration: 'main-thread task time until load+500 ms, ms',
  jLatency: 'first j → first scroll event, ms',
  jWarmLatency: 'second j → first scroll event, ms',
  fLatency: 'f → first hint node, ms',
};
const names = Object.keys(results);
console.log(`Fixture: ${LINKS} links, ${PARAGRAPHS} paragraphs; ${iterations} runs per column; median (p90).\n`);
console.log(`| Metric | ${names.join(' | ')} |`);
console.log(`| --- | ${names.map(() => '---').join(' | ')} |`);
for (const key of keys) {
  const cells = names.map((n) => {
    const v = results[n]!.map((s) => s[key]);
    return `${fmt(quantile(v, 0.5))} (${fmt(quantile(v, 0.9))})`;
  });
  console.log(`| ${labels[key]} | ${cells.join(' | ')} |`);
}
writeFileSync(path.join(root, 'docs/bench/results.json'), JSON.stringify({ iterations, LINKS, PARAGRAPHS, results }, null, 2));

declare global {
  interface Window { __bench: { armed: boolean; scroll: number; mutation: number } }
}
