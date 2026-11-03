import { expect, test } from '@playwright/test';

import { openExtensionContext } from './extension-tabs';

test('the first inline head script sees the content script ready', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();

  try {
    // #when
    await page.goto('/early-ready.html');
    const earlyReady = await page.evaluate(() => {
      const fixtureWindow = window as typeof window & { earlyJkNavReady?: string | null };
      return fixtureWindow.earlyJkNavReady;
    });

    // #then
    expect(earlyReady).toBe('ready');
  } finally {
    await context.close();
  }
});

test('Link hints have their visible styles when first shown', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();

  try {
    await page.goto('/early-ready.html');
    await page.locator('html[data-jk-nav="ready"], #vimnav-styles').waitFor({ state: 'attached' });

    // #when
    await page.keyboard.press('f');
    const hintStyles = await page.locator('.vimnav-link-hint').evaluateAll((hints) => (
      hints.map((hint) => getComputedStyle(hint).backgroundColor)
    ));

    // #then
    expect(hintStyles).toEqual(['rgb(255, 255, 0)']);
  } finally {
    await context.close();
  }
});
