import {
  createKeyInterpreter,
  type KeyEffect,
  type KeyPress,
  type KeyResult,
} from '../utils/key-interpreter';
import {
  createScrollMotion,
  SCROLL_STEP_PX,
} from '../utils/scroll-motion';
import {
  createFrameScrollMessage,
  isFrameScrollMessage,
  type FrameScrollEffect,
} from '../utils/frame-scroll';
import { createTabSwitchMessage } from '../utils/tab-switch';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  matchAboutBlank: true,
  matchOriginAsFallback: { chrome: true, firefox: true },
  main() {
    const NON_TYPING_INPUT_TYPES = new Set([
      'checkbox',
      'radio',
      'range',
      'color',
      'file',
      'button',
      'submit',
      'reset',
      'image',
    ]);

    // Fields a person cannot type into: a Link hint activates them instead of focusing them.
    // A slider keeps focus, so the arrow keys can move it.
    const CLICKED_INPUT_TYPES = new Set([
      'checkbox',
      'radio',
      'color',
      'file',
      'reset',
      'image',
    ]);

    // ARIA widgets that web apps such as Gmail build from plain elements; a click activates them.
    const CLICKABLE_ROLE_SELECTOR = [
      'button',
      'link',
      'checkbox',
      'switch',
      'radio',
      'tab',
      'menuitem',
      'menuitemcheckbox',
      'menuitemradio',
    ].map((role) => `[role="${role}"]`).join(', ');

    type LinkHintType = 'link' | 'button' | 'input';

    interface LinkHint {
      element: HTMLDivElement;
      target: HTMLElement;
      code: string;
      type: LinkHintType;
    }

    interface VisibleElement {
      element: HTMLElement;
      type: LinkHintType;
      rect: DOMRect;
    }

    const keyInterpreter = createKeyInterpreter();
    const scrollMotion = createScrollMotion();
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let linkHints: LinkHint[] = [];
    let visibleElements: VisibleElement[] = [];
    let scrollAnimationFrame: number | null = null;
    let previousScrollTimestamp: number | null = null;
    let hintStylesCreated = false;
    let hintContainer: HTMLDivElement | null = null;
    let continuousScrollForwarded = false;
    let topForwardedContinuousScrollRunning = false;
    let frameScrollMessages = Promise.resolve();
    const NOMINAL_FRAME_ELAPSED_MS = 8;

    function startContinuousScroll(direction: 1 | -1): void {
      stopForwardedContinuousScroll();
      stopContinuousScroll();
      scrollMotion.startContinuous(direction);
      scheduleScrollAnimation();
    }

    function stopForwardedContinuousScroll(): void {
      if (!continuousScrollForwarded) {
        return;
      }

      continuousScrollForwarded = false;
      sendFrameScroll({ kind: 'stopContinuousScroll' });
    }

    function stopContinuousScroll(): void {
      topForwardedContinuousScrollRunning = false;
      scrollMotion.stopContinuous();
      if (scrollAnimationFrame !== null) {
        cancelAnimationFrame(scrollAnimationFrame);
        scrollAnimationFrame = null;
      }
      previousScrollTimestamp = null;
    }

    function scheduleScrollAnimation(): void {
      if (scrollAnimationFrame === null) {
        const distance = scrollMotion.advance(NOMINAL_FRAME_ELAPSED_MS);
        if (distance !== 0) {
          window.scrollBy({ top: distance, behavior: 'instant' });
        }
        previousScrollTimestamp = performance.now();
        scrollAnimationFrame = requestAnimationFrame(animateScroll);
      }
    }

    function animateScroll(timestamp: number): void {
      scrollAnimationFrame = null;
      const elapsedMs = previousScrollTimestamp === null
        ? 0
        : Math.max(timestamp - previousScrollTimestamp, 1);
      previousScrollTimestamp = timestamp;
      const distance = scrollMotion.advance(elapsedMs);

      if (distance !== 0) {
        window.scrollBy({ top: distance, behavior: 'instant' });
      }

      if (scrollMotion.isMoving()) {
        scrollAnimationFrame = requestAnimationFrame(animateScroll);
      } else {
        previousScrollTimestamp = null;
      }
    }

    function scrollStep(direction: 1 | -1): void {
      if (reducedMotionQuery.matches) {
        stopContinuousScroll();
        window.scrollBy({ top: SCROLL_STEP_PX * direction, behavior: 'instant' });
        return;
      }

      scrollMotion.addStep(direction);
      scheduleScrollAnimation();
    }

    function toKeyPress(event: KeyboardEvent): KeyPress {
      return {
        code: event.code,
        repeat: event.repeat,
        shift: event.shiftKey,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        meta: event.metaKey,
        isComposing: event.isComposing,
        typing: isUserTyping(event),
        trusted: event.isTrusted,
        timeStamp: event.timeStamp,
      };
    }

    function applyResult(result: KeyResult, event?: KeyboardEvent): void {
      if (result.consumed) {
        // The adapter owns the browser event. The interpreter owns the decision.
        event?.preventDefault();
      }

      for (const effect of result.effects) {
        applyEffect(effect, event);
      }
    }

    function applyEffect(effect: KeyEffect, event?: KeyboardEvent): void {
      switch (effect.kind) {
        case 'scrollStep':
          if (maybeForwardScroll(effect, event)) {
            return;
          }
          scrollStep(effect.direction);
          return;
        case 'startContinuousScroll':
          if (maybeForwardScroll(effect, event)) {
            return;
          }
          startContinuousScroll(effect.direction);
          return;
        case 'stopContinuousScroll':
          stopContinuousScroll();
          stopForwardedContinuousScroll();
          return;
        case 'scrollToTop':
          if (maybeForwardScroll(effect, event)) {
            return;
          }
          stopContinuousScroll();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        case 'scrollToBottom':
          if (maybeForwardScroll(effect, event)) {
            return;
          }
          stopContinuousScroll();
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          return;
        case 'historyBack':
          window.history.back();
          return;
        case 'historyForward':
          window.history.forward();
          return;
        case 'tabSwitch':
          void browser.runtime.sendMessage(createTabSwitchMessage(effect.direction)).catch(() => undefined);
          return;
        case 'collectLinkHintTargets':
          stopContinuousScroll();
          visibleElements = collectVisibleElements();
          applyResult(keyInterpreter.linkHintTargets(visibleElements.length), event);
          return;
        case 'showLinkHints':
          showLinkHints(effect.codes);
          return;
        case 'narrowLinkHints':
          narrowLinkHints(effect.visible);
          return;
        case 'activateLinkHint':
          activateLinkHint(effect.index);
          return;
        case 'exitLinkHints':
          exitLinkHintMode();
          return;
      }
    }

    function maybeForwardScroll(
      effect: FrameScrollEffect,
      event?: KeyboardEvent,
    ): boolean {
      const direction = scrollDirection(effect);
      if (window === window.top || canScrollFrame(direction)) {
        return false;
      }

      if (event?.isTrusted !== true) {
        return true;
      }

      if (effect.kind === 'startContinuousScroll') {
        stopContinuousScroll();
        stopForwardedContinuousScroll();
      }
      sendFrameScroll(effect);
      if (effect.kind === 'startContinuousScroll') {
        continuousScrollForwarded = true;
      }
      return true;
    }

    function sendFrameScroll(effect: FrameScrollEffect): void {
      const message = createFrameScrollMessage(effect);
      frameScrollMessages = frameScrollMessages
        .then(() => browser.runtime.sendMessage(message))
        .catch(() => undefined);
    }

    function scrollDirection(effect: FrameScrollEffect): 1 | -1 {
      switch (effect.kind) {
        case 'scrollStep':
        case 'startContinuousScroll':
          return effect.direction;
        case 'scrollToTop':
          return -1;
        case 'scrollToBottom':
          return 1;
        case 'stopContinuousScroll':
          return 1;
      }
    }

    function canScrollFrame(direction: 1 | -1): boolean {
      const scrollingElement = document.scrollingElement;
      if (scrollingElement === null) {
        return false;
      }

      const htmlOverflowY = getComputedStyle(document.documentElement).overflowY;
      if (htmlOverflowY === 'hidden' || htmlOverflowY === 'clip') {
        return false;
      }

      const body = document.body;
      const bodyOverflowY = body === null ? null : getComputedStyle(body).overflowY;
      if (
        (bodyOverflowY === 'hidden' || bodyOverflowY === 'clip') &&
        (htmlOverflowY === 'visible' || scrollingElement === body)
      ) {
        return false;
      }

      return direction === 1
        ? scrollingElement.scrollTop + scrollingElement.clientHeight < scrollingElement.scrollHeight - 1
        : scrollingElement.scrollTop > 0;
    }

    function createHintStyles(): void {
      const style = document.createElement('style');
      style.id = 'vimnav-styles';
      style.textContent = `
        .vimnav-link-hint {
          position: absolute;
          background-color: #ffff00;
          color: #000000;
          border: 1px solid #000000;
          padding: 2px 4px;
          font-size: 12px;
          font-weight: bold;
          z-index: 2147483647;
          border-radius: 4px;
          box-shadow: 2px 2px 3px rgba(0, 0, 0, 0.3);
          font-family: monospace;
        }

        .vimnav-button-hint {
          background-color: #ffa500;
        }

        .vimnav-input-hint {
          background-color: #90ee90;
        }
      `;
      const styleParent = document.head ?? document.documentElement;
      styleParent?.appendChild(style);
    }

    function ensureHintStyles(): void {
      if (hintStylesCreated) {
        return;
      }

      createHintStyles();
      hintStylesCreated = document.getElementById('vimnav-styles') !== null;
    }

    function collectVisibleElements(): VisibleElement[] {
      const links: VisibleElement[] = [];
      const buttons: VisibleElement[] = [];
      const inputs: VisibleElement[] = [];
      const candidates = document.querySelectorAll<HTMLElement>(
        `a, button, input, textarea, select, ${CLICKABLE_ROLE_SELECTOR}`,
      );

      candidates.forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (!isElementVisible(element, rect)) {
          return;
        }

        if (element.matches('a, [role="link"]')) {
          links.push({ element, type: 'link', rect });
        } else if (element.matches(`button, input[type="button"], input[type="submit"], ${CLICKABLE_ROLE_SELECTOR}`)) {
          buttons.push({ element, type: 'button', rect });
        } else {
          inputs.push({ element, type: 'input', rect });
        }
      });

      return [...links, ...buttons, ...inputs];
    }

    function isElementVisible(element: HTMLElement, rect: DOMRect): boolean {
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.top < 0 ||
        rect.left < 0 ||
        rect.bottom > (window.innerHeight || document.documentElement.clientHeight) ||
        rect.right > (window.innerWidth || document.documentElement.clientWidth)
      ) {
        return false;
      }

      if (typeof element.checkVisibility === 'function') {
        return element.checkVisibility({ visibilityProperty: true });
      }

      const computedStyle = getComputedStyle(element);
      return computedStyle.display !== 'none' &&
        computedStyle.visibility !== 'hidden' &&
        element.offsetParent !== null;
    }

    function showLinkHints(codes: string[]): void {
      ensureHintStyles();
      clearLinkHints();
      hintContainer = document.createElement('div');
      hintContainer.style.position = 'fixed';
      hintContainer.style.inset = '0';
      hintContainer.style.contain = 'layout';
      hintContainer.style.pointerEvents = 'none';
      hintContainer.style.zIndex = '2147483647';
      const fragment = document.createDocumentFragment();

      visibleElements.forEach((item, index) => {
        const code = codes[index];
        if (code !== undefined) {
          createLinkHint(item.element, code, item.type, item.rect, fragment);
        }
      });
      hintContainer.appendChild(fragment);
      document.body.appendChild(hintContainer);
    }

    function createLinkHint(
      element: HTMLElement,
      code: string,
      type: LinkHintType,
      rect: DOMRect,
      fragment: DocumentFragment,
    ): void {
      const hintElement = document.createElement('div');
      hintElement.textContent = code;
      hintElement.className = 'vimnav-link-hint';

      if (type === 'button') {
        hintElement.classList.add('vimnav-button-hint');
      } else if (type === 'input') {
        hintElement.classList.add('vimnav-input-hint');
      }

      hintElement.style.top = `${rect.top - 10}px`;
      hintElement.style.left = `${rect.left - 10}px`;
      fragment.appendChild(hintElement);
      linkHints.push({ element: hintElement, target: element, code, type });
    }

    function narrowLinkHints(visible: number[]): void {
      const visibleSet = new Set(visible);
      linkHints.forEach((hint, index) => {
        if (visibleSet.has(index)) {
          hint.element.style.backgroundColor = '#88ff88';
        } else {
          hint.element.style.display = 'none';
        }
      });
    }

    function activateLinkHint(index: number): void {
      const hint = linkHints[index];
      if (hint !== undefined) {
        activateElement(hint.target, hint.type);
      }
    }

    function activateElement(element: HTMLElement, type: LinkHintType): void {
      if (type === 'input' && !(element instanceof HTMLInputElement && CLICKED_INPUT_TYPES.has(element.type))) {
        element.focus();
      } else {
        element.click();
      }
    }

    function exitLinkHintMode(): void {
      clearLinkHints();
      visibleElements = [];
    }

    function clearLinkHints(): void {
      hintContainer?.remove();
      hintContainer = null;
      linkHints = [];
    }

    function isUserTyping(event: KeyboardEvent): boolean {
      for (const target of event.composedPath()) {
        if (!(target instanceof HTMLElement)) {
          continue;
        }

        if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
          return true;
        }

        if (target instanceof HTMLInputElement) {
          return !NON_TYPING_INPUT_TYPES.has(target.type);
        }

        return target.isContentEditable;
      }

      return false;
    }

    function stopTopForwardedContinuousScroll(): void {
      if (topForwardedContinuousScrollRunning) {
        stopContinuousScroll();
      }
    }

    function applyForwardedEffect(effect: FrameScrollEffect): void {
      if (effect.kind === 'stopContinuousScroll') {
        topForwardedContinuousScrollRunning = false;
      }
      applyEffect(effect);
      if (effect.kind === 'startContinuousScroll') {
        topForwardedContinuousScrollRunning = true;
      }
    }

    document.addEventListener('keydown', (event) => {
      applyResult(keyInterpreter.press(toKeyPress(event)), event);
    });

    document.addEventListener('keyup', (event) => {
      applyResult(keyInterpreter.release(event.code));
      if (window === window.top && (event.code === 'KeyJ' || event.code === 'KeyK')) {
        stopTopForwardedContinuousScroll();
      }
    });

    window.addEventListener('blur', () => {
      applyResult(keyInterpreter.blur());
      if (window === window.top) {
        stopTopForwardedContinuousScroll();
      }
    });

    if (window === window.top) {
      browser.runtime.onMessage.addListener((message: unknown) => {
        if (isFrameScrollMessage(message)) {
          applyForwardedEffect(message.effect);
        }
      });

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          stopTopForwardedContinuousScroll();
        }
      });
    }

    document.documentElement?.setAttribute('data-jk-nav', 'ready');
  },
});
