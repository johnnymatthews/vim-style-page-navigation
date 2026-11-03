export type FrameScrollDirection = 1 | -1;

export type FrameScrollEffect =
  | { kind: 'scrollStep'; direction: FrameScrollDirection }
  | { kind: 'startContinuousScroll'; direction: FrameScrollDirection }
  | { kind: 'stopContinuousScroll' }
  | { kind: 'scrollToTop' }
  | { kind: 'scrollToBottom' };

export interface FrameScrollMessage {
  type: 'frameScroll';
  effect: FrameScrollEffect;
}

export function createFrameScrollMessage(effect: FrameScrollEffect): FrameScrollMessage {
  return { type: 'frameScroll', effect };
}

export function isFrameScrollMessage(message: unknown): message is FrameScrollMessage {
  if (!isRecord(message) || message.type !== 'frameScroll' || !isRecord(message.effect)) {
    return false;
  }

  const effect = message.effect;
  switch (effect.kind) {
    case 'scrollStep':
    case 'startContinuousScroll':
      return effect.direction === 1 || effect.direction === -1;
    case 'stopContinuousScroll':
    case 'scrollToTop':
    case 'scrollToBottom':
      return true;
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
