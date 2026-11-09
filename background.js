/**
 * Event page for the global keyboard toggle (manifest "commands").
 * Lives outside the content script so it keeps working on sites where the
 * extension is disabled — that's the whole point of a toggle.
 */
browser.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-site') return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  let host = null;
  try {
    host = new URL(tab.url).hostname || null;
  } catch {
    // about: pages and friends — nothing running there to toggle
  }
  if (host) await toggleSiteDisabled(host);
});
