import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { openExtensionContext, waitForContentScriptReady } from './extension-tabs';

type ScrollKey = 'j' | 'k';

interface ExtensionPage {
  context: BrowserContext;
  page: Page;
}

interface ExtensionPageOptions {
  reducedMotion?: 'reduce';
}

interface ScrollTraceWindow extends Window {
  scrollPositions?: number[];
}

const RELEASE_CASES = [
  { name: 'plain KeyJ', key: 'j', code: 'KeyJ', keyValue: 'j', shiftKey: false },
  { name: 'shifted KeyJ', key: 'j', code: 'KeyJ', keyValue: 'J', shiftKey: true },
  { name: 'plain KeyK', key: 'k', code: 'KeyK', keyValue: 'k', shiftKey: false },
  { name: 'shifted KeyK', key: 'k', code: 'KeyK', keyValue: 'K', shiftKey: true },
] as const;

async function openExtensionPage(options: ExtensionPageOptions = {}): Promise<ExtensionPage> {
  const context = await openExtensionContext();
  const page = await context.newPage();
  if (options.reducedMotion !== undefined) {
    await page.emulateMedia({ reducedMotion: options.reducedMotion });
  }
  await page.goto('/tall-page.html');
  await waitForContentScriptReady(page);
  return { context, page };
}

async function startContinuousScroll(page: Page, key: ScrollKey = 'j'): Promise<void> {
  const initialPosition = key === 'j' ? 0 : 2400;
  await page.evaluate((position) => window.scrollTo(0, position), initialPosition);
  await page.waitForFunction((position) => window.scrollY === position, initialPosition);
  await page.keyboard.down(key);
  await page.keyboard.down(key);
  await page.waitForFunction(({ direction, position }) => (
    direction === 'j' ? window.scrollY >= position + 400 : window.scrollY <= position - 400
  ), { direction: key, position: initialPosition });
  const positionAfterRepeat = await page.evaluate(() => window.scrollY);
  if (key === 'j') {
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(positionAfterRepeat);
  } else {
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(positionAfterRepeat);
  }
}

async function installScrollTrace(page: Page): Promise<void> {
  await page.evaluate(() => {
    const tracedWindow = window as ScrollTraceWindow;
    tracedWindow.scrollPositions = [];
    window.addEventListener('scroll', () => {
      tracedWindow.scrollPositions?.push(window.scrollY);
    });
  });
}

async function readScrollTrace(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as ScrollTraceWindow).scrollPositions ?? []);
}

async function observeScrollPositionAfterFirstFrame(page: Page, key: ScrollKey): Promise<number> {
  return page.evaluate((pressedKey) => new Promise<number>((resolve) => {
    const code = pressedKey === 'j' ? 'KeyJ' : 'KeyK';
    document.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code,
      key: pressedKey,
    }));
    document.dispatchEvent(new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      code,
      key: pressedKey,
    }));
    requestAnimationFrame(() => resolve(window.scrollY));
  }), key);
}

async function openFirstFramePage(): Promise<ExtensionPage> {
  const context = await openExtensionContext();
  const page = await context.newPage();
  await page.goto('/tall-page.html');
  await page.locator('html[data-jk-nav="ready"], #vimnav-styles').waitFor({ state: 'attached' });
  return { context, page };
}

test('KeyJ moves down during the first animation frame', async () => {
  // #given
  const { context, page } = await openFirstFramePage();

  try {
    // #when
    const positionAfterFirstFrame = await observeScrollPositionAfterFirstFrame(page, 'j');

    // #then
    expect(positionAfterFirstFrame).toBeGreaterThanOrEqual(1);
  } finally {
    await context.close();
  }
});

test('KeyK moves up during the first animation frame', async () => {
  // #given
  const { context, page } = await openFirstFramePage();

  try {
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForFunction(() => window.scrollY === 300);

    // #when
    const positionAfterFirstFrame = await observeScrollPositionAfterFirstFrame(page, 'k');

    // #then
    expect(positionAfterFirstFrame).toBeLessThanOrEqual(299);
  } finally {
    await context.close();
  }
});

test('one KeyJ tap scrolls down exactly one step and then stays still', async () => {
  // #given
  const { context, page } = await openExtensionPage();

  try {
    await installScrollTrace(page);

    // #when
    await page.keyboard.press('j');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(200);
    const settledPosition = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(100);
    const positionAfterSettling = await page.evaluate(() => window.scrollY);
    const scrollPositions = await readScrollTrace(page);

    // #then
    expect({
      settledPosition,
      positionAfterSettling,
      hasIntermediatePosition: scrollPositions.some((position) => position > 0 && position < 200),
    }).toEqual({
      settledPosition: 200,
      positionAfterSettling: 200,
      hasIntermediatePosition: true,
    });
  } finally {
    await context.close();
  }
});

test('one KeyK tap scrolls up exactly one step', async () => {
  // #given
  const { context, page } = await openExtensionPage();

  try {
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForFunction(() => window.scrollY === 300);

    // #when
    await page.keyboard.press('k');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(100);
    const settledPosition = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(100);
    const positionAfterSettling = await page.evaluate(() => window.scrollY);

    // #then
    expect({ settledPosition, positionAfterSettling }).toEqual({
      settledPosition: 100,
      positionAfterSettling: 100,
    });
  } finally {
    await context.close();
  }
});

test('two KeyJ taps within 30 ms settle at two steps', async () => {
  // #given
  const { context, page } = await openExtensionPage();

  try {
    // #when
    await page.keyboard.press('j');
    await page.waitForTimeout(10);
    await page.keyboard.press('j');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
    const settledPosition = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(100);
    const positionAfterSettling = await page.evaluate(() => window.scrollY);

    // #then
    expect({ settledPosition, positionAfterSettling }).toEqual({
      settledPosition: 400,
      positionAfterSettling: 400,
    });
  } finally {
    await context.close();
  }
});

test('KeyG after a KeyJ tap reaches the bottom and stays there', async () => {
  // #given
  const { context, page } = await openExtensionPage();

  try {
    const maximumPosition = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);

    // #when
    await page.keyboard.press('j');
    await page.keyboard.press('Shift+g');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(maximumPosition);
    await page.waitForTimeout(100);
    const positionAfterSettling = await page.evaluate(() => window.scrollY);

    // #then
    expect(positionAfterSettling).toBe(maximumPosition);
  } finally {
    await context.close();
  }
});

test('KeyG KeyG after a KeyK tap reaches the top and stays there', async () => {
  // #given
  const { context, page } = await openExtensionPage();

  try {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const maximumPosition = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    await page.waitForFunction((position) => window.scrollY === position, maximumPosition);

    // #when
    await page.keyboard.press('k');
    await page.keyboard.press('g');
    await page.keyboard.press('g');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await page.waitForTimeout(100);
    const positionAfterSettling = await page.evaluate(() => window.scrollY);

    // #then
    expect(positionAfterSettling).toBe(0);
  } finally {
    await context.close();
  }
});

test('entering Link-hint mode stops a pending KeyJ step', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();
  await page.goto('/hint-page.html');
  await page.addStyleTag({ content: 'body { min-height: 4000px; }' });
  await waitForContentScriptReady(page);

  try {
    // #when
    await page.keyboard.press('j');
    await page.keyboard.press('f');
    await expect(page.locator('.vimnav-link-hint')).toHaveCount(1);
    const positionWhenHintsShown = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(150);
    const positionWhileHintsShown = await page.evaluate(() => window.scrollY);

    // #then
    expect(positionWhileHintsShown).toBe(positionWhenHintsShown);
  } finally {
    await context.close();
  }
});

test('reduced motion makes one KeyJ tap instant', async () => {
  // #given
  const { context, page } = await openExtensionPage({ reducedMotion: 'reduce' });

  try {
    await installScrollTrace(page);

    // #when
    await page.keyboard.press('j');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(200);
    await page.waitForTimeout(100);
    const scrollPositions = await readScrollTrace(page);
    const finalPosition = await page.evaluate(() => window.scrollY);

    // #then
    expect({ uniquePositions: [...new Set(scrollPositions)], finalPosition }).toEqual({
      uniquePositions: [200],
      finalPosition: 200,
    });
  } finally {
    await context.close();
  }
});

test('a KeyJ tap settles exactly on a page with CSS smooth scrolling', async () => {
  // #given
  const { context, page } = await openExtensionPage();

  try {
    await page.addStyleTag({ content: 'html { scroll-behavior: smooth; }' });

    // #when
    await page.keyboard.press('j');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(200);
    const settledPosition = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(100);
    const positionAfterSettling = await page.evaluate(() => window.scrollY);

    // #then
    expect({ settledPosition, positionAfterSettling }).toEqual({
      settledPosition: 200,
      positionAfterSettling: 200,
    });
  } finally {
    await context.close();
  }
});

test('keyup stops Continuous scroll at once on a page with CSS smooth scrolling', async () => {
  // #given
  const { context, page } = await openExtensionPage();

  try {
    await page.addStyleTag({ content: 'html { scroll-behavior: smooth; }' });
    await startContinuousScroll(page);

    // #when
    await page.keyboard.up('j');
    const positionAtRelease = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(50);
    const positionAfterRelease = await page.evaluate(() => window.scrollY);

    // #then
    expect(positionAfterRelease).toBe(positionAtRelease);
  } finally {
    await context.close();
  }
});

test('a repeated KeyJ keydown starts Continuous scroll', async () => {
  // #given
  const { context, page } = await openExtensionPage();

  try {
    await page.keyboard.down('j');

    // #when
    await page.keyboard.down('j');
    await page.waitForFunction(() => window.scrollY >= 400);
    const positionAfterRepeat = await page.evaluate(() => window.scrollY);

    // #then
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(positionAfterRepeat);
  } finally {
    await context.close();
  }
});

for (const keyCase of RELEASE_CASES) {
  test(`${keyCase.name} keyup stops Continuous scroll`, async () => {
    // #given
    const { context, page } = await openExtensionPage();

    try {
      await startContinuousScroll(page, keyCase.key);

      // #when
      await page.evaluate(({ code, keyValue, shiftKey }) => {
        document.dispatchEvent(new KeyboardEvent('keyup', {
          bubbles: true,
          code,
          key: keyValue,
          shiftKey,
        }));
      }, keyCase);
      const positionAtRelease = await page.evaluate(() => window.scrollY);
      await page.waitForTimeout(50);

      // #then
      if (keyCase.key === 'j') {
        const maximumPosition = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
        expect(positionAtRelease).toBeLessThan(maximumPosition);
      } else {
        expect(positionAtRelease).toBeGreaterThan(0);
      }
      expect(await page.evaluate(() => window.scrollY)).toBe(positionAtRelease);
    } finally {
      await context.close();
    }
  });
}

test('window blur stops Continuous scroll', async () => {
  // #given
  const { context, page } = await openExtensionPage();

  try {
    await startContinuousScroll(page);

    // #when
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const positionAtBlur = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(50);

    // #then
    const maximumPosition = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(positionAtBlur).toBeLessThan(maximumPosition);
    expect(await page.evaluate(() => window.scrollY)).toBe(positionAtBlur);
  } finally {
    await context.close();
  }
});
