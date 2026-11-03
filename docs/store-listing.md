# Store listing

Text and answers for the Chrome Web Store and addons.mozilla.org (AMO) listings
of `jk-nav`. Name and Summary are copies of `name` and `description` in
`wxt.config.ts`. Chrome reads them from the manifest; AMO takes them typed. A
change to either field is made in both places in one commit.

## Name

`JK Vim-Style Page/Tab Navigation` (short name in the code and the repository: `jk-nav`)

## Summary (Chrome: 132 characters max; AMO: 250)

Vim keys on every page: j/k scroll, gg/G, f link hints, H/L history, Shift+J/K switch tabs. Works in any keyboard layout.

## Description

JK Vim-Style Page/Tab Navigation (jk-nav) adds Vim-style keyboard navigation to every page and to the tab strip, in Chrome and Firefox, from one codebase.

KEYS

- j / k: scroll down / up by one step. Hold the key to keep scrolling; release to stop.
- gg / G: go to the top / bottom of the page.
- H / L: go back / forward in history.
- f: show a two-character hint beside up to 900 visible links, buttons and form fields. Type the hint to activate it. Esc leaves hint mode.
- Shift+J / Shift+K: switch to the tab on the left / right. Wraps at both ends, skips hidden tabs and, in Chrome and Firefox 139 or newer, tabs in collapsed tab groups. Stays in the current window.

HIGHLIGHTS

- Added Tab switching with Shift+J / Shift+K alongside the page keys.
- Keys work in every keyboard layout. They are matched by physical key position, so Russian, German or any other layout behaves like QWERTY, and Caps Lock changes nothing.
- Typing stays yours: in text fields, text areas, drop-downs, editable content and during IME composition, the keys type text as usual, also inside web components. After you click a button, checkbox or slider, the keys keep working.
- Link hints that behave: f does nothing on a page with no targets, a wrong first key just closes the hints, and very large pages no longer break hint mode.
- Smooth scrolling: every j / k step is animated, and holding the key scrolls continuously.
- Shortcuts with Ctrl, Alt or Meta pass through, so Ctrl+F still opens the find bar.

PRIVACY

jk-nav collects no data, makes no network requests and runs no remote code. Its only API permission is tabGroups, used to skip collapsed tab groups when switching tabs. Privacy policy: https://github.com/Seigiard/jk-nav/blob/main/PRIVACY.md

KNOWN LIMITATIONS

- Browser pages (chrome://, about:, the extension stores, built-in PDF viewers) do not allow extensions, so no key works there. A tab switch can still land on one; leave it with the browser's own shortcut.
- Sites with their own j / k shortcuts (Gmail, GitHub, X) conflict with jk-nav while you are not typing.

ORIGIN

jk-nav is a fork of "Vim-Style Page Navigation" by Johnny Matthews (https://github.com/johnnymatthews/vim-style-page-navigation), published on AMO as "Simple Vim Scrolling". The fork adds tab switching, makes the keys work in every keyboard layout, and fixes scrolling, Ctrl+F and typing detection; the same changes are proposed upstream in https://github.com/johnnymatthews/vim-style-page-navigation/pull/1. Every key of the original keeps its meaning.

Source code: https://github.com/Seigiard/jk-nav (MIT).

## Category

Chrome: Productivity > Tools. AMO: Tabs.

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

- **Source code:** `npm run zip:firefox` writes both
  `.output/jk-nav-<version>-firefox.zip` and `.output/jk-nav-<version>-sources.zip`;
  upload the sources zip, because the package is bundled and minified by Vite.
  Reviewer build instructions: `npm ci && npm run zip:firefox` on the Node
  version pinned in `.github/workflows/ci.yml`; the result to compare is
  `.output/jk-nav-<version>-firefox.zip`.
- **Data collection:** none (`data_collection_permissions.required: ["none"]`
  in the manifest).
- **Licence:** MIT.

## Assets

- Icon: `public/icons/128x128.png`.
- Screenshots (1280×800): `docs/store/screenshot-1-keys.png` (key overlay) and
  `docs/store/screenshot-2-link-hints.png`. Regenerate with
  `npm run build && npx tsx docs/store/screenshots.ts`, then compress each PNG
  with `magick <file> -colors 256 <file>` to under 150 KB.
