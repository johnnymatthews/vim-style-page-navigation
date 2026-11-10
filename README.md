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
- `f`: Show a hint next to every clickable thing on screen. Type its code to follow it
- `F`: Same, but opens the picked link in a new tab
  - One character per hint when there are few enough targets, two otherwise
  - Hint letters go home-row-first (`a s d f …`), so common hints sit under your fingers
  - `j`/`k` still scroll while hints are showing
  - `Backspace` undoes a typed character, `Esc` cancels
- `Esc`: Also blurs a focused text field, so `j`/`k` work again afterwards
- `?`: Show the available keys (any key dismisses)

## Features

- No settings to tune. Just one content script, a tiny popup, and a 10-line event page for the keyboard toggle
- Shortcuts stay out of the way while you're typing in a form
- Browser shortcuts (ctrl/cmd combos, F5, …) pass through untouched
- Works on all websites

## Disabling it on specific sites

Some sites (Gmail, GitHub, …) ship their own keyboard shortcuts. Click the extension's toolbar icon and hit **Disable on this site**, or press `Ctrl+Shift+Y` to toggle the current site from the keyboard. The keyboard route keeps working on sites where the extension is disabled, which is exactly when you can't reach a page-level key. Remap it at `about:addons` → gear icon → **Manage Extension Shortcuts**.

Either way, the change applies instantly across all open tabs, no reload. The list lives in `storage.local`.

## Permissions

- `storage`: remembers which sites you've disabled it on
- `activeTab`: lets the popup read the current tab's hostname when you click the icon

## Installation

### Temporary installation (for development)

1. Open Firefox and navigate to `about:debugging`
2. Click **This Firefox** in the sidebar
3. Click **Load Temporary Add-on...**
4. Navigate to the extension directory and select the `manifest.json` file

### Permanent installation

1. Run `./package-extension.sh` to build a versioned zip
2. Submit the zip to [Firefox Add-ons](https://addons.mozilla.org/developers/)
3. After approval, users can install from the Firefox Add-ons website

## Directory structure

```
vim-style-page-navigation/
├── manifest.json            # Extension metadata: name, version, permissions, keyboard command
├── page-navigator.js        # Content script with all the navigation logic
├── popup.html               # Toolbar popup markup and styles
├── popup.js                 # Toolbar popup behavior: shows the site, flips the switch
├── background.js            # Event page that handles the Ctrl+Shift+Y toggle command
├── site-toggle.js           # Enable/disable logic shared by the popup and background page
├── package-extension.sh     # Builds the AMO submission zip, versioned from manifest.json
├── test-page-navigator.js   # Dependency-free self-check: node test-page-navigator.js
├── .gitignore               # Keeps built zips out of git
├── README.md                # This file
├── icons/                   # Extension icons
│   ├── icon-48.jpg          # 48px, shown in the add-ons manager
│   └── icon-96.jpg          # 96px, shown on the AMO listing
└── .github/
    └── workflows/
        └── build.yml        # CI: self-check + zip build on every push to firefox/stable
```

## Customization

`SCROLL_AMOUNT` at the top of `page-navigator.js` sets how far each `j`/`k` press scrolls, in pixels (default: 60). Holding a key uses the browser's native key repeat.

## License

MIT
