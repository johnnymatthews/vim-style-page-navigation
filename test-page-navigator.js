/**
 * Self-check for page-navigator.js — run: node test-page-navigator.js
 *
 * Loads the content script in a vm with a stubbed DOM and pokes the core
 * logic: scrolling keys, modifier guard, gg sequence, typing guard, and
 * hint-code generation. No framework, just assert.
 */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const calls = [];
let keydownHandler;

const body = { tagName: 'BODY', isContentEditable: false, blur() {} };
const input = { tagName: 'INPUT', isContentEditable: false, blur() {} };

const sandbox = {
  document: {
    addEventListener: (type, fn) => { if (type === 'keydown') keydownHandler = fn; },
    activeElement: body,
    documentElement: { scrollHeight: 5000 },
    querySelectorAll: () => [],
  },
  window: {
    scrollBy: (x, y) => calls.push(y),
    scrollTo: (opts) => calls.push(opts.top),
    history: { back: () => calls.push('back'), forward: () => calls.push('forward') },
    innerHeight: 800,
    innerWidth: 1200,
  },
  getComputedStyle: () => ({}),
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(`${__dirname}/page-navigator.js`, 'utf8'), sandbox);

const press = (key, mods = {}) => keydownHandler({ key, preventDefault() {}, ...mods });

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

// hint codes: one character while they fit, two past the alphabet
// (vm-realm arrays, so compare via join/every rather than deepStrictEqual)
const { hintCodes } = sandbox;
assert.strictEqual(hintCodes(3).join(''), 'abc');
assert.ok(hintCodes(30).every((c) => c.length === 1));
assert.ok(hintCodes(31).every((c) => c.length === 2));
assert.strictEqual(hintCodes(31)[0], 'aa');
assert.strictEqual(hintCodes(31)[30], 'ba');
assert.strictEqual(hintCodes(30 ** 2).length, 900);

console.log('ok — page-navigator self-check passed');
