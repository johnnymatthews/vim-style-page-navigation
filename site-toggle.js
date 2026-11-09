/**
 * Shared by the popup (popup.js) and the keyboard command (background.js):
 * flip one host in the disabled list. Content scripts react via
 * storage.onChanged, so the toggle applies instantly everywhere.
 */
async function toggleSiteDisabled(host) {
  const { disabledHosts = [] } = await browser.storage.local.get('disabledHosts');
  const next = disabledHosts.includes(host)
    ? disabledHosts.filter((h) => h !== host)
    : [...disabledHosts, host];
  await browser.storage.local.set({ disabledHosts: next });
}
