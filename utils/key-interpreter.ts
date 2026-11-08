import type { TabDirection } from './tab-switch';

import { hintCharacter, isHintCharacter, LinkHintMode, type LinkHintResult } from './link-hint-mode';

export const TAB_SWITCH_DIRECTIONS: Record<string, TabDirection> = {
  KeyJ: 'left',
  KeyK: 'right',
};

export interface KeyPress {
  code: string;
  repeat: boolean;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  isComposing: boolean;
  typing: boolean;
  trusted: boolean;
  timeStamp: number;
}

export type ScrollDirection = 1 | -1;

export type KeyEffect =
  | { kind: 'scrollStep'; direction: ScrollDirection }
  | { kind: 'startContinuousScroll'; direction: ScrollDirection }
  | { kind: 'stopContinuousScroll' }
  | { kind: 'scrollToTop' }
  | { kind: 'scrollToBottom' }
  | { kind: 'historyBack' }
  | { kind: 'historyForward' }
  | { kind: 'tabSwitch'; direction: TabDirection }
  | { kind: 'collectLinkHintTargets' }
  | { kind: 'showLinkHints'; codes: string[] }
  | { kind: 'narrowLinkHints'; visible: number[] }
  | { kind: 'activateLinkHint'; index: number }
  | { kind: 'exitLinkHints' };

export interface KeyResult {
  effects: KeyEffect[];
  consumed: boolean;
}

export interface KeyInterpreter {
  press(key: KeyPress): KeyResult;
  release(code: string): KeyResult;
  blur(): KeyResult;
  linkHintTargets(count: number): KeyResult;
}

const NO_RESULT: KeyResult = { effects: [], consumed: false };
const KEY_SEQUENCE_TIMEOUT = 1000;

export function createKeyInterpreter(): KeyInterpreter {
  let pendingGAt: number | null = null;
  let continuousScrollDirection: ScrollDirection | null = null;
  let inLinkHintMode = false;
  let suppressedRepeatCode: string | null = null;
  const linkHints = new LinkHintMode();

  function press(key: KeyPress): KeyResult {
    if (key.repeat && suppressedRepeatCode === key.code) {
      return { effects: [], consumed: true };
    }

    if (!key.repeat) {
      suppressedRepeatCode = null;
    }

    if (isGuarded(key)) {
      return NO_RESULT;
    }

    if (inLinkHintMode) {
      return pressLinkHintKey(key);
    }

    if (key.code !== 'KeyG' || key.shift) {
      pendingGAt = null;
    }

    if (key.shift) {
      const tabDirection = TAB_SWITCH_DIRECTIONS[key.code];
      if (tabDirection !== undefined) {
        return key.trusted
          ? { effects: [{ kind: 'tabSwitch', direction: tabDirection }], consumed: false }
          : NO_RESULT;
      }

      switch (key.code) {
        case 'KeyG':
          return { effects: [{ kind: 'scrollToBottom' }], consumed: false };
        case 'KeyH':
          return { effects: [{ kind: 'historyBack' }], consumed: false };
        case 'KeyL':
          return { effects: [{ kind: 'historyForward' }], consumed: false };
        default:
          return NO_RESULT;
      }
    }

    switch (key.code) {
      case 'KeyJ':
        return pressScrollKey(1, key.repeat);
      case 'KeyK':
        return pressScrollKey(-1, key.repeat);
      case 'KeyG':
        if (pendingGAt !== null && key.timeStamp - pendingGAt < KEY_SEQUENCE_TIMEOUT) {
          pendingGAt = null;
          return { effects: [{ kind: 'scrollToTop' }], consumed: false };
        }
        pendingGAt = key.timeStamp;
        return NO_RESULT;
      case 'KeyF':
        return { effects: [{ kind: 'collectLinkHintTargets' }], consumed: true };
      default:
        return NO_RESULT;
    }
  }

  function pressScrollKey(direction: ScrollDirection, repeat: boolean): KeyResult {
    if (!repeat) {
      return { effects: [{ kind: 'scrollStep', direction }], consumed: false };
    }

    if (continuousScrollDirection === direction) {
      return NO_RESULT;
    }

    continuousScrollDirection = direction;
    return { effects: [{ kind: 'startContinuousScroll', direction }], consumed: false };
  }

  function pressLinkHintKey(key: KeyPress): KeyResult {
    if (key.code === 'Escape') {
      inLinkHintMode = false;
      return { effects: [{ kind: 'exitLinkHints' }], consumed: true };
    }

    if (key.shift) {
      return NO_RESULT;
    }

    const character = hintCharacter(key.code);
    if (character === null) {
      return NO_RESULT;
    }

    if (key.repeat) {
      return isHintCharacter(character) ? { effects: [], consumed: true } : NO_RESULT;
    }

    const result = linkHints.input(character);
    return linkHintResult(result, key.code);
  }

  function linkHintResult(result: LinkHintResult, keyCode: string): KeyResult {
    switch (result.kind) {
      case 'narrow':
        return { effects: [{ kind: 'narrowLinkHints', visible: result.visible }], consumed: true };
      case 'activate':
        inLinkHintMode = false;
        suppressedRepeatCode = keyCode;
        return {
          effects: [
            { kind: 'activateLinkHint', index: result.index },
            { kind: 'exitLinkHints' },
          ],
          consumed: true,
        };
      case 'cancel':
        inLinkHintMode = false;
        suppressedRepeatCode = keyCode;
        return { effects: [{ kind: 'exitLinkHints' }], consumed: true };
    }
  }

  function release(code: string): KeyResult {
    if (suppressedRepeatCode === code) {
      suppressedRepeatCode = null;
    }

    if (continuousScrollDirection !== null && (code === 'KeyJ' || code === 'KeyK')) {
      continuousScrollDirection = null;
      return { effects: [{ kind: 'stopContinuousScroll' }], consumed: false };
    }

    return NO_RESULT;
  }

  function blur(): KeyResult {
    suppressedRepeatCode = null;

    if (continuousScrollDirection === null) {
      return NO_RESULT;
    }

    continuousScrollDirection = null;
    return { effects: [{ kind: 'stopContinuousScroll' }], consumed: false };
  }

  function linkHintTargets(count: number): KeyResult {
    const codes = linkHints.start(count);
    if (codes.length === 0) {
      inLinkHintMode = false;
      return NO_RESULT;
    }

    inLinkHintMode = true;
    return { effects: [{ kind: 'showLinkHints', codes }], consumed: false };
  }

  return { press, release, blur, linkHintTargets };
}

function isGuarded(key: KeyPress): boolean {
  return key.ctrl || key.alt || key.meta || key.isComposing || key.typing;
}
