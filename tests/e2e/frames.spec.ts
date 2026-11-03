import { expect, test, type FrameLocator, type Page } from '@playwright/test';

import {
  activateTab,
  createTestWindow,
  extensionServiceWorker,
  openExtensionContext,
  pageForUrl,
  queryActiveTabId,
  waitForContentScriptReady,
} from './extension-tabs';

type FrameMode = 'cross-origin' | 'locked' | 'overlap' | 'short' | 'srcdoc' | 'tall';

interface FramePage {
  frame: FrameLocator;
  page: Page;
}

async function openFramePage(page: Page, mode: FrameMode): Promise<FramePage> {
  await page.goto(`/frame-host.html?mode=${mode}`);
  await waitForContentScriptReady(page);
  const frame = page.frameLocator('#content-frame');
  await frame.locator('#focus-target').waitFor();
  await expect.poll(() => frame.locator('html').getAttribute('data-jk-nav')).toBe('ready');
  return { frame, page };
}

async function focusFrame(frame: FrameLocator): Promise<void> {
  await frame.locator('#focus-target').focus();
}

async function frameScrollY(frame: FrameLocator): Promise<number> {
  return frame.locator('html').evaluate(() => window.scrollY);
}

test('j scrolls a tall focused frame without scrolling the top document', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();

  try {
    const { frame } = await openFramePage(page, 'tall');
    await focusFrame(frame);

    // #when
    await page.keyboard.press('j');
    await expect.poll(() => frameScrollY(frame)).toBe(200);

    // #then
    expect({
      frameScrollY: await frameScrollY(frame),
      topScrollY: await page.evaluate(() => window.scrollY),
    }).toEqual({ frameScrollY: 200, topScrollY: 0 });
  } finally {
    await context.close();
  }
});

test('j scrolls a cross-origin focused frame without scrolling the top document', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();

  try {
    const { frame } = await openFramePage(page, 'cross-origin');
    await focusFrame(frame);

    // #when
    await page.keyboard.press('j');
    await expect.poll(() => frameScrollY(frame)).toBe(200);

    // #then
    expect({
      frameScrollY: await frameScrollY(frame),
      topScrollY: await page.evaluate(() => window.scrollY),
    }).toEqual({ frameScrollY: 200, topScrollY: 0 });
  } finally {
    await context.close();
  }
});

test('f in a focused frame shows a Link hint beside its link', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();

  try {
    const { frame } = await openFramePage(page, 'tall');
    await focusFrame(frame);

    // #when
    await page.keyboard.press('f');

    // #then
    await expect(frame.locator('.vimnav-link-hint:not(.vimnav-button-hint):not(.vimnav-input-hint)')).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test('j with focus in the top document scrolls only the top document', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();

  try {
    const { frame } = await openFramePage(page, 'tall');
    await page.locator('#top-focus').focus();

    // #when
    await page.keyboard.press('j');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(200);

    // #then
    expect({
      topScrollY: await page.evaluate(() => window.scrollY),
      frameScrollY: await frameScrollY(frame),
    }).toEqual({ topScrollY: 200, frameScrollY: 0 });
  } finally {
    await context.close();
  }
});

test('Shift+K from a focused frame activates the right tab', async ({ baseURL }) => {
  // #given
  const context = await openExtensionContext();

  try {
    const worker = await extensionServiceWorker(context);
    const urls = [
      `${baseURL}/frame-host.html?mode=tall&tab=frame`,
      `${baseURL}/tall-page.html?tab=right`,
    ];
    const testWindow = await createTestWindow(worker, urls);
    const frameTabId = testWindow.tabIds[0]!;
    const rightTabId = testWindow.tabIds[1]!;
    await activateTab(worker, frameTabId);
    const page = await pageForUrl(context, urls[0]!);
    const frame = page.frameLocator('#content-frame');
    await frame.locator('#focus-target').waitFor();
    await focusFrame(frame);

    // #when
    await page.keyboard.press('Shift+K');

    // #then
    await expect.poll(() => queryActiveTabId(worker, testWindow.windowId)).toBe(rightTabId);
  } finally {
    await context.close();
  }
});

test('j in a short frame scrolls the top document one step', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();

  try {
    const { frame } = await openFramePage(page, 'short');
    await focusFrame(frame);

    // #when
    await page.keyboard.press('j');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(200);

    // #then
    expect({
      topScrollY: await page.evaluate(() => window.scrollY),
      frameScrollY: await frameScrollY(frame),
    }).toEqual({ topScrollY: 200, frameScrollY: 0 });
  } finally {
    await context.close();
  }
});

test('j in a tall frame with body overflow hidden scrolls only the top document', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();

  try {
    const { frame } = await openFramePage(page, 'locked');
    await focusFrame(frame);

    // #when
    await page.keyboard.press('j');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(200);

    // #then
    expect({
      bodyOverflowY: await frame.locator('body').evaluate((body) => getComputedStyle(body).overflowY),
      contentIsTallerThanFrame: await frame.locator('html').evaluate(
        (html) => html.scrollHeight > html.clientHeight,
      ),
      frameScrollY: await frameScrollY(frame),
      htmlOverflowY: await frame.locator('html').evaluate((html) => getComputedStyle(html).overflowY),
      topScrollY: await page.evaluate(() => window.scrollY),
    }).toEqual({
      bodyOverflowY: 'hidden',
      contentIsTallerThanFrame: true,
      frameScrollY: 0,
      htmlOverflowY: 'visible',
      topScrollY: 200,
    });
  } finally {
    await context.close();
  }
});

test('holding j in a short frame continuously scrolls the top document and release stops it', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();

  try {
    const { frame } = await openFramePage(page, 'short');
    await focusFrame(frame);

    // #when
    await page.keyboard.down('j');
    await page.keyboard.down('j');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
    const positionDuringHold = await page.evaluate(() => window.scrollY);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(positionDuringHold);
    await page.keyboard.up('j');
    await expect.poll(async () => {
      const firstPosition = await page.evaluate(() => window.scrollY);
      await page.waitForTimeout(100);
      const secondPosition = await page.evaluate(() => window.scrollY);
      return secondPosition - firstPosition;
    }, { timeout: 2_000 }).toBe(0);
    const positionAtRest = await page.evaluate(() => window.scrollY);
    const maximumScrollPosition = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    await page.waitForTimeout(300);

    // #then
    expect({
      frameScrollY: await frameScrollY(frame),
      positionAtRest,
      positionAfterRelease: await page.evaluate(() => window.scrollY),
      restedBeforeDocumentBottom: positionAtRest < maximumScrollPosition,
    }).toEqual({
      frameScrollY: 0,
      positionAtRest,
      positionAfterRelease: positionAtRest,
      restedBeforeDocumentBottom: true,
    });
  } finally {
    await context.close();
  }
});

test('release stops forwarded scrolling after the source frame is removed', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();

  try {
    const { frame } = await openFramePage(page, 'short');
    await focusFrame(frame);
    await page.keyboard.down('j');
    await page.keyboard.down('j');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);

    // #when
    await page.locator('#content-frame').evaluate((iframe) => iframe.remove());
    await page.keyboard.up('j');
    let positionAtRest: number | null = null;
    const restDeadline = Date.now() + 2_000;
    while (Date.now() < restDeadline) {
      const firstPosition = await page.evaluate(() => window.scrollY);
      await page.waitForTimeout(100);
      const secondPosition = await page.evaluate(() => window.scrollY);
      if (secondPosition === firstPosition) {
        positionAtRest = secondPosition;
        break;
      }
    }
    const maximumScrollPosition = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    await page.waitForTimeout(300);

    // #then
    expect({
      positionAfterRest: await page.evaluate(() => window.scrollY),
      positionAtRest,
      restedBeforeDocumentBottom:
        positionAtRest !== null && positionAtRest < maximumScrollPosition,
      stoppedWithinBound: positionAtRest !== null,
    }).toEqual({
      positionAfterRest: positionAtRest,
      positionAtRest,
      restedBeforeDocumentBottom: true,
      stoppedWithinBound: true,
    });
  } finally {
    await context.close();
  }
});

test('releasing overlapping j and k holds stops forwarded and frame scroll loops', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();

  try {
    const { frame } = await openFramePage(page, 'overlap');
    await focusFrame(frame);
    await frame.locator('html').evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const frameBottom = await frameScrollY(frame);

    await page.keyboard.down('j');
    await page.keyboard.down('j');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);

    await page.keyboard.down('k');
    await page.keyboard.down('k');
    await expect.poll(async () => frameBottom - await frameScrollY(frame)).toBeGreaterThan(200);

    // #when
    let topPositionAtOverlapRest: number | null = null;
    const overlapRestDeadline = Date.now() + 2_000;
    while (Date.now() < overlapRestDeadline) {
      const firstPosition = await page.evaluate(() => window.scrollY);
      await page.waitForTimeout(100);
      const secondPosition = await page.evaluate(() => window.scrollY);
      if (secondPosition === firstPosition) {
        topPositionAtOverlapRest = secondPosition;
        break;
      }
    }
    const framePositionAtOverlapRest = await frameScrollY(frame);
    await page.waitForTimeout(300);
    const positionsAfterOverlapObservation = {
      frame: await frameScrollY(frame),
      top: await page.evaluate(() => window.scrollY),
    };

    await page.keyboard.up('j');
    await page.keyboard.up('k');
    await expect.poll(async () => {
      const firstPosition = await page.evaluate(() => window.scrollY);
      await page.waitForTimeout(100);
      const secondPosition = await page.evaluate(() => window.scrollY);
      return secondPosition - firstPosition;
    }, { timeout: 2_000 }).toBe(0);
    const positionsAtRest = {
      frame: await frameScrollY(frame),
      top: await page.evaluate(() => window.scrollY),
    };
    const maximumPositions = {
      frame: await frame.locator('html').evaluate(
        () => document.documentElement.scrollHeight - window.innerHeight,
      ),
      top: await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight),
    };
    await page.waitForTimeout(300);

    // #then
    expect({
      framePositionAtRest: positionsAtRest.frame,
      framePositionAfterRelease: await frameScrollY(frame),
      frameMovedDuringOverlap: positionsAfterOverlapObservation.frame < framePositionAtOverlapRest,
      frameStoppedBeforeEdge: positionsAtRest.frame > 0 && positionsAtRest.frame < maximumPositions.frame,
      topPositionAtRest: positionsAtRest.top,
      topPositionAfterRelease: await page.evaluate(() => window.scrollY),
      topStoppedWhileFrameScrolled:
        topPositionAtOverlapRest !== null &&
        topPositionAtOverlapRest > 0 &&
        topPositionAtOverlapRest < maximumPositions.top &&
        positionsAfterOverlapObservation.top === topPositionAtOverlapRest,
      topStoppedBeforeEdge: positionsAtRest.top > 0 && positionsAtRest.top < maximumPositions.top,
    }).toEqual({
      framePositionAtRest: positionsAtRest.frame,
      framePositionAfterRelease: positionsAtRest.frame,
      frameMovedDuringOverlap: true,
      frameStoppedBeforeEdge: true,
      topPositionAtRest: positionsAtRest.top,
      topPositionAfterRelease: positionsAtRest.top,
      topStoppedWhileFrameScrolled: true,
      topStoppedBeforeEdge: true,
    });
  } finally {
    await context.close();
  }
});

test('j at the bottom of a tall frame scrolls the top document one step', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();

  try {
    const { frame } = await openFramePage(page, 'tall');
    await focusFrame(frame);
    await frame.locator('html').evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const frameBottom = await frameScrollY(frame);

    // #when
    await page.keyboard.press('j');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(200);

    // #then
    expect({
      topScrollY: await page.evaluate(() => window.scrollY),
      frameScrollY: await frameScrollY(frame),
    }).toEqual({ topScrollY: 200, frameScrollY: frameBottom });
  } finally {
    await context.close();
  }
});

test('a synthetic j in a short frame cannot scroll the top document', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();

  try {
    const { frame } = await openFramePage(page, 'short');
    await focusFrame(frame);

    // #when
    await frame.locator('body').evaluate((body) => {
      body.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'KeyJ',
        key: 'j',
      }));
    });
    await page.waitForTimeout(100);
    const positionAfterSyntheticKey = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('j');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(200);

    // #then
    expect({
      positionAfterSyntheticKey,
      positionAfterTrustedKey: await page.evaluate(() => window.scrollY),
    }).toEqual({ positionAfterSyntheticKey: 0, positionAfterTrustedKey: 200 });
  } finally {
    await context.close();
  }
});

test('j scrolls a script-created srcdoc frame', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();

  try {
    const { frame } = await openFramePage(page, 'srcdoc');
    await focusFrame(frame);

    // #when
    await page.keyboard.press('j');
    await expect.poll(() => frameScrollY(frame)).toBe(200);

    // #then
    expect({
      frameScrollY: await frameScrollY(frame),
      topScrollY: await page.evaluate(() => window.scrollY),
    }).toEqual({ frameScrollY: 200, topScrollY: 0 });
  } finally {
    await context.close();
  }
});
