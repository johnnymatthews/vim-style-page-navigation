# Store listing

Text and answers for the Chrome Web Store and addons.mozilla.org (AMO) listings
of `jk-nav`. Keep this file and the manifest in `wxt.config.ts` in step.

## Name

`jk-nav`

## Summary (Chrome: 132 characters max; AMO: 250)

Vim keys on every page: j/k scroll, gg/G, f link hints, H/L history, Shift+J/K switch tabs. Works in any keyboard layout.

## Description

jk-nav adds Vim-style keyboard navigation to every page, in Chrome and Firefox, from one codebase.

It is a fork of "Vim-Style Page Navigation" by Johnny Matthews (https://github.com/johnnymatthews/vim-style-page-navigation), published on AMO as "Simple Vim Scrolling". jk-nav keeps the original page keys and adds tab switching, layout-independent keys and smooth scrolling.

KEYS

- j / k: scroll down / up by one step (200 px). Hold the key to keep scrolling; release to stop.
- gg / G: go to the top / bottom of the page.
- H / L: go back / forward in history.
- f: show a two-letter hint beside every visible link, button and form field. Type the hint to activate it. Esc leaves hint mode.
- Shift+J / Shift+K: switch to the tab on the left / right. Wraps at both ends, skips hidden tabs and tabs in collapsed tab groups, never leaves the window.

WHAT IS NEW COMPARED WITH THE ORIGINAL

- Tab switching with Shift+J / Shift+K.
- Keys are matched by physical key position, so they work in Russian and other non-Latin layouts, and Caps Lock does not change them.
- Keys stay silent while you type in a text field, text area, drop-down or editable content, and during IME composition. Buttons, checkboxes and sliders do not block the keys.
- A tap of j / k scrolls one smooth step; holding scrolls continuously and stops the moment you release.
- Keys with Ctrl, Alt or Meta pass through to the browser, so Ctrl+F still opens the find bar.
- Up to 900 link hints at a time: links first, then buttons, then form fields.
- Manifest V3, one package for Chrome and Firefox, with unit and browser tests.

PRIVACY

jk-nav collects no data, makes no network requests and runs no remote code. Its only API permission is tabGroups, used to skip collapsed tab groups when switching tabs. Privacy policy: https://github.com/Seigiard/jk-nav/blob/main/PRIVACY.md

KNOWN LIMITATIONS

- Browser pages (chrome://, about:, the extension stores, built-in PDF viewers) do not allow extensions, so no key works there.
- Sites with their own j / k shortcuts (Gmail, GitHub, X) conflict with jk-nav while you are not typing.

Source code: https://github.com/Seigiard/jk-nav (MIT).

## Category

Chrome: Productivity > Tools. AMO: Other, or Tabs.

## Chrome Web Store: privacy tab

- **Single purpose:** Vim-style keyboard navigation of pages and tabs.
- **Permission justification, `tabGroups`:** Shift+J / Shift+K switch to the
  neighbouring tab. The extension queries collapsed tab groups in the current
  window so that the switch skips their tabs. It reads only tab index, id,
  active, hidden and groupId.
- **Host permission justification (content script on all URLs):** The keys
  must work on every page. The content script reads keyboard events to run the
  keys, and reads visible links, buttons and form fields to draw link hints.
  No page data is stored or transmitted.
- **Remote code:** No.
- **Data usage:** Nothing collected. Certify all three statements.
- **Privacy policy URL:** https://github.com/Seigiard/jk-nav/blob/main/PRIVACY.md

## AMO: submission answers

- **Source code:** upload `.output/jk-nav-<version>-sources.zip`, because the
  package is bundled and minified by Vite. Build instructions for the reviewer:
  `npm ci && npm run zip:firefox` with Node 26; the package appears in `.output/`.
- **Data collection:** none (`data_collection_permissions.required: ["none"]`
  in the manifest).
- **Licence:** MIT.
- **Firefox minimum version:** 109 (Manifest V3); the `tabGroups` skip needs
  139, older versions switch into collapsed groups.

## Assets

- Icon: `public/icons/128x128.png`.
- Screenshots (1280×800): `docs/store/screenshot-*.png`, built by
  `docs/store/screenshots.ts`.
