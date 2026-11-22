/**
 * Vim-Style Page Navigation
 *
 * j / k    scroll down / up (hold to keep scrolling — native key repeat)
 * gg / G   top / bottom of page
 * H / L    history back / forward
 * f        hint mode: type a hint's code to follow it, Esc to cancel
 * Esc      also blurs a focused form field so j/k work again
 */

const SCROLL_AMOUNT = 60; // px per j/k press
const GG_TIMEOUT = 500; // ms allowed between the two g's
// Home row first, so the most common hints are the easiest keys. j/k stay
// reserved (they scroll, even in hint mode); f and g are fair game inside
// hint mode since they only mean something outside it. Digits are overflow.
const HINT_CHARS = 'asdfghlqwertyuiopzxcvbnm1234567890';
const MAX_HINTS = HINT_CHARS.length ** 2;
const CLICKABLE = 'a[href], button, [role="button"], input:not([type="hidden"]), textarea, select';
const TEXT_INPUT_TYPES = ['text', 'search', 'email', 'password', 'url', 'tel', 'number'];

let lastKey = '';
let lastKeyTime = 0;

let hintMode = false;
let hints = []; // { badge, target, code, wantsFocus }
let typed = '';
let openInNewTab = false; // set by F, consumed on activation
let helpOverlay = null;

// Per-site on/off switch, toggled from the toolbar popup. The script always
// loads; on a disabled host every handler below stays inert.
let enabled = true;
browser.storage.local.get('disabledHosts').then(({ disabledHosts = [] }) => {
  enabled = !disabledHosts.includes(location.hostname);
});
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.disabledHosts) return;
  enabled = !(changes.disabledHosts.newValue || []).includes(location.hostname);
  if (!enabled) { exitHintMode(); hideHelp(); }
});

// Capture phase, on purpose. Page scripts load before this content script,
// so their keydown handlers are registered first, and in the bubble phase
// that means they see every key before we do (on GitHub, j/k move the
// file-list cursor instead of scrolling). Capturing puts this handler in
// front; consumeKey() then makes sure a key we act on never reaches theirs.
// ponytail: a site that registers its own capture-phase keydown on document
// before this script runs still sees keys first. Nothing short of surgery
// fixes that, and no site we know of does it.
document.addEventListener('keydown', (event) => {
  if (!enabled) return;
  if (hintMode) return handleHintKey(event);
  if (event.ctrlKey || event.metaKey || event.altKey) return; // don't fight browser shortcuts
  if (helpOverlay) { hideHelp(); return consumeKey(event); } // any plain key closes the help card

  if (isUserTyping()) {
    if (event.key === 'Escape') document.activeElement.blur();
    return;
  }

  switch (event.key) {
    case 'j': consumeKey(event); window.scrollBy(0, SCROLL_AMOUNT); break;
    case 'k': consumeKey(event); window.scrollBy(0, -SCROLL_AMOUNT); break;
    case 'G': consumeKey(event); window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }); break;
    case 'H': consumeKey(event); window.history.back(); break;
    case 'L': consumeKey(event); window.history.forward(); break;
    case 'g':
      // only the second g of gg acts; a lone g passes through untouched
      if (lastKey === 'g' && Date.now() - lastKeyTime < GG_TIMEOUT) {
        consumeKey(event);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      break;
    case 'f':
    case 'F':
      if (!event.repeat) {
        consumeKey(event);
        enterHintMode(event.key === 'F');
      }
      break;
    case '?':
      consumeKey(event);
      showHelp();
      break;
  }

  lastKey = event.key;
  lastKeyTime = Date.now();
}, true);

// Whenever we act on a key, the page's own shortcuts must not act on it too.
// preventDefault alone isn't enough for that (site handlers listen for the
// same event), so the event is stopped here in the capture phase, before it
// can reach any of them.
function consumeKey(event) {
  event.preventDefault();
  event.stopPropagation();
}

// A real mouse click dismisses any lingering hints or help.
document.addEventListener('click', () => {
  if (hintMode) exitHintMode();
  if (helpOverlay) hideHelp();
}, true);

// --- link hints --------------------------------------------------------------

function enterHintMode(newTab = false) {
  // ponytail: hints are a snapshot taken on f; links scrolled into view
  // afterwards have none — press f again to refresh
  const targets = [...document.querySelectorAll(CLICKABLE)]
    .filter(isVisible)
    .slice(0, MAX_HINTS);
  if (!targets.length) return;

  const codes = hintCodes(targets.length);
  hintMode = true;
  typed = '';
  openInNewTab = newTab;

  targets.forEach((target, i) => {
    const rect = target.getBoundingClientRect();
    const wantsFocus = target.tagName === 'TEXTAREA' ||
      (target.tagName === 'INPUT' && TEXT_INPUT_TYPES.includes(target.type));
    const badge = document.createElement('div');
    badge.textContent = codes[i];
    badge.style.cssText = `
      position: absolute;
      top: ${Math.max(0, rect.top + window.scrollY)}px;
      left: ${Math.max(0, rect.left + window.scrollX)}px;
      background: ${target.tagName === 'A' ? '#ffff00' : wantsFocus ? '#90ee90' : '#ffa500'};
      color: #000;
      border: 1px solid #000;
      border-radius: 4px;
      padding: 2px 4px;
      font: bold 12px monospace;
      z-index: 2147483647;
    `;
    document.body.appendChild(badge);
    hints.push({ badge, target, code: codes[i], wantsFocus });
  });
}

function handleHintKey(event) {
  if (event.key === 'Escape') {
    consumeKey(event);
    return exitHintMode();
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return; // F5, ctrl+r etc. still work
  // j/k keep scrolling with hints up; hint codes never contain them
  if (event.key === 'j' || event.key === 'k') {
    consumeKey(event);
    window.scrollBy(0, event.key === 'j' ? SCROLL_AMOUNT : -SCROLL_AMOUNT);
    return;
  }
  if (event.key === 'Backspace') {
    consumeKey(event);
    typed = typed.slice(0, -1);
    return updateHints();
  }
  if (event.key.length !== 1) return; // ignore bare Shift and friends
  consumeKey(event);
  typed += event.key.toLowerCase();
  updateHints();
}

function updateHints() {
  let exact = null;
  let anyMatch = false;
  for (const h of hints) {
    const match = h.code.startsWith(typed);
    h.badge.style.display = match ? '' : 'none';
    if (match) anyMatch = true;
    if (h.code === typed) exact = h;
  }
  if (exact) {
    exitHintMode();
    if (exact.wantsFocus) {
      exact.target.focus();
    } else if (openInNewTab && exact.target.matches('a[href]')) {
      openLinkInNewTab(exact.target);
    } else {
      exact.target.click();
    }
  } else if (!anyMatch) {
    exitHintMode(); // a typo is a dead end, not a trap
  }
}

function exitHintMode() {
  hintMode = false;
  typed = '';
  for (const h of hints) h.badge.remove();
  hints = [];
}

// A synthetic ctrl/cmd+click — the browser treats it like the real thing and
// opens the link in a new tab. window.open from a keydown would hit the popup
// blocker, and there's no background script here for the tabs API.
// ponytail: SPA routers that intercept clicks may ignore the modifier and
// navigate in-place; real link semantics would need a background script.
function openLinkInNewTab(el) {
  const mod = /Mac/.test(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, ...mod }));
}

// --- help overlay ------------------------------------------------------------

function showHelp() {
  const rows = [
    ['j / k', 'scroll down / up (hold to keep going)'],
    ['gg / G', 'jump to top / bottom'],
    ['H / L', 'history back / forward'],
    ['f / F', 'follow link / open link in a new tab'],
    ['Esc', 'cancel hints, blur a form field'],
    ['?', 'this help'],
  ];
  // textContent everywhere, no innerHTML — nothing for reviewers to squint at
  const el = (tag, text, css) => {
    const node = document.createElement(tag);
    node.textContent = text;
    if (css) node.style.cssText = css;
    return node;
  };
  const card = el('div', '', 'background:#1e1e1e;color:#eee;padding:18px 26px;border-radius:8px;font:14px/1.9 monospace;box-shadow:0 8px 30px rgba(0,0,0,.6);');
  card.append(
    el('b', 'vim-style page navigation'),
    ...rows.flatMap(([keys, desc]) => [
      document.createElement('br'),
      el('span', keys.padEnd(8), 'color:#ffd75f'),
      document.createTextNode(desc),
    ]),
    document.createElement('br'),
    el('span', 'hint mode: type a code · j/k scroll · backspace undoes · esc cancels', 'color:#888'),
  );
  helpOverlay = el('div', '', 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);');
  helpOverlay.appendChild(card);
  document.body.appendChild(helpOverlay);
}

function hideHelp() {
  if (helpOverlay) helpOverlay.remove();
  helpOverlay = null;
}

// --- helpers -----------------------------------------------------------------

// One char per hint while they fit (most pages: one keystroke to follow a
// link), two chars past that — enough for MAX_HINTS targets.
function hintCodes(count) {
  if (count <= HINT_CHARS.length) return HINT_CHARS.slice(0, count).split('');
  const codes = [];
  for (const a of HINT_CHARS) {
    for (const b of HINT_CHARS) {
      codes.push(a + b);
      if (codes.length === count) return codes;
    }
  }
  return codes;
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth &&
    style.display !== 'none' &&
    style.visibility !== 'hidden'
  );
}

function isUserTyping() {
  const el = document.activeElement;
  return (
    el.isContentEditable ||
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT'
  );
}
