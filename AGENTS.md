# AGENTS.md

## Project state

The spec is GitHub issue #1 (`gh issue view 1`). Read it before any work; it is the source of truth for keys, FR/NFR numbers, and acceptance criteria. Domain terms are in `GLOSSARY.md`.

This repo is `Seigiard/jk-nav`, a GitHub fork of `johnnymatthews/vim-style-page-navigation` (MIT; remote `upstream`). One WXT codebase builds the Manifest V3 extension for Chrome and Firefox. The default branch is `main`; pull requests target it.

## Commands

`package.json` `scripts` lists the commands. What the scripts do not say:

- `npm test` is the full gate: build, Vitest, then Playwright.
- Set `E2E_PORT` when several checkouts run e2e at once; each needs its own fixture-server port (default 4173).
- Playwright runs only in Chromium. The Firefox package is checked by hand through `docs/release-check.md`.
- Both `npm run zip` and `npm run zip:firefox` must succeed (acceptance criterion 8).
- `npm run bench:check` is the performance gate before a release. It needs Docker, takes about 6 minutes, and compares medians with `docs/bench/baseline.json`; `docs/bench/README.md` has the rule. A native `npm run bench` cannot check or record the baseline.

## Architecture

Two entrypoints, joined by tab-switch and frame-scroll messages:

- `entrypoints/content.ts` is Upstream `page-navigator.js` inside `defineContentScript({ matches: ['<all_urls>'], allFrames: true })`. It is a DOM adapter for the stateful interpreter in `utils/key-interpreter.ts`: it reads keyboard events, computes typing state, applies effects, and owns the DOM work for scrolling and Link-hint display in the focused frame. Scroll timing is pure state in `utils/scroll-motion.ts`; `content.ts` drives it with one `requestAnimationFrame` loop and applies the resulting pixels to the page. A subframe checks its root scroller before scroll effects. When it cannot move, a trusted event sends a guarded `frameScroll` message from `utils/frame-scroll.ts`; the background relays it to frame 0, where the top-frame content script applies the effect. A continuous-scroll start stops any previous local or forwarded loop before starting on the latest target; a stop always stops the local loop and forwards a stop when needed. On a Tab switch it sends one `browser.runtime.sendMessage` built by `createTabSwitchMessage` in `utils/tab-switch.ts`, carrying the direction, left or right (glossary: Left tab, Right tab). The interpreter accepts tab switches only for trusted events (`event.isTrusted`), so a page script cannot switch the user's tabs.
- `entrypoints/background.ts` is stateless. Chrome runs it as a service worker and Firefox as an event page, so keep no state in module variables. It accepts tab-switch messages passing `isTabSwitchMessage` from `utils/tab-switch.ts` and frame-scroll messages passing `isFrameScrollMessage` from `utils/frame-scroll.ts`. For a frame-scroll message from a subframe it calls `tabs.sendMessage(sender.tab.id, message, { frameId: 0 })`. For a tab switch it uses the sender tab's window: it calls `tabs.query({ windowId })` and `tabGroups.query({ windowId, collapsed: true })`, passes the raw tabs and collapsed group ids to `selectTabSwitchTarget` in `utils/tab-switch.ts`, then calls `tabs.update(id, { active: true })`. Where `tabGroups` is missing or throws (Firefox before 139), the collapsed group id set is empty.
- `wxt.config.ts` replaces `manifest.json`. It sets `browser_specific_settings.gecko.id`, which Firefox needs for signing, and `gecko.data_collection_permissions`, which AMO needs for new submissions.

Tab switching needs a content script: the `commands` manifest API accepts only shortcuts with `Ctrl` or `Alt`.

## Constraints

- One API permission: `tabGroups`, to skip tabs in collapsed groups (spec FR-3a, NFR-2). `tabs.query` and `tabs.update` work without the `tabs` permission because the code reads only tab `index`, `id`, `active`, `hidden`, and `groupId`. Adding another permission changes the store review, so treat it as a product decision.
- Keep the Tab switch message constructor, guard, and target selection in `utils/tab-switch.ts`. `background.ts` contains only the `browser.tabs.*` and `browser.tabGroups.*` calls around that module; add no port or adapter.
- No network, remote code, or analytics.
- The content script stays vanilla TypeScript with no UI framework.
- Keep the `J` = left tab, `K` = right tab mapping in one constant, `TAB_SWITCH_DIRECTIONS` in `utils/key-interpreter.ts` (FR-1).
- Keep the Upstream MIT license and author credit in the README.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `Seigiard/jk-nav`, through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
