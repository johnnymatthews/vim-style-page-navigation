<p align="center">
  <img width="250" height="250" src="https://github.com/user-attachments/assets/5278e4c5-c8d3-4d3b-ab05-e3bc7947bbb3" alt="Vim-Style Page Navigation logo">
</p>

<h1 align="center">Vim-Style Page Navigation</h1>

A simple Firefox extension that adds vim-style keyboard navigation to any webpage. Pretty much stripped out all the extra stuff from the _excellent_ [Vimium FF](https://addons.mozilla.org/en-CA/firefox/addon/vimium-ff/) by [Phil Crosby](https://addons.mozilla.org/en-CA/firefox/user/14971172/) and [Stephen Blott](https://addons.mozilla.org/en-CA/firefox/user/12979436/).

![Vim-style link hints on a webpage](https://github.com/user-attachments/assets/1dcb7f68-55cf-4d1e-93da-87afde84ed7f)

## Controls

- `j`: Scroll down (hold to keep scrolling)
- `k`: Scroll up (hold to keep scrolling)
- `gg`: Go to top of page
- `G`: Go to bottom of page
- `H`: Go back in browser history
- `L`: Go forward in browser history
- `f`: Show a hint next to every clickable thing on screen — type its code to follow it
- `F`: Same, but opens the picked link in a new tab
  - One character per hint when there are few enough targets, two otherwise
  - Hint letters go home-row-first (`a s d f …`), so common hints sit under your fingers
  - `j`/`k` still scroll while hints are showing
  - `Backspace` undoes a typed character, `Esc` cancels
- `Esc`: Also blurs a focused text field, so `j`/`k` work again afterwards
- `?`: Show the available keys (any key dismisses)

## Features

- No settings to tune — one content script, a tiny popup, and a 10-line event page for the keyboard toggle
- Shortcuts stay out of the way while you're typing in a form
- Browser shortcuts (ctrl/cmd combos, F5, …) pass through untouched
- Works on all websites

## Disabling it on specific sites

Some sites (Gmail, GitHub, …) ship their own keyboard shortcuts. Two ways to get out of their way:

- **Toolbar popup**: click the extension's icon and hit **Disable on this site**
- **Keyboard**: `Ctrl+Shift+Y` toggles the current site from anywhere — including sites where the extension is disabled, which is exactly when you can't reach a page-level key. Remap it at `about:addons` → the gear icon → **Manage Extension Shortcuts**

Either way, the change applies instantly across all open tabs — no reload. The list is kept in `storage.local`.

## Permissions

- `storage`: remembers which sites you've disabled it on
- `activeTab`: lets the popup read the current tab's hostname when you click the icon

## Installation

### Temporary Installation (for Development)

1. Open Firefox and navigate to `about:debugging`
2. Click **This Firefox** in the sidebar
3. Click **Load Temporary Add-on...**
4. Navigate to the extension directory and select the `manifest.json` file

### Permanent Installation

1. Run `./package-extension.sh` to build `vim-style-page-navigation.zip`
2. Submit the zip to [Firefox Add-ons](https://addons.mozilla.org/developers/)
3. After approval, users can install from the Firefox Add-ons website

## Directory Structure

```
vim-style-page-navigation/
├── manifest.json            # Extension metadata
├── page-navigator.js        # Content script: all the navigation logic
├── popup.html / popup.js    # Toolbar popup: per-site on/off switch
├── background.js            # Event page: keyboard toggle command
├── site-toggle.js           # Toggle logic shared by popup and background
├── package-extension.sh     # Builds the zip for submission
├── test-page-navigator.js   # Self-check: node test-page-navigator.js
├── README.md
└── icons/
    ├── icon-48.jpg
    └── icon-96.jpg
```

## Customization

- `SCROLL_AMOUNT` at the top of `page-navigator.js` sets how far each `j`/`k` press scrolls, in pixels (default: 60). Holding a key uses the browser's native key repeat.

## License

MIT
