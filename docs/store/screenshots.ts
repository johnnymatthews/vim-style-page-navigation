// Builds the store screenshots (1280×800) with the built Chrome package.
// Run after `npm run build`: npx tsx docs/store/screenshots.ts
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const extensionPath = path.join(root, '.output/chrome-mv3');
const outDir = path.join(root, 'docs/store');
const article = 'https://en.wikipedia.org/wiki/Vim_(text_editor)';

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
const page = await context.newPage();
await page.goto(article, { waitUntil: 'networkidle' });
await page.mouse.click(640, 400);

await page.keyboard.press('j');
await page.waitForTimeout(600);
await page.screenshot({ path: path.join(outDir, 'screenshot-1-scroll.png') });

await page.keyboard.press('f');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(outDir, 'screenshot-2-link-hints.png') });

await context.close();
