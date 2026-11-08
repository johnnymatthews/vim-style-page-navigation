# jk-nav

`jk-nav` is a browser extension for Vim-style page and tab navigation. It is
one Manifest V3 codebase for Chrome and Firefox.

`jk-nav` is forked from [Upstream](https://github.com/johnnymatthews/vim-style-page-navigation),
the Vim-style page navigation extension by [@johnnymatthews](https://github.com/johnnymatthews).
It keeps Upstream's page controls and adds keyboard tab switching.

## Install

- Chrome: [Chrome Web Store](https://chromewebstore.google.com/detail/bceclnmjinfeoafkifaalopkhepjobgb)
- Firefox: [addons.mozilla.org/addon/jk-nav](https://addons.mozilla.org/addon/jk-nav/)

## Keys

| Key | Action |
| --- | --- |
| `j` | Scroll down by one Scroll step. |
| `k` | Scroll up by one Scroll step. |
| `gg` | Go to the top of the page. |
| `G` | Go to the bottom of the page. |
| `H` | Go back in browser history. |
| `L` | Go forward in browser history. |
| `f` | Enter Link-hint mode. `jk-nav` shows a two-key Hint code beside each visible link, button, and form field, at most 900 at a time: the first 900 in document order, links first, then buttons, then form fields. Controls that web apps build with ARIA roles, such as the message rows and checkboxes in Gmail, count as links and buttons. Type a code to activate that element. |
| `Esc` | Leave Link-hint mode without activating an element. |
| `Shift+J` | Switch to the Left tab in the current window. |
| `Shift+K` | Switch to the Right tab in the current window. |

Keys act in the focused frame, including inside an iframe. At a frame's edge, or when the frame cannot scroll, `j` and `k` scroll the page around it.

The Keys are matched by their physical QWERTY positions. They work in any
keyboard layout. `Shift` decides the case, so Caps Lock does not change what a
Key does. Hint codes use physical key positions too.

`jk-nav` stays silent while Typing in a text field, text area, drop-down list,
or editable page content. Buttons, checkboxes, radio buttons, and sliders are
not Typing, so the page Keys continue to work after using those controls.
Keys with `Ctrl`, `Alt`, or `Meta` pass through to the browser and the page.
Keys pressed during IME composition are ignored.

Tab switches wrap at both ends of the tab strip. They skip hidden tabs and tabs
inside collapsed tab groups. A switch never leaves the current window.

## Development

Install dependencies once:

```sh
npm ci
```

Start development mode with hot reload:

```sh
npm run dev          # Chrome
npm run dev:firefox  # Firefox
```

Build the extension and create store packages:

```sh
npm run build          # Chrome build
npm run build:firefox  # Firefox build
npm run zip            # Chrome store package
npm run zip:firefox    # Firefox store package
```

Before a release, check both packages by hand in Chrome and Firefox:
[docs/release-check.md](docs/release-check.md).

## Performance

`docs/bench/` measures page-load overhead and key latency in Chromium;
`docs/bench/README.md` has the method and the last result against Vimium C.
`npm run bench:check` compares the current build with `docs/bench/baseline.json`
in a fixed Docker container and fails on a regression.

## Permissions

`jk-nav` requests the `tabGroups` permission. It uses this permission to detect
collapsed tab groups and skip their tabs during a Tab switch. It requests no
other API permission.

## Known limitations

- **Restricted pages:** Browser pages such as `chrome://`, `about:`, extension
  stores, and built-in PDF viewers do not allow `jk-nav` to run. No Key works
  on these pages. A Tab switch can still land on one; leave it with the
  browser's own shortcut.
- **Site shortcut conflicts:** Sites such as Gmail, GitHub, and X may have
  their own `j` and `k` shortcuts. `jk-nav` takes those Keys while the user is
  not Typing, so those site shortcuts can conflict.

## Credits and license

The original project is [Upstream](https://github.com/johnnymatthews/vim-style-page-navigation)
by [@johnnymatthews](https://github.com/johnnymatthews). Upstream was inspired
by the excellent [Vimium FF](https://addons.mozilla.org/en-CA/firefox/addon/vimium-ff/)
by [Phil Crosby](https://addons.mozilla.org/en-CA/firefox/user/14971172/) and
[Stephen Blott](https://addons.mozilla.org/en-CA/firefox/user/12979436/).

This project is released under the [MIT License](https://opensource.org/license/mit/).
