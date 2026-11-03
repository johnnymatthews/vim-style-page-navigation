import { expect, test, type Page } from '@playwright/test';

import { openExtensionContext, waitForContentScriptReady } from './extension-tabs';

async function withFormPage(run: (page: Page) => Promise<void>): Promise<void> {
  const context = await openExtensionContext();

  try {
    const page = await context.newPage();
    await page.goto('/form-controls.html');
    await waitForContentScriptReady(page);
    await run(page);
  } finally {
    await context.close();
  }
}

async function withDesignModePage(run: (page: Page) => Promise<void>): Promise<void> {
  const context = await openExtensionContext();

  try {
    const page = await context.newPage();
    await page.goto('/design-mode.html');
    await waitForContentScriptReady(page);
    await run(page);
  } finally {
    await context.close();
  }
}

test('j scrolls after clicking a button', async () => {
  await withFormPage(async (page) => {
    // #given
    await page.locator('#button').click();

    // #when
    await page.keyboard.press('j');

    // #then
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 1000 }).toBe(200);
  });
});

for (const control of [
  { name: 'checkbox', selector: '#checkbox' },
  { name: 'radio button', selector: '#radio' },
] as const) {
  test(`j scrolls after clicking a ${control.name}`, async () => {
    await withFormPage(async (page) => {
      // #given
      await page.locator(control.selector).click();

      // #when
      await page.keyboard.press('j');

      // #then
      await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 1000 }).toBe(200);
    });
  });
}

test('j scrolls with a slider focused', async () => {
  await withFormPage(async (page) => {
    // #given
    await page.locator('#range').focus();

    // #when
    await page.keyboard.press('j');

    // #then
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 1000 }).toBe(200);
  });
});

test('typing navigation keys in a search field changes only its value', async () => {
  await withFormPage(async (page) => {
    // #given
    const search = page.locator('#search');
    await search.focus();

    // #when
    await page.keyboard.type('jkJKf');

    // #then
    expect({
      value: await search.inputValue(),
      scrollY: await page.evaluate(() => window.scrollY),
      linkHints: await page.locator('.vimnav-link-hint').count(),
    }).toEqual({ value: 'jkJKf', scrollY: 0, linkHints: 0 });
  });
});

test('navigation keys stay silent with a number field focused', async () => {
  await withFormPage(async (page) => {
    // #given
    await page.locator('#number').focus();

    // #when
    await page.keyboard.type('jf');

    // #then
    expect({
      scrollY: await page.evaluate(() => window.scrollY),
      linkHints: await page.locator('.vimnav-link-hint').count(),
    }).toEqual({ scrollY: 0, linkHints: 0 });
  });
});

test('navigation keys stay silent with a date field focused', async () => {
  await withFormPage(async (page) => {
    // #given
    await page.locator('#date').focus();

    // #when
    await page.keyboard.type('jf');

    // #then
    expect({
      scrollY: await page.evaluate(() => window.scrollY),
      linkHints: await page.locator('.vimnav-link-hint').count(),
    }).toEqual({ scrollY: 0, linkHints: 0 });
  });
});

test('typing navigation keys in a text area changes only its value', async () => {
  await withFormPage(async (page) => {
    // #given
    const textarea = page.locator('#textarea');
    await textarea.focus();

    // #when
    await page.keyboard.type('jkJKf');

    // #then
    expect({
      value: await textarea.inputValue(),
      scrollY: await page.evaluate(() => window.scrollY),
      linkHints: await page.locator('.vimnav-link-hint').count(),
    }).toEqual({ value: 'jkJKf', scrollY: 0, linkHints: 0 });
  });
});

test('typing navigation keys in editable content changes only its text', async () => {
  await withFormPage(async (page) => {
    // #given
    const editable = page.locator('#editable');
    await editable.focus();

    // #when
    await page.keyboard.type('jkJKf');

    // #then
    expect({
      text: await editable.textContent(),
      scrollY: await page.evaluate(() => window.scrollY),
      linkHints: await page.locator('.vimnav-link-hint').count(),
    }).toEqual({ text: 'jkJKf', scrollY: 0, linkHints: 0 });
  });
});

test('j scrolls with a non-editable widget inside editable content focused', async () => {
  await withFormPage(async (page) => {
    // #given
    await page.locator('#non-editable-widget').focus();

    // #when
    await page.keyboard.press('j');

    // #then
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 1000 }).toBe(200);
    expect(await page.evaluate(() => window.scrollY)).toBe(200);
  });
});

for (const editableChild of [
  { name: 'no contenteditable attribute', selector: '#editable-child-unset' },
  { name: 'contenteditable="inherit"', selector: '#editable-child-inherit' },
  { name: 'an invalid contenteditable value', selector: '#editable-child-invalid' },
] as const) {
  test(`j stays Typing in an editor child with ${editableChild.name}`, async () => {
    await withFormPage(async (page) => {
      // #given
      const child = page.locator(editableChild.selector);
      await child.focus();
      await child.selectText();

      // #when
      await page.keyboard.press('j');
      await page.waitForTimeout(200);

      // #then
      expect({
        text: await child.textContent(),
        scrollY: await page.evaluate(() => window.scrollY),
      }).toEqual({ text: 'j', scrollY: 0 });
    });
  });
}

test('j scrolls when the top document is not in designMode', async () => {
  await withDesignModePage(async (page) => {
    // #given
    const editor = page.locator('#editor');

    // #when
    await page.keyboard.press('j');

    // #then
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 1000 }).toBe(200);
    expect({
      text: await editor.textContent(),
      scrollY: await page.evaluate(() => window.scrollY),
    }).toEqual({ text: 'start', scrollY: 200 });
  });
});

test('j stays Typing while the top document is in designMode', async () => {
  await withDesignModePage(async (page) => {
    // #given
    const editor = page.locator('#editor');
    await page.evaluate(() => {
      document.designMode = 'on';
      const target = document.querySelector('#editor');
      if (!target) {
        throw new Error('The designMode fixture has no editor');
      }
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    // #when
    await page.keyboard.press('j');
    await page.waitForTimeout(200);

    // #then
    expect({
      text: await editor.textContent(),
      scrollY: await page.evaluate(() => window.scrollY),
    }).toEqual({ text: 'startj', scrollY: 0 });
  });
});

test('j typed in an editable iframe changes its text without scrolling either document', async () => {
  // #given
  const context = await openExtensionContext();

  try {
    const page = await context.newPage();
    await page.goto('/frame-host.html?mode=editor');
    await waitForContentScriptReady(page);
    const frame = page.frameLocator('#content-frame');
    const editor = frame.locator('#editor');
    await editor.waitFor();
    const editableBody = frame.locator('body');
    await editableBody.focus();
    await editor.evaluate((target) => {
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    // #when
    await editableBody.press('j');
    await page.waitForTimeout(200);

    // #then
    expect({
      text: await editor.textContent(),
      frameScrollY: await frame.locator('html').evaluate(() => window.scrollY),
      topScrollY: await page.evaluate(() => window.scrollY),
    }).toEqual({ text: 'startj', frameScrollY: 0, topScrollY: 0 });
  } finally {
    await context.close();
  }
});

test('typing navigation keys in an open shadow root text field changes only its value', async () => {
  await withFormPage(async (page) => {
    // #given
    const shadowInput = page.locator('shadow-text-field input');
    await shadowInput.focus();

    // #when
    await page.keyboard.type('jkJKf');

    // #then
    expect({
      value: await shadowInput.inputValue(),
      scrollY: await page.evaluate(() => window.scrollY),
      linkHints: await page.locator('.vimnav-link-hint').count(),
    }).toEqual({ value: 'jkJKf', scrollY: 0, linkHints: 0 });
  });
});

test('a focused drop-down keeps type-to-select and does not scroll', async () => {
  await withFormPage(async (page) => {
    // #given
    const select = page.locator('#select');
    await select.focus();

    // #when
    await page.keyboard.press('j');
    await page.waitForTimeout(200);

    // #then
    expect({
      value: await select.inputValue(),
      scrollY: await page.evaluate(() => window.scrollY),
    }).toEqual({ value: 'javascript', scrollY: 0 });
  });
});
