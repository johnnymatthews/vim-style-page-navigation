import { chromium, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionPath = path.resolve(fileURLToPath(new URL('../../.output/chrome-mv3', import.meta.url)));

export interface ChromeTab {
  id?: number;
}

interface ChromeWindow {
  id?: number;
  tabs?: ChromeTab[];
}

interface ChromeExtensionApi {
  tabs: {
    create(options: { windowId: number; url: string; active?: boolean }, callback: (tab: ChromeTab) => void): void;
    query(options: { windowId: number; active: boolean }, callback: (tabs: ChromeTab[]) => void): void;
    update(tabId: number, options: { active: boolean }, callback: (tab: ChromeTab) => void): void;
  };
  windows: {
    create(options: { url: string; focused: boolean }, callback: (window: ChromeWindow) => void): void;
  };
}

export interface TestWindow {
  windowId: number;
  tabIds: number[];
}

export interface TabSwitchTrace {
  messages: unknown[];
  requestedTabIds: number[];
}

export async function openExtensionContext(): Promise<BrowserContext> {
  return chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
}

export async function extensionServiceWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? context.waitForEvent('serviceworker');
}

export async function createTestWindow(worker: Worker, urls: string[]): Promise<TestWindow> {
  return worker.evaluate(async (fixtureUrls) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome: ChromeExtensionApi }).chrome;
    const createdWindow = await new Promise<ChromeWindow>((resolve) => {
      chromeApi.windows.create({ url: fixtureUrls[0]!, focused: true }, resolve);
    });
    const windowId = createdWindow.id;
    const firstTabId = createdWindow.tabs?.[0]?.id;

    if (windowId === undefined || firstTabId === undefined) {
      throw new Error('Chromium did not return the created window and tab IDs');
    }

    const tabIds = [firstTabId];
    for (const url of fixtureUrls.slice(1)) {
      const tab = await new Promise<ChromeTab>((resolve) => {
        chromeApi.tabs.create({ windowId, url, active: false }, resolve);
      });
      if (tab.id === undefined) {
        throw new Error('Chromium did not return the created tab ID');
      }
      tabIds.push(tab.id);
    }

    return { windowId, tabIds };
  }, urls);
}

export async function activateTab(worker: Worker, tabId: number): Promise<void> {
  await worker.evaluate(async (id) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome: ChromeExtensionApi }).chrome;
    await new Promise<ChromeTab>((resolve) => {
      chromeApi.tabs.update(id, { active: true }, resolve);
    });
  }, tabId);
}

export async function queryActiveTabId(worker: Worker, windowId: number): Promise<number | null> {
  return worker.evaluate(async (id) => {
    const chromeApi = (globalThis as typeof globalThis & { chrome: ChromeExtensionApi }).chrome;
    const tabs = await new Promise<ChromeTab[]>((resolve) => {
      chromeApi.tabs.query({ windowId: id, active: true }, resolve);
    });
    return tabs[0]?.id ?? null;
  }, windowId);
}

export async function pageForUrl(context: BrowserContext, url: string): Promise<Page> {
  await expect.poll(() => context.pages().some((page) => page.url() === url)).toBe(true);
  const page = context.pages().find((candidate) => candidate.url() === url);
  if (!page) {
    throw new Error(`Chromium did not expose the fixture page ${url}`);
  }
  await page.waitForLoadState();
  await waitForContentScriptReady(page);
  return page;
}

export async function waitForContentScriptReady(page: Page): Promise<void> {
  await expect.poll(() => page.locator('html').getAttribute('data-jk-nav')).toBe('ready');
}

export async function installTabSwitchTrace(worker: Worker): Promise<void> {
  await worker.evaluate(() => {
    type UpdateTab = {
      (tabId: number, options: { active: boolean }): Promise<ChromeTab>;
      (tabId: number, options: { active: boolean }, callback: (tab: ChromeTab) => void): void;
    };

    interface InstrumentedChromeApi {
      runtime: {
        onMessage: {
          addListener(listener: (message: unknown) => void): void;
        };
      };
      tabs: {
        update: UpdateTab;
      };
    }

    const workerGlobal = globalThis as typeof globalThis & {
      chrome: InstrumentedChromeApi;
      tabSwitchTrace?: TabSwitchTrace;
    };
    const trace: TabSwitchTrace = { messages: [], requestedTabIds: [] };
    workerGlobal.tabSwitchTrace = trace;
    workerGlobal.chrome.runtime.onMessage.addListener((message) => {
      trace.messages.push(message);
    });

    const updateTab = workerGlobal.chrome.tabs.update.bind(workerGlobal.chrome.tabs);
    workerGlobal.chrome.tabs.update = ((
      tabId: number,
      options: { active: boolean },
      callback?: (tab: ChromeTab) => void,
    ): Promise<ChromeTab> | void => {
      trace.requestedTabIds.push(tabId);
      if (callback) {
        updateTab(tabId, options, callback);
        return;
      }
      return updateTab(tabId, options);
    }) as UpdateTab;
  });
}

export async function readTabSwitchTrace(worker: Worker): Promise<TabSwitchTrace> {
  return worker.evaluate(() => {
    const trace = (globalThis as typeof globalThis & { tabSwitchTrace?: TabSwitchTrace }).tabSwitchTrace;
    return {
      messages: trace?.messages ?? [],
      requestedTabIds: trace?.requestedTabIds ?? [],
    };
  });
}
