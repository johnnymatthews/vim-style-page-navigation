import { expect, test, type Page } from '@playwright/test';

import { openExtensionContext, waitForContentScriptReady } from './extension-tabs';

interface ExecutionContextCreatedEvent {
  context: {
    id: number;
    origin: string;
    auxData?: {
      type?: string;
    };
  };
}

async function openHintOrderPage() {
  const context = await openExtensionContext();
  const page = await context.newPage();
  await page.goto('/hint-order.html');
  await waitForContentScriptReady(page);
  return { context, page };
}

async function readHintOffsets(page: Page) {
  return page.locator('[data-visible-target]').evaluateAll((targets) => targets.map((target) => {
    const type = (target as HTMLElement).dataset.hintType;
    const selector = type === 'link'
      ? '.vimnav-link-hint:not(.vimnav-button-hint):not(.vimnav-input-hint)'
      : `.vimnav-${type}-hint`;
    const hint = document.querySelector(selector);
    if (!(hint instanceof HTMLElement)) {
      throw new Error(`Missing ${type} hint`);
    }

    const targetRect = target.getBoundingClientRect();
    const hintRect = hint.getBoundingClientRect();
    return {
      id: target.id,
      top: hintRect.top - targetRect.top,
      left: hintRect.left - targetRect.left,
    };
  }));
}

async function deleteCheckVisibilityInContentScript(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Runtime.enable');
  const contentScriptContextId = new Promise<number>((resolve) => {
    cdp.on('Runtime.executionContextCreated', (event: ExecutionContextCreatedEvent) => {
      if (
        event.context.auxData?.type === 'isolated'
        && event.context.origin.startsWith('chrome-extension://')
      ) {
        resolve(event.context.id);
      }
    });
  });

  await page.addInitScript(() => {
    delete (Element.prototype as Partial<Element>).checkVisibility;
  });
  await page.goto('/hint-page.html');
  await waitForContentScriptReady(page);

  const contextId = await contentScriptContextId;
  const deletion = await cdp.send('Runtime.evaluate', {
    contextId,
    expression: "delete Element.prototype.checkVisibility; typeof Element.prototype.checkVisibility === 'undefined'",
    returnByValue: true,
  });
  if (deletion.result.value !== true) {
    throw new Error('checkVisibility remained available in the content-script world');
  }
}

test('shows 900 distinct two-character Link hints from ss through 44 for more than 900 visible targets', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    await page.goto('/many-targets.html');
    await waitForContentScriptReady(page);
    const targetCounts = await page.locator('a').evaluateAll((targets) => ({
      total: targets.length,
      visible: targets.filter((target) => {
        const rect = target.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
      }).length,
    }));
    expect(targetCounts).toEqual({ total: 901, visible: 901 });

    // #when
    await page.keyboard.press('f');

    // #then
    const codes = await page.locator('.vimnav-link-hint').allTextContents();
    expect({
      count: codes.length,
      first: codes[0],
      last: codes[899],
      distinct: new Set(codes).size,
      invalidCodes: codes.filter((code) => code.length !== 2),
      pageErrors,
    }).toEqual({ count: 900, first: 'ss', last: '44', distinct: 900, invalidCodes: [], pageErrors: [] });
  } finally {
    await context.close();
  }
});

test('holding f keeps every Link hint shown and activates nothing', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();

  try {
    await page.goto('/many-targets.html');
    await waitForContentScriptReady(page);

    // #when
    await page.keyboard.down('f');
    const initialVisibleHints = await page.locator('.vimnav-link-hint:visible').count();
    await page.keyboard.down('f');
    const state = {
      path: await page.evaluate(() => `${location.pathname}${location.hash}`),
      initialVisibleHints,
      visibleHints: await page.locator('.vimnav-link-hint:visible').count(),
    };
    await page.keyboard.up('f');

    // #then
    expect(state).toEqual({ path: '/many-targets.html', initialVisibleHints: 900, visibleHints: 900 });
  } finally {
    await context.close();
  }
});

test('assigns Link-hint codes in link, button, then field order', async () => {
  // #given
  const { context, page } = await openHintOrderPage();

  try {
    // #when
    await page.keyboard.press('f');
    const targetHints = await page.locator('[data-visible-target]').evaluateAll((targets) => targets.map((target) => {
      const type = (target as HTMLElement).dataset.hintType;
      const selector = type === 'link'
        ? '.vimnav-link-hint:not(.vimnav-button-hint):not(.vimnav-input-hint)'
        : `.vimnav-${type}-hint`;
      const hint = document.querySelector(selector);
      if (!(hint instanceof HTMLElement)) {
        throw new Error(`Missing ${type} hint`);
      }
      return {
        id: target.id,
        code: hint.textContent,
        buttonClass: hint.classList.contains('vimnav-button-hint'),
        inputClass: hint.classList.contains('vimnav-input-hint'),
      };
    }));

    // #then
    expect(targetHints).toEqual([
      { id: 'text-input', code: 'sf', buttonClass: false, inputClass: true },
      { id: 'action-button', code: 'sd', buttonClass: true, inputClass: false },
      { id: 'destination-link', code: 'ss', buttonClass: false, inputClass: false },
    ]);
  } finally {
    await context.close();
  }
});

test('places Link hints ten pixels above and left of visible targets', async () => {
  // #given
  const { context, page } = await openHintOrderPage();

  try {
    // #when
    await page.keyboard.press('f');
    const offsets = await readHintOffsets(page);
    const hintCount = await page.locator('.vimnav-link-hint').count();

    // #then
    expect({ hintCount, offsets }).toEqual({
      hintCount: 3,
      offsets: [
        { id: 'text-input', top: -10, left: -10 },
        { id: 'action-button', top: -10, left: -10 },
        { id: 'destination-link', top: -10, left: -10 },
      ],
    });
  } finally {
    await context.close();
  }
});

test('keeps Link hints in viewport coordinates after scrolling', async () => {
  // #given
  const { context, page } = await openHintOrderPage();

  try {
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForFunction(() => window.scrollY === 300);

    // #when
    await page.keyboard.press('f');
    const offsets = await readHintOffsets(page);
    const hintCount = await page.locator('.vimnav-link-hint').count();

    // #then
    expect({ hintCount, offsets }).toEqual({
      hintCount: 3,
      offsets: [
        { id: 'text-input', top: -10, left: -10 },
        { id: 'action-button', top: -10, left: -10 },
        { id: 'destination-link', top: -10, left: -10 },
      ],
    });
  } finally {
    await context.close();
  }
});

test('falls back when checkVisibility is unavailable', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    await deleteCheckVisibilityInContentScript(page);
    await page.evaluate(() => {
      const hiddenLink = document.createElement('a');
      hiddenLink.href = '#hidden';
      hiddenLink.textContent = 'Hidden target';
      hiddenLink.style.display = 'none';
      document.body.appendChild(hiddenLink);
    });

    // #when
    await page.keyboard.press('f');
    const hintCount = await page.locator('.vimnav-link-hint').count();

    // #then
    expect({ hintCount, pageErrors }).toEqual({ hintCount: 1, pageErrors: [] });
  } finally {
    await context.close();
  }
});

async function openAriaRolePage() {
  const context = await openExtensionContext();
  const page = await context.newPage();
  await page.goto('/aria-role-targets.html');
  await waitForContentScriptReady(page);
  return { context, page };
}

test('shows Link hints on ARIA link, checkbox, and switch controls', async () => {
  // #given
  const { context, page } = await openAriaRolePage();

  try {
    // #when
    await page.keyboard.press('f');
    const hints = await page.evaluate(() => [...document.querySelectorAll('.vimnav-link-hint')].map((hint) => {
      const rect = hint.getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + 15, rect.top + 15)?.closest('[id]');
      return {
        code: hint.textContent,
        target: target?.id,
        buttonClass: hint.classList.contains('vimnav-button-hint'),
      };
    }));

    // #then
    expect(hints).toEqual([
      { code: 'ss', target: 'open-thread', buttonClass: false },
      { code: 'sd', target: 'select', buttonClass: true },
      { code: 'sf', target: 'star', buttonClass: true },
      { code: 'sj', target: 'importance', buttonClass: true },
    ]);
  } finally {
    await context.close();
  }
});

test('activates an ARIA checkbox from its Hint code', async () => {
  // #given
  const { context, page } = await openAriaRolePage();

  try {
    // #when
    await page.keyboard.press('f');
    await page.keyboard.press('s');
    await page.keyboard.press('d');

    // #then
    await expect(page.locator('#select')).toHaveAttribute('aria-checked', 'true');
  } finally {
    await context.close();
  }
});

test('activates an ARIA link from its Hint code', async () => {
  // #given
  const { context, page } = await openAriaRolePage();

  try {
    // #when
    await page.keyboard.press('f');
    await page.keyboard.press('s');
    await page.keyboard.press('s');

    // #then
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#thread');
  } finally {
    await context.close();
  }
});

async function openNativeControlPage() {
  const context = await openExtensionContext();
  const page = await context.newPage();
  await page.goto('/native-controls.html');
  await waitForContentScriptReady(page);
  return { context, page };
}

test('toggles a native checkbox from its Hint code', async () => {
  // #given
  const { context, page } = await openNativeControlPage();

  try {
    // #when
    await page.keyboard.press('f');
    await page.keyboard.press('s');
    await page.keyboard.press('s');

    // #then
    await expect(page.locator('#checkbox')).toBeChecked();
  } finally {
    await context.close();
  }
});

test('selects a native radio button from its Hint code', async () => {
  // #given
  const { context, page } = await openNativeControlPage();

  try {
    // #when
    await page.keyboard.press('f');
    await page.keyboard.press('s');
    await page.keyboard.press('d');

    // #then
    await expect(page.locator('#radio')).toBeChecked();
  } finally {
    await context.close();
  }
});

test('focuses a slider from its Hint code without changing its value', async () => {
  // #given
  const { context, page } = await openNativeControlPage();

  try {
    // #when
    await page.keyboard.press('f');
    await page.keyboard.press('s');
    await page.keyboard.press('f');

    // #then
    const slider = await page.evaluate(() => {
      const range = document.getElementById('range') as HTMLInputElement;
      return { focused: document.activeElement === range, value: range.value };
    });
    expect(slider).toEqual({ focused: true, value: '50' });
  } finally {
    await context.close();
  }
});

test('activates a button that acts on mouse press from its Hint code', async () => {
  // #given
  const context = await openExtensionContext();
  const page = await context.newPage();

  try {
    await page.goto('/mouse-press-button.html');
    await waitForContentScriptReady(page);

    // #when
    await page.keyboard.press('f');
    await page.keyboard.press('s');
    await page.keyboard.press('s');

    // #then
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#inbox');
  } finally {
    await context.close();
  }
});
