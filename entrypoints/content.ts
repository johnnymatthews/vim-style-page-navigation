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
    }

    const keyInterpreter = createKeyInterpreter();
    const scrollMotion = createScrollMotion();
    let linkHints: LinkHint[] = [];
    let visibleElements: VisibleElement[] = [];
    let scrollAnimationFrame: number | null = null;
    let previousScrollTimestamp: number | null = null;
    let hintStylesCreated = false;

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
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
          position: fixed;
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
      const elements: VisibleElement[] = [];
      const links = document.querySelectorAll('a');
      const buttons = document.querySelectorAll<HTMLElement>(
        'button, input[type="button"], input[type="submit"], [role="button"]',
      );
      const inputs = document.querySelectorAll<HTMLElement>(
        'input:not([type="button"]):not([type="submit"]), textarea, select',
      );

      links.forEach((element) => {
        if (isElementVisible(element)) {
          elements.push({ element, type: 'link' });
        }
      });
      buttons.forEach((element) => {
        if (isElementVisible(element)) {
          elements.push({ element, type: 'button' });
        }
      });
      inputs.forEach((element) => {
        if (isElementVisible(element)) {
          elements.push({ element, type: 'input' });
        }
      });

      return elements;
    }

    function isElementVisible(element: HTMLElement): boolean {
      const rect = element.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth) &&
        getComputedStyle(element).display !== 'none' &&
        getComputedStyle(element).visibility !== 'hidden' &&
        element.offsetParent !== null
      );
    }

    function showLinkHints(codes: string[]): void {
      ensureHintStyles();
      clearLinkHints();

      visibleElements.forEach((item, index) => {
        const code = codes[index];
        if (code !== undefined) {
          createLinkHint(item.element, code, item.type);
        }
      });
    }

    function createLinkHint(element: HTMLElement, code: string, type: LinkHintType): void {
      const rect = element.getBoundingClientRect();
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
      document.body.appendChild(hintElement);
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
      linkHints.forEach((hint) => {
        hint.element.remove();
      });
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
