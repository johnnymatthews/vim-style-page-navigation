/**
 * Self-check for page-navigator.js — run: node test-page-navigator.js
 *
 * Loads the content script in a vm with a stubbed DOM and pokes the core
 * logic: scrolling keys, modifier guard, gg sequence, typing guard, hint
 * activation (same tab vs. F's new tab), the ? help overlay, the per-site
 * disable switch, the background command that toggles it by keyboard, and
 * hint-code generation. Also checks the keydown handler is registered in
 * the capture phase, and that keys we act on are consumed
 * (preventDefault + stopPropagation) so a site's own shortcuts never see
 * them. No framework, just assert.
 */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const calls = [];
let keydownHandler;
let keydownCapture; // set when the script registers its keydown listener
let storageListener;

// Reset on every press, so each assertion can check whether that exact key
// was consumed (the page never sees it) or passed through untouched.
let prevented = false;
let stopped = false;

const body = { tagName: 'BODY', isContentEditable: false, blur() {} };
const input = { tagName: 'INPUT', isContentEditable: false, blur() {} };

const fakeLink = {
  tagName: 'A',
  type: '',
  href: 'https://example.com',
  getBoundingClientRect: () => ({ top: 10, left: 10, width: 50, height: 20, bottom: 30, right: 60 }),
  matches: (sel) => sel === 'a[href]',
  click: () => calls.push('click'),
  focus: () => calls.push('focus'),
  dispatchEvent: (e) => calls.push(['dispatch', e.type, e.ctrlKey === true, e.metaKey === true]),
};

class FakeMouseEvent {
  constructor(type, opts = {}) { Object.assign(this, { type }, opts); }
}

const sandbox = {
  document: {
    addEventListener: (type, fn, opts) => {
      if (type === 'keydown') {
        keydownHandler = fn;
        keydownCapture = opts === true || Boolean(opts && opts.capture);
      }
    },
    activeElement: body,
    documentElement: { scrollHeight: 5000 },
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, textContent: '', remove() {}, append() {}, appendChild() {} }),
    createTextNode: (text) => ({ text }),
    body: { appendChild() {} },
  },
  window: {
    scrollBy: (x, y) => calls.push(y),
    scrollTo: (opts) => calls.push(opts.top),
    history: { back: () => calls.push('back'), forward: () => calls.push('forward') },
    innerHeight: 800,
    innerWidth: 1200,
    scrollX: 0,
    scrollY: 0,
  },
  navigator: { platform: 'linux' },
  location: { hostname: 'example.com' },
  MouseEvent: FakeMouseEvent,
  getComputedStyle: () => ({}),
  browser: {
    storage: {
      local: {
        get: async () => ({}), // nothing disabled
        set: async () => {},
      },
      onChanged: { addListener: (fn) => { storageListener = fn; } },
    },
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(`${__dirname}/page-navigator.js`, 'utf8'), sandbox);

async function main() {
  // let the initial storage.get().then() settle before pressing keys
  await new Promise((r) => setImmediate(r));

  const press = (key, mods = {}) => {
    prevented = false;
    stopped = false;
    keydownHandler({
      key,
      repeat: false,
      preventDefault() { prevented = true; },
      stopPropagation() { stopped = true; },
      ...mods,
    });
  };
  const consumed = () => prevented && stopped;

  // the handler must sit in the capture phase, or a page's own keydown
  // handlers (GitHub's file-list cursor, say) see every key first
  assert.strictEqual(keydownCapture, true);

  // j/k scroll one step each and are consumed; browser shortcuts pass
  // through untouched
  press('j');
  press('k');
  assert.deepStrictEqual(calls, [60, -60]);
  assert.ok(consumed(), 'k was consumed');
  press('j', { ctrlKey: true });
  assert.strictEqual(calls.length, 2);
  assert.ok(!prevented && !stopped, 'ctrl+j belongs to the browser');

  // gg goes to the top, G to the bottom; a lone g does nothing
  calls.length = 0;
  press('g');
  assert.ok(!prevented, 'a lone g passes through');
  press('g');
  assert.ok(consumed(), 'the second g of gg was consumed');
  press('G');
  assert.deepStrictEqual(calls, [0, 5000]);

  // a lone g does nothing
  calls.length = 0;
  press('j');
  press('g');
  press('j');
  assert.deepStrictEqual(calls, [60, 60]);
  assert.ok(consumed(), 'j after a stray g still scrolls');

  // H/L walk history
  press('H');
  press('L');
  assert.deepStrictEqual(calls.slice(-2), ['back', 'forward']);
  assert.ok(consumed(), 'L was consumed');

  // while typing in a form field, navigation keys stay out of the way and
  // keep belonging to the field: no scroll, no consumption
  sandbox.document.activeElement = input;
  calls.length = 0;
  press('j');
  assert.deepStrictEqual(calls, []);
  assert.ok(!prevented && !stopped, 'a key typed in a field passes through');
  sandbox.document.activeElement = body;

  // f on a page with no clickable elements doesn't wedge hint mode
  press('f');
  press('j');
  assert.deepStrictEqual(calls, [60]);
  assert.ok(consumed(), 'j scrolls once hint mode is off');

  // f + code clicks the link in place; F + code fires a modified click (new tab)
  sandbox.document.querySelectorAll = () => [fakeLink];
  press('f');
  press('a');
  assert.deepStrictEqual(calls.slice(-1), ['click']);
  assert.ok(consumed(), 'the hint keypress was consumed');

  // Esc cancels hint mode without the page hearing about it
  press('f');
  press('Escape');
  assert.ok(consumed(), 'Esc in hint mode was consumed');

  press('F');
  press('a');
  assert.deepStrictEqual(calls.slice(-1), [['dispatch', 'click', true, false]]);
  sandbox.document.querySelectorAll = () => [];

  // ? shows help; while it's up, keys don't act; any key dismisses it
  calls.length = 0;
  press('?');
  assert.ok(consumed(), '? was consumed');
  press('j');
  assert.deepStrictEqual(calls, []); // the j was eaten dismissing help
  assert.ok(consumed(), 'the help-dismissing j never reached the page');
  press('j');
  assert.deepStrictEqual(calls, [60]); // and now j scrolls again

  // per-site disable: storage change to a matching host kills the keys,
  // clearing it brings them back
  calls.length = 0;
  storageListener({ disabledHosts: { newValue: ['example.com'] } }, 'local');
  press('j');
  assert.deepStrictEqual(calls, []);
  assert.ok(!prevented, 'a disabled host gets its keys back untouched');
  storageListener({ disabledHosts: { newValue: [] } }, 'local');
  press('j');
  assert.deepStrictEqual(calls, [60]);

  // hint codes: home-row-first, one char while they fit, two past that
  // (vm-realm arrays, so compare via join/every rather than deepStrictEqual)
  const { hintCodes } = sandbox;
  assert.strictEqual(hintCodes(3).join(''), 'asd');
  assert.strictEqual(hintCodes(34).length, 34);
  assert.ok(hintCodes(34).every((c) => c.length === 1));
  assert.ok(hintCodes(35).every((c) => c.length === 2));
  assert.strictEqual(hintCodes(35)[0], 'aa');
  assert.strictEqual(hintCodes(35)[34], 'sa');
  assert.strictEqual(hintCodes(34 ** 2).length, 1156);

  // --- background world: the keyboard toggle command ---
  const stored = { disabledHosts: [] };
  let commandHandler;
  const bgSandbox = {
    URL,
    browser: {
      commands: { onCommand: { addListener: (fn) => { commandHandler = fn; } } },
      tabs: { query: async () => [{ url: 'https://news.ycombinator.com/item?id=1' }] },
      storage: {
        local: {
          get: async () => ({ disabledHosts: stored.disabledHosts }),
          set: async (v) => { stored.disabledHosts = v.disabledHosts; },
        },
      },
    },
  };
  vm.createContext(bgSandbox);
  vm.runInContext(fs.readFileSync(`${__dirname}/site-toggle.js`, 'utf8'), bgSandbox);
  vm.runInContext(fs.readFileSync(`${__dirname}/background.js`, 'utf8'), bgSandbox);

  // (arrays again cross vm realms, so compare via join)
  await commandHandler('toggle-site');
  assert.strictEqual(stored.disabledHosts.join(), 'news.ycombinator.com');
  await commandHandler('toggle-site');
  assert.strictEqual(stored.disabledHosts.length, 0);
  await commandHandler('some-other-command'); // ignored
  assert.strictEqual(stored.disabledHosts.length, 0);

  console.log('ok — page-navigator self-check passed');
}

main().catch((err) => { console.error(err); process.exit(1); });
