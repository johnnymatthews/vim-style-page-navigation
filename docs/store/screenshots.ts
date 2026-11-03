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

// A still image cannot show scrolling, so the first screenshot carries the key overlay.
await page.evaluate(() => {
  const keys = [
    ['j / k', 'scroll'],
    ['gg / G', 'top / bottom'],
    ['f', 'link hints'],
    ['H / L', 'back / forward'],
    ['Shift+J / K', 'left / right tab'],
  ];
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;right:40px;bottom:40px;z-index:2147483647;background:#1f2328;color:#fff;' +
    'padding:24px 28px;border-radius:14px;font:18px/1.5 -apple-system,Helvetica,Arial,sans-serif;' +
    'box-shadow:0 12px 40px rgba(0,0,0,.35)';
  panel.innerHTML =
    '<div style="font-size:22px;font-weight:700;margin-bottom:12px">JK Vim-Style Page/Tab Navigation</div>' +
    keys
      .map(
        ([key, what]) =>
          '<div style="display:flex;gap:16px;justify-content:space-between">' +
          `<kbd style="font:600 18px ui-monospace,Menlo,monospace;color:#ffd33d">${key}</kbd><span>${what}</span></div>`,
      )
      .join('');
  document.body.append(panel);
});
await page.screenshot({ path: path.join(outDir, 'screenshot-1-keys.png') });
await page.evaluate(() => document.body.lastElementChild?.remove());

await page.keyboard.press('f');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(outDir, 'screenshot-2-link-hints.png') });

await context.close();
