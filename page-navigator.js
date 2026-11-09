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
const HINT_CHARS = 'abcdehilmnopqrstuvwxyz12345678'; // j, k, g, f stay reserved for navigation
const MAX_HINTS = HINT_CHARS.length ** 2;
const CLICKABLE = 'a[href], button, [role="button"], input:not([type="hidden"]), textarea, select';
const TEXT_INPUT_TYPES = ['text', 'search', 'email', 'password', 'url', 'tel', 'number'];

let lastKey = '';
let lastKeyTime = 0;

let hintMode = false;
let hints = []; // { badge, target, code, wantsFocus }
let typed = '';

document.addEventListener('keydown', (event) => {
  if (hintMode) return handleHintKey(event);
  if (event.ctrlKey || event.metaKey || event.altKey) return; // don't fight browser shortcuts

  if (isUserTyping()) {
    if (event.key === 'Escape') document.activeElement.blur();
    return;
  }

  switch (event.key) {
    case 'j': window.scrollBy(0, SCROLL_AMOUNT); break;
    case 'k': window.scrollBy(0, -SCROLL_AMOUNT); break;
    case 'G': window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }); break;
    case 'H': window.history.back(); break;
    case 'L': window.history.forward(); break;
    case 'g':
      if (lastKey === 'g' && Date.now() - lastKeyTime < GG_TIMEOUT) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      break;
    case 'f':
      if (!event.repeat) {
        event.preventDefault();
        enterHintMode();
      }
      break;
  }

  lastKey = event.key;
  lastKeyTime = Date.now();
});

// A real mouse click dismisses any lingering hints.
document.addEventListener('click', () => {
  if (hintMode) exitHintMode();
}, true);

// --- link hints --------------------------------------------------------------

function enterHintMode() {
  // ponytail: hints are a snapshot taken on f; links scrolled into view
  // afterwards have none — press f again to refresh
  const targets = [...document.querySelectorAll(CLICKABLE)]
    .filter(isVisible)
    .slice(0, MAX_HINTS);
  if (!targets.length) return;

  const codes = hintCodes(targets.length);
  hintMode = true;
  typed = '';

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
  if (event.key === 'Escape') return exitHintMode();
  if (event.ctrlKey || event.metaKey || event.altKey) return; // F5, ctrl+r etc. still work
  // j/k keep scrolling with hints up; hint codes never contain them
  if (event.key === 'j' || event.key === 'k') {
    window.scrollBy(0, event.key === 'j' ? SCROLL_AMOUNT : -SCROLL_AMOUNT);
    return;
  }
  if (event.key === 'Backspace') {
    event.preventDefault();
    typed = typed.slice(0, -1);
    return updateHints();
  }
  if (event.key.length !== 1) return; // ignore bare Shift and friends
  event.preventDefault();
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
    exact.wantsFocus ? exact.target.focus() : exact.target.click();
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
