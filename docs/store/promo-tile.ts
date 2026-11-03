// Builds the Chrome Web Store small promo tile (440×280): the key panel from
// screenshot 1 on its own. Run: npx tsx docs/store/promo-tile.ts
// Then: magick docs/store/promo-small-440x280.png -alpha off -type TrueColor PNG24:docs/store/promo-small-440x280.png
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const outFile = path.join(root, 'docs/store/promo-small-440x280.png');

const keys = [
  ['j / k', 'scroll'],
  ['gg / G', 'top / bottom'],
  ['f', 'link hints'],
  ['H / L', 'back / forward'],
  ['Shift+J / K', 'left / right tab'],
];

const html = `<!doctype html><html><body style="margin:0;width:440px;height:280px;background:#1f2328;color:#fff;
font:16px/1.5 -apple-system,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center">
<div style="width:376px">
<div style="font-size:21px;font-weight:700;margin-bottom:10px">JK Vim-Style Page/Tab Navigation</div>
${keys
  .map(
    ([key, what]) =>
      '<div style="display:flex;justify-content:space-between">' +
      `<kbd style="font:600 17px ui-monospace,Menlo,monospace;color:#ffd33d">${key}</kbd><span>${what}</span></div>`,
  )
  .join('')}
</div></body></html>`;

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: outFile });
await browser.close();
