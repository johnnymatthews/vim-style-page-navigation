/**
 * Toolbar popup: per-site on/off switch. Reads the active tab's hostname
 * (activeTab permission, granted by the icon click) and stores the disabled
 * list in storage.local; content scripts react via storage.onChanged.
 */

const hostEl = document.getElementById('host');
const toggleBtn = document.getElementById('toggle');
const noteEl = document.getElementById('note');

async function getHost() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  try {
    return new URL(tab.url).hostname || null;
  } catch {
    return null; // about: pages and friends — no content script there anyway
  }
}

async function render() {
  const host = await getHost();
  if (!host) {
    hostEl.textContent = 'Nothing to toggle here.';
    toggleBtn.hidden = true;
    noteEl.hidden = true;
    return;
  }
  const { disabledHosts = [] } = await browser.storage.local.get('disabledHosts');
  const disabled = disabledHosts.includes(host);

  hostEl.textContent = host;
  toggleBtn.textContent = disabled ? 'Enable on this site' : 'Disable on this site';
  toggleBtn.onclick = async () => {
    const next = disabled
      ? disabledHosts.filter((h) => h !== host)
      : [...disabledHosts, host];
    await browser.storage.local.set({ disabledHosts: next });
    render();
  };
}

render();
