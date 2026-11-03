import {
  isTabSwitchMessage,
  selectTabSwitchTarget,
  type TabDirection,
} from '../utils/tab-switch';
import { isFrameScrollMessage } from '../utils/frame-scroll';

async function activateTabInDirection(direction: TabDirection, windowId: number): Promise<void> {
  const tabs = await browser.tabs.query({ windowId });
  const collapsedGroupIds = new Set<number>();

  if (browser.tabGroups?.query !== undefined) {
    try {
      const collapsedGroups = await browser.tabGroups.query({ windowId, collapsed: true });
      for (const group of collapsedGroups) {
        collapsedGroupIds.add(group.id);
      }
    } catch {
      // Older browsers may expose no usable tabGroups implementation.
    }
  }

  const tabsWithHidden = tabs as Array<typeof tabs[number] & { hidden?: boolean }>;
  const targetId = selectTabSwitchTarget(tabsWithHidden, collapsedGroupIds, direction);

  if (targetId !== null) {
    await browser.tabs.update(targetId, { active: true });
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (isFrameScrollMessage(message)) {
      const tabId = sender.tab?.id;
      if (tabId === undefined || sender.frameId === 0) {
        return;
      }

      return browser.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(() => undefined);
    }

    if (!isTabSwitchMessage(message)) {
      return;
    }

    const windowId = sender.tab?.windowId;
    if (windowId === undefined) {
      return;
    }

    void activateTabInDirection(message.direction, windowId).catch(() => undefined);
  });
});
