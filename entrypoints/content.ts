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
import { createTabSwitchMessage } from '../utils/tab-switch';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    document.documentElement?.setAttribute('data-jk-nav', 'ready');

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
    let reducedMotion = reducedMotionQuery.matches;
    let linkHints: LinkHint[] = [];
    let visibleElements: VisibleElement[] = [];
    let scrollAnimationFrame: number | null = null;
    let previousScrollTimestamp: number | null = null;
    let hintStylesCreated = false;
    let hintContainer: HTMLDivElement | null = null;
    const NOMINAL_FRAME_ELAPSED_MS = 8;

    reducedMotionQuery.addEventListener('change', (event) => {
      reducedMotion = event.matches;
    });

    function startContinuousScroll(direction: 1 | -1): void {
      stopContinuousScroll();
      scrollMotion.startContinuous(direction);
      scheduleScrollAnimation();
    }

    function stopContinuousScroll(): void {
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
      if (reducedMotion) {
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
          scrollStep(effect.direction);
          return;
        case 'startContinuousScroll':
          startContinuousScroll(effect.direction);
          return;
        case 'stopContinuousScroll':
          stopContinuousScroll();
          return;
        case 'scrollToTop':
          stopContinuousScroll();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        case 'scrollToBottom':
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
        'a, button, input, textarea, select, [role="button"]',
      );

      candidates.forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (!isElementVisible(element, rect)) {
          return;
        }

        if (element.matches('a')) {
          links.push({ element, type: 'link', rect });
        } else if (element.matches('button, input[type="button"], input[type="submit"], [role="button"]')) {
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
      if (type === 'input') {
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

    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyJ' || event.code === 'KeyK') {
        // Media-query change events can be delivered after a key event.
        reducedMotion = reducedMotionQuery.matches;
      }
      applyResult(keyInterpreter.press(toKeyPress(event)), event);
    });

    document.addEventListener('keyup', (event) => {
      applyResult(keyInterpreter.release(event.code));
    });

    window.addEventListener('blur', () => {
      applyResult(keyInterpreter.blur());
    });
  },
});
