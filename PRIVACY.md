# Privacy policy

`jk-nav` is a browser extension for Vim-style page and tab navigation.

## Data

`jk-nav` collects no data. It does not read, store, or send page content,
browsing history, keystrokes, or any personal information. It makes no network
requests and contains no analytics, remote code, or third-party services.

## Why the extension runs on every page

The content script runs on every page so that the keys `j`, `k`, `gg`, `G`,
`H`, `L`, and `f` work on every page. It reads keyboard events only to decide
which key was pressed, and it reads the page's links, buttons, and form fields
only to draw Link hints on the screen. Nothing leaves the page.

## Why the extension asks for the `tabGroups` permission

`Shift+J` and `Shift+K` switch to the left or right tab. The `tabGroups`
permission lets `jk-nav` find collapsed tab groups and skip their tabs. The
extension reads only tab position, id, active state, hidden state, and group
id. It does not read tab titles or URLs.

## Contact

Open an issue at <https://github.com/Seigiard/jk-nav/issues>.
