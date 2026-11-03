import { describe, expect, it } from 'vitest';

import {
  createFrameScrollMessage,
  isFrameScrollMessage,
  type FrameScrollEffect,
} from '../../utils/frame-scroll';

describe('frame scroll messages', () => {
  it('constructs a frameScroll message carrying the requested effect', async () => {
    // #given
    const effect: FrameScrollEffect = { kind: 'scrollStep', direction: 1 };

    // #when
    const message = createFrameScrollMessage(effect);

    // #then
    expect(message).toEqual({ type: 'frameScroll', effect: { kind: 'scrollStep', direction: 1 } });
  });

  it('accepts every well-formed frame scroll effect', async () => {
    // #given
    const messages = [
      { type: 'frameScroll', effect: { kind: 'scrollStep', direction: 1 } },
      { type: 'frameScroll', effect: { kind: 'scrollStep', direction: -1 } },
      { type: 'frameScroll', effect: { kind: 'startContinuousScroll', direction: 1 } },
      { type: 'frameScroll', effect: { kind: 'startContinuousScroll', direction: -1 } },
      { type: 'frameScroll', effect: { kind: 'stopContinuousScroll' } },
      { type: 'frameScroll', effect: { kind: 'scrollToTop' } },
      { type: 'frameScroll', effect: { kind: 'scrollToBottom' } },
    ];

    // #when
    const decisions = messages.map((message) => isFrameScrollMessage(message));

    // #then
    expect(decisions).toEqual([true, true, true, true, true, true, true]);
  });

  it('rejects malformed and unknown frame scroll messages', async () => {
    // #given
    const messages = [
      { type: 'tabSwitch', effect: { kind: 'scrollStep', direction: 1 } },
      { type: 'frameScroll', effect: { kind: 'unknown' } },
      { type: 'frameScroll', effect: { kind: 'scrollStep', direction: 0 } },
      { type: 'frameScroll', effect: { kind: 'scrollStep' } },
      null,
    ];

    // #when
    const decisions = messages.map((message) => isFrameScrollMessage(message));

    // #then
    expect(decisions).toEqual([false, false, false, false, false]);
  });
});
