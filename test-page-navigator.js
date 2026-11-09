/**
 * Self-check for page-navigator.js — run: node test-page-navigator.js
 *
 * Loads the content script in a vm with a stubbed DOM and pokes the core
 * logic: scrolling keys, modifier guard, gg sequence, typing guard, hint
 * activation (same tab vs. F's new tab), the ? help overlay, the per-site
 * disable switch, the background command that toggles it by keyboard, and
 * hint-code generation. No framework, just assert.
 */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const calls = [];
let keydownHandler;
let storageListener;

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
    addEventListener: (type, fn) => { if (type === 'keydown') keydownHandler = fn; },
    activeElement: body,
    documentElement: { scrollHeight: 5000 },
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, textContent: '', innerHTML: '', remove() {}, appendChild() {} }),
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

  const press = (key, mods = {}) => keydownHandler({ key, repeat: false, preventDefault() {}, ...mods });

  // j/k scroll one step each; browser shortcuts pass through untouched
  press('j');
  press('k');
  assert.deepStrictEqual(calls, [60, -60]);
  press('j', { ctrlKey: true });
  assert.strictEqual(calls.length, 2);

  // gg goes to the top, G to the bottom
  calls.length = 0;
  press('g');
  press('g');
  press('G');
  assert.deepStrictEqual(calls, [0, 5000]);

  // a lone g does nothing
  calls.length = 0;
  press('j');
  press('g');
  press('j');
  assert.deepStrictEqual(calls, [60, 60]);

  // H/L walk history
  press('H');
  press('L');
  assert.deepStrictEqual(calls.slice(-2), ['back', 'forward']);

  // while typing in a form field, navigation keys stay out of the way
  sandbox.document.activeElement = input;
  calls.length = 0;
  press('j');
  assert.deepStrictEqual(calls, []);
  sandbox.document.activeElement = body;

  // f on a page with no clickable elements doesn't wedge hint mode
  press('f');
  press('j');
  assert.deepStrictEqual(calls, [60]);

  // f + code clicks the link in place; F + code fires a modified click (new tab)
  sandbox.document.querySelectorAll = () => [fakeLink];
  press('f');
  press('a');
  assert.deepStrictEqual(calls.slice(-1), ['click']);
  press('F');
  press('a');
  assert.deepStrictEqual(calls.slice(-1), [['dispatch', 'click', true, false]]);
  sandbox.document.querySelectorAll = () => [];

  // ? shows help; while it's up, keys don't act; any key dismisses it
  calls.length = 0;
  press('?');
  press('j');
  assert.deepStrictEqual(calls, []); // the j was eaten dismissing help
  press('j');
  assert.deepStrictEqual(calls, [60]); // and now j scrolls again

  // per-site disable: storage change to a matching host kills the keys,
  // clearing it brings them back
  calls.length = 0;
  storageListener({ disabledHosts: { newValue: ['example.com'] } }, 'local');
  press('j');
  assert.deepStrictEqual(calls, []);
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
