import { describe, expect, it } from 'vitest';

import { createKeyInterpreter, type KeyPress, type KeyResult } from '../../utils/key-interpreter';

const DEFAULT_PRESS: KeyPress = {
  code: 'Unidentified',
  repeat: false,
  shift: false,
  ctrl: false,
  alt: false,
  meta: false,
  isComposing: false,
  typing: false,
  trusted: true,
  timeStamp: 0,
};

const NO_RESULT: KeyResult = { effects: [], consumed: false };

function key(overrides: Partial<KeyPress>): KeyPress {
  return { ...DEFAULT_PRESS, ...overrides };
}

describe('createKeyInterpreter', () => {
  it.each([
    { name: 'KeyJ scrolls down', input: { code: 'KeyJ' }, expected: { effects: [{ kind: 'scrollStep', direction: 1 }], consumed: false } },
    { name: 'Shift+KeyJ switches to the Left tab', input: { code: 'KeyJ', shift: true }, expected: { effects: [{ kind: 'tabSwitch', direction: 'left' }], consumed: false } },
    { name: 'KeyK scrolls up', input: { code: 'KeyK' }, expected: { effects: [{ kind: 'scrollStep', direction: -1 }], consumed: false } },
    { name: 'Shift+KeyK switches to the Right tab', input: { code: 'KeyK', shift: true }, expected: { effects: [{ kind: 'tabSwitch', direction: 'right' }], consumed: false } },
    { name: 'Shift+KeyG goes to the bottom', input: { code: 'KeyG', shift: true }, expected: { effects: [{ kind: 'scrollToBottom' }], consumed: false } },
    { name: 'KeyH has no action', input: { code: 'KeyH' }, expected: NO_RESULT },
    { name: 'Shift+KeyH goes back', input: { code: 'KeyH', shift: true }, expected: { effects: [{ kind: 'historyBack' }], consumed: false } },
    { name: 'KeyL has no action', input: { code: 'KeyL' }, expected: NO_RESULT },
    { name: 'Shift+KeyL goes forward', input: { code: 'KeyL', shift: true }, expected: { effects: [{ kind: 'historyForward' }], consumed: false } },
    { name: 'KeyF collects Link-hint targets', input: { code: 'KeyF' }, expected: { effects: [{ kind: 'collectLinkHintTargets' }], consumed: true } },
    { name: 'Shift+KeyF has no action', input: { code: 'KeyF', shift: true }, expected: NO_RESULT },
  ])('maps $name by physical key code', ({ input, expected }) => {
    // #given
    const interpreter = createKeyInterpreter();

    // #when
    const result = interpreter.press(key(input));

    // #then
    expect(result).toEqual(expected);
  });

  it('starts the g sequence that a second g completes within 1000 ms', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyG', timeStamp: 10 }));

    // #when
    const result = interpreter.press(key({ code: 'KeyG', timeStamp: 1009 }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'scrollToTop' }], consumed: false });
  });

  it('does not complete gg exactly 1000 ms after the first g', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyG', timeStamp: 10 }));

    // #when
    const result = interpreter.press(key({ code: 'KeyG', timeStamp: 1010 }));

    // #then
    expect(result).toEqual(NO_RESULT);
  });

  it('starts a new g sequence after the timeout', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyG', timeStamp: 10 }));
    interpreter.press(key({ code: 'KeyG', timeStamp: 1010 }));

    // #when
    const result = interpreter.press(key({ code: 'KeyG', timeStamp: 1011 }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'scrollToTop' }], consumed: false });
  });

  it('ends pending g after another unguarded key', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyG', timeStamp: 1 }));
    interpreter.press(key({ code: 'KeyJ', timeStamp: 2 }));
    interpreter.press(key({ code: 'KeyG', timeStamp: 3 }));

    // #when
    const result = interpreter.press(key({ code: 'KeyG', timeStamp: 4 }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'scrollToTop' }], consumed: false });
  });

  it('keeps pending g after a guarded key', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyG', timeStamp: 1 }));
    interpreter.press(key({ code: 'KeyF', ctrl: true, timeStamp: 2 }));

    // #when
    const result = interpreter.press(key({ code: 'KeyG', timeStamp: 3 }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'scrollToTop' }], consumed: false });
  });

  it('ends pending g when Shift+G goes to the bottom', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyG', timeStamp: 1 }));
    interpreter.press(key({ code: 'KeyG', shift: true, timeStamp: 2 }));
    interpreter.press(key({ code: 'KeyG', timeStamp: 3 }));

    // #when
    const result = interpreter.press(key({ code: 'KeyG', timeStamp: 4 }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'scrollToTop' }], consumed: false });
  });

  it.each([
    { name: 'Ctrl', input: { ctrl: true } },
    { name: 'Alt', input: { alt: true } },
    { name: 'Meta', input: { meta: true } },
    { name: 'IME composition', input: { isComposing: true } },
    { name: 'Typing', input: { typing: true } },
  ])('$name leaves a normal-mode key to the page', ({ input }) => {
    // #given
    const interpreter = createKeyInterpreter();

    // #when
    const result = interpreter.press(key({ code: 'KeyF', ...input }));

    // #then
    expect(result).toEqual(NO_RESULT);
  });

  it('does not switch tabs for an untrusted Shift+J press', () => {
    // #given
    const interpreter = createKeyInterpreter();

    // #when
    const result = interpreter.press(key({ code: 'KeyJ', shift: true, trusted: false }));

    // #then
    expect(result).toEqual(NO_RESULT);
  });

  it('scrolls one step before starting Continuous scroll on the first repeat', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyJ' }));

    // #when
    const result = interpreter.press(key({ code: 'KeyJ', repeat: true }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'startContinuousScroll', direction: 1 }], consumed: false });
  });

  it('does not restart Continuous scroll on another repeat in the same direction', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyJ', repeat: true }));

    // #when
    const result = interpreter.press(key({ code: 'KeyJ', repeat: true }));

    // #then
    expect(result).toEqual(NO_RESULT);
  });

  it('starts Continuous scroll in the other direction on its repeat', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyJ', repeat: true }));

    // #when
    const result = interpreter.press(key({ code: 'KeyK', repeat: true }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'startContinuousScroll', direction: -1 }], consumed: false });
  });

  it.each(['KeyJ', 'KeyK'])('stops Continuous scroll when %s is released', (code) => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyJ', repeat: true }));

    // #when
    const result = interpreter.release(code);

    // #then
    expect(result).toEqual({ effects: [{ kind: 'stopContinuousScroll' }], consumed: false });
  });

  it('does nothing when a key is released without Continuous scroll', () => {
    // #given
    const interpreter = createKeyInterpreter();

    // #when
    const result = interpreter.release('KeyJ');

    // #then
    expect(result).toEqual(NO_RESULT);
  });

  it('stops Continuous scroll when the window blurs', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyK', repeat: true }));

    // #when
    const result = interpreter.blur();

    // #then
    expect(result).toEqual({ effects: [{ kind: 'stopContinuousScroll' }], consumed: false });
  });

  it('stops Continuous scroll when KeyJ is released in Link-hint mode', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyJ', repeat: true }));
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(1);

    // #when
    const result = interpreter.release('KeyJ');

    // #then
    expect(result).toEqual({ effects: [{ kind: 'stopContinuousScroll' }], consumed: false });
  });

  it('does nothing when the window blurs without Continuous scroll', () => {
    // #given
    const interpreter = createKeyInterpreter();

    // #when
    const result = interpreter.blur();

    // #then
    expect(result).toEqual(NO_RESULT);
  });

  it('shows ss sd sf after f collects three targets', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));

    // #when
    const result = interpreter.linkHintTargets(3);

    // #then
    expect(result).toEqual({ effects: [{ kind: 'showLinkHints', codes: ['ss', 'sd', 'sf'] }], consumed: false });
  });

  it('shows the first eight Hint codes in home-row-first order', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));

    // #when
    const result = interpreter.linkHintTargets(8);

    // #then
    expect(result).toEqual({
      effects: [{ kind: 'showLinkHints', codes: ['ss', 'sd', 'sf', 'sj', 'sk', 'sl', 'ds', 'dd'] }],
      consumed: false,
    });
  });

  it('uses six Hint characters for 36 targets', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));

    // #when
    const result = interpreter.linkHintTargets(36);
    const effect = result.effects[0];
    const codes = effect?.kind === 'showLinkHints' ? effect.codes : [];

    // #then
    expect({ count: codes.length, sixth: codes[5], seventh: codes[6], last: codes[35] }).toEqual({
      count: 36,
      sixth: 'sl',
      seventh: 'ds',
      last: 'll',
    });
  });

  it('widens to seven Hint characters for 37 targets', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));

    // #when
    const result = interpreter.linkHintTargets(37);
    const effect = result.effects[0];
    const codes = effect?.kind === 'showLinkHints' ? effect.codes : [];

    // #then
    expect({ count: codes.length, seventh: codes[6], eighth: codes[7], last: codes[36] }).toEqual({
      count: 37,
      seventh: 'sa',
      eighth: 'ds',
      last: 'ld',
    });
  });

  it.each([900, 1000])('caps %i targets at 900 distinct two-character Hint codes', (targetCount) => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));

    // #when
    const result = interpreter.linkHintTargets(targetCount);
    const effect = result.effects[0];
    const codes = effect?.kind === 'showLinkHints' ? effect.codes : [];

    // #then
    expect({
      count: codes.length,
      first: codes[0],
      last: codes[899],
      distinct: new Set(codes).size,
      allTwoCharacters: codes.every((code) => code.length === 2),
    }).toEqual({ count: 900, first: 'ss', last: '44', distinct: 900, allTwoCharacters: true });
  });

  it('does not enter Link-hint mode for zero targets', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));

    // #when
    const linkHintResult = interpreter.linkHintTargets(0);
    const nextKeyResult = interpreter.press(key({ code: 'KeyJ' }));

    // #then
    expect({ linkHintResult, nextKeyResult }).toEqual({
      linkHintResult: { effects: [], consumed: false },
      nextKeyResult: { effects: [{ kind: 'scrollStep', direction: 1 }], consumed: false },
    });
  });

  it('narrows Link hints to target indices with the first character', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(3);

    // #when
    const result = interpreter.press(key({ code: 'KeyS' }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'narrowLinkHints', visible: [0, 1, 2] }], consumed: true });
  });

  it.each([
    { name: 'f', targetCount: 36, first: 'KeyF', second: 'KeyS', index: 12 },
    { name: 'j', targetCount: 36, first: 'KeyJ', second: 'KeyS', index: 18 },
    { name: 'k', targetCount: 36, first: 'KeyK', second: 'KeyS', index: 24 },
    { name: 'g', targetCount: 57, first: 'KeyG', second: 'KeyS', index: 56 },
  ])('accepts $name as the first Hint character', ({ targetCount, first, second, index }) => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(targetCount);
    interpreter.press(key({ code: first }));

    // #when
    const result = interpreter.press(key({ code: second }));

    // #then
    expect(result).toEqual({
      effects: [{ kind: 'activateLinkHint', index }, { kind: 'exitLinkHints' }],
      consumed: true,
    });
  });

  it.each([
    { code: 'Digit1', index: 780 },
    { code: 'Digit2', index: 810 },
    { code: 'Digit3', index: 840 },
    { code: 'Digit4', index: 870 },
  ])('accepts $code as a Hint character', ({ code, index }) => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(900);
    interpreter.press(key({ code }));

    // #when
    const result = interpreter.press(key({ code: 'KeyS' }));

    // #then
    expect(result).toEqual({
      effects: [{ kind: 'activateLinkHint', index }, { kind: 'exitLinkHints' }],
      consumed: true,
    });
  });

  it.each([
    { code: 'Digit5' },
    { code: 'Digit6' },
    { code: 'Digit7' },
    { code: 'Digit8' },
  ])('exits Link-hint mode when $code is the first character', ({ code }) => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(900);

    // #when
    const result = interpreter.press(key({ code }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'exitLinkHints' }], consumed: true });
  });

  it('activates the matching target and exits Link-hint mode after a full Hint code', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(2);
    interpreter.press(key({ code: 'KeyS' }));

    // #when
    const result = interpreter.press(key({ code: 'KeyD' }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'activateLinkHint', index: 1 }, { kind: 'exitLinkHints' }], consumed: true });
  });

  it('scrolls after a full Hint code activates a target', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(2);
    interpreter.press(key({ code: 'KeyS' }));
    interpreter.press(key({ code: 'KeyD' }));

    // #when
    const result = interpreter.press(key({ code: 'KeyJ' }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'scrollStep', direction: 1 }], consumed: false });
  });

  it.each([
    { name: 'Escape', input: { code: 'Escape' } },
    { name: 'Shift+Escape', input: { code: 'Escape', shift: true } },
  ])('exits Link-hint mode on $name', ({ input }) => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(1);

    // #when
    const result = interpreter.press(key(input));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'exitLinkHints' }], consumed: true });
  });

  it.each([
    { name: 'Escape', input: { code: 'Escape' } },
    { name: 'Shift+Escape', input: { code: 'Escape', shift: true } },
  ])('scrolls after $name exits Link-hint mode', ({ input }) => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(1);
    interpreter.press(key(input));

    // #when
    const result = interpreter.press(key({ code: 'KeyJ' }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'scrollStep', direction: 1 }], consumed: false });
  });

  it('exits Link-hint mode on repeated Escape', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(1);

    // #when
    const result = interpreter.press(key({ code: 'Escape', repeat: true }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'exitLinkHints' }], consumed: true });
  });

  it('exits and consumes a second Hint character that matches no code', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(1);
    interpreter.press(key({ code: 'KeyS' }));

    // #when
    const result = interpreter.press(key({ code: 'KeyD' }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'exitLinkHints' }], consumed: true });
  });

  it('scrolls after a second Hint character matches no code', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(1);
    interpreter.press(key({ code: 'KeyS' }));
    interpreter.press(key({ code: 'KeyD' }));

    // #when
    const result = interpreter.press(key({ code: 'KeyJ' }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'scrollStep', direction: 1 }], consumed: false });
  });

  it('exits and consumes a first Hint character that matches no code', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(1);

    // #when
    const result = interpreter.press(key({ code: 'KeyD' }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'exitLinkHints' }], consumed: true });
  });

  it('scrolls after a first Hint character matches no code', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(1);
    interpreter.press(key({ code: 'KeyD' }));

    // #when
    const result = interpreter.press(key({ code: 'KeyJ' }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'scrollStep', direction: 1 }], consumed: false });
  });

  it('leaves an unrelated Link-hint key to the page', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(1);

    // #when
    const result = interpreter.press(key({ code: 'Enter' }));

    // #then
    expect(result).toEqual(NO_RESULT);
  });

  it('keeps Link-hint mode after an unrelated key', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(1);
    interpreter.press(key({ code: 'Enter' }));
    interpreter.press(key({ code: 'KeyS' }));

    // #when
    const result = interpreter.press(key({ code: 'KeyS' }));

    // #then
    expect(result).toEqual({ effects: [{ kind: 'activateLinkHint', index: 0 }, { kind: 'exitLinkHints' }], consumed: true });
  });

  it.each([
    { name: 'Ctrl', input: { ctrl: true } },
    { name: 'Alt', input: { alt: true } },
    { name: 'Meta', input: { meta: true } },
    { name: 'IME composition', input: { isComposing: true } },
    { name: 'Typing', input: { typing: true } },
  ])('$name leaves a Link-hint key to the page', ({ input }) => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(1);

    // #when
    const result = interpreter.press(key({ code: 'KeyS', ...input }));

    // #then
    expect(result).toEqual(NO_RESULT);
  });

  it('leaves a shifted Hint key to the page and keeps Link-hint mode', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(1);

    // #when
    const shifted = interpreter.press(key({ code: 'KeyS', shift: true }));
    interpreter.press(key({ code: 'KeyS' }));
    const activation = interpreter.press(key({ code: 'KeyS' }));

    // #then
    expect({ shifted, activation }).toEqual({
      shifted: NO_RESULT,
      activation: {
        effects: [{ kind: 'activateLinkHint', index: 0 }, { kind: 'exitLinkHints' }],
        consumed: true,
      },
    });
  });

  it('ignores repeated f before plain fs activates target 12', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(36);

    // #when
    const repeated = interpreter.press(key({ code: 'KeyF', repeat: true }));
    interpreter.press(key({ code: 'KeyF' }));
    const activation = interpreter.press(key({ code: 'KeyS' }));

    // #then
    expect({ repeated, activation }).toEqual({
      repeated: { effects: [], consumed: true },
      activation: {
        effects: [{ kind: 'activateLinkHint', index: 12 }, { kind: 'exitLinkHints' }],
        consumed: true,
      },
    });
  });

  it('ignores repeated s without changing the s prefix', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(36);
    interpreter.press(key({ code: 'KeyS' }));

    // #when
    const repeated = interpreter.press(key({ code: 'KeyS', repeat: true }));
    const activation = interpreter.press(key({ code: 'KeyD' }));

    // #then
    expect({ repeated, activation }).toEqual({
      repeated: { effects: [], consumed: true },
      activation: {
        effects: [{ kind: 'activateLinkHint', index: 1 }, { kind: 'exitLinkHints' }],
        consumed: true,
      },
    });
  });

  it('leaves a repeated shifted Hint key to the page and keeps Link-hint mode', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(2);

    // #when
    const repeated = interpreter.press(key({ code: 'KeyS', shift: true, repeat: true }));
    interpreter.press(key({ code: 'KeyS' }));
    const activation = interpreter.press(key({ code: 'KeyD' }));

    // #then
    expect({ repeated, activation }).toEqual({
      repeated: NO_RESULT,
      activation: {
        effects: [{ kind: 'activateLinkHint', index: 1 }, { kind: 'exitLinkHints' }],
        consumed: true,
      },
    });
  });

  it('leaves a repeated non-Hint key to the page and keeps Link-hint mode', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(2);

    // #when
    const repeated = interpreter.press(key({ code: 'Enter', repeat: true }));
    interpreter.press(key({ code: 'KeyS' }));
    const activation = interpreter.press(key({ code: 'KeyD' }));

    // #then
    expect({ repeated, activation }).toEqual({
      repeated: NO_RESULT,
      activation: {
        effects: [{ kind: 'activateLinkHint', index: 1 }, { kind: 'exitLinkHints' }],
        consumed: true,
      },
    });
  });

  it.each([
    { code: 'KeyJ', index: 3 },
    { code: 'KeyK', index: 4 },
    { code: 'KeyF', index: 2 },
  ])('suppresses a repeated $code after it completes a six-target Hint code', ({ code, index }) => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(6);
    interpreter.press(key({ code: 'KeyS' }));
    const completion = interpreter.press(key({ code }));

    // #when
    const repeated = interpreter.press(key({ code, repeat: true }));

    // #then
    expect({ completion, repeated }).toEqual({
      completion: {
        effects: [{ kind: 'activateLinkHint', index }, { kind: 'exitLinkHints' }],
        consumed: true,
      },
      repeated: { effects: [], consumed: true },
    });
  });

  it('suppresses both repeated g presses after sg completes a 57-target Hint code', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(57);
    interpreter.press(key({ code: 'KeyS' }));
    const completion = interpreter.press(key({ code: 'KeyG' }));

    // #when
    const firstRepeat = interpreter.press(key({ code: 'KeyG', repeat: true }));
    const secondRepeat = interpreter.press(key({ code: 'KeyG', repeat: true }));

    // #then
    expect({ completion, firstRepeat, secondRepeat }).toEqual({
      completion: {
        effects: [{ kind: 'activateLinkHint', index: 7 }, { kind: 'exitLinkHints' }],
        consumed: true,
      },
      firstRepeat: { effects: [], consumed: true },
      secondRepeat: { effects: [], consumed: true },
    });
  });

  it('suppresses a repeated j after sj cancels a one-target Link-hint mode', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(1);
    interpreter.press(key({ code: 'KeyS' }));
    const cancellation = interpreter.press(key({ code: 'KeyJ' }));

    // #when
    const repeated = interpreter.press(key({ code: 'KeyJ', repeat: true }));

    // #then
    expect({ cancellation, repeated }).toEqual({
      cancellation: { effects: [{ kind: 'exitLinkHints' }], consumed: true },
      repeated: { effects: [], consumed: true },
    });
  });

  it('suppresses a repeated f after sf focuses a six-target Hint target while Typing', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(6);
    interpreter.press(key({ code: 'KeyS' }));
    const completion = interpreter.press(key({ code: 'KeyF' }));

    // #when
    const repeated = interpreter.press(key({ code: 'KeyF', repeat: true, typing: true }));

    // #then
    expect({ completion, repeated }).toEqual({
      completion: {
        effects: [{ kind: 'activateLinkHint', index: 2 }, { kind: 'exitLinkHints' }],
        consumed: true,
      },
      repeated: { effects: [], consumed: true },
    });
  });

  it('allows a repeated j to start Continuous scroll after KeyJ is released', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(6);
    interpreter.press(key({ code: 'KeyS' }));
    interpreter.press(key({ code: 'KeyJ' }));
    interpreter.release('KeyJ');

    // #when
    const repeated = interpreter.press(key({ code: 'KeyJ', repeat: true }));

    // #then
    expect(repeated).toEqual({ effects: [{ kind: 'startContinuousScroll', direction: 1 }], consumed: false });
  });

  it('allows a repeated j to start Continuous scroll after the window blurs', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(6);
    interpreter.press(key({ code: 'KeyS' }));
    interpreter.press(key({ code: 'KeyJ' }));
    interpreter.blur();

    // #when
    const repeated = interpreter.press(key({ code: 'KeyJ', repeat: true }));

    // #then
    expect(repeated).toEqual({ effects: [{ kind: 'startContinuousScroll', direction: 1 }], consumed: false });
  });

  it('allows a repeated j to start Continuous scroll after another plain key', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(6);
    interpreter.press(key({ code: 'KeyS' }));
    interpreter.press(key({ code: 'KeyJ' }));
    interpreter.press(key({ code: 'KeyX' }));

    // #when
    const repeated = interpreter.press(key({ code: 'KeyJ', repeat: true }));

    // #then
    expect(repeated).toEqual({ effects: [{ kind: 'startContinuousScroll', direction: 1 }], consumed: false });
  });

  it('does not suppress a repeated k after sj completes a six-target Hint code', () => {
    // #given
    const interpreter = createKeyInterpreter();
    interpreter.press(key({ code: 'KeyF' }));
    interpreter.linkHintTargets(6);
    interpreter.press(key({ code: 'KeyS' }));
    interpreter.press(key({ code: 'KeyJ' }));

    // #when
    const repeated = interpreter.press(key({ code: 'KeyK', repeat: true }));

    // #then
    expect(repeated).toEqual({ effects: [{ kind: 'startContinuousScroll', direction: -1 }], consumed: false });
  });
});
