# Release check

A manual check of both store packages before a release. The Playwright suite runs only in Chromium, because Playwright cannot load a Firefox extension. This check is the only test of the Firefox package.

Do every step in the latest Chrome and the latest Firefox. The steps follow the acceptance criteria of the spec, GitHub issue #1.

## 1. Build the packages

```sh
npm ci
npm test
npm run zip
npm run zip:firefox
npm run bench:check
```

Done when every command exits 0 and `.output/` contains `jk-nav-<version>-chrome.zip` and `jk-nav-<version>-firefox.zip`. This is acceptance criterion 8. `bench:check` needs Docker and takes about 6 minutes; it prints a table where every gated row is `pass`. A `fail` row is a performance regression against `docs/bench/baseline.json`; fix it or record a new baseline on purpose, see `docs/bench/README.md`.

## 2. Install each package in a clean profile

Use a new profile, so that no other extension changes the result.

**Chrome**

1. Start Chrome with an empty profile:
   - macOS: `open -na "Google Chrome" --args --user-data-dir="$(mktemp -d)"`
   - Linux: `google-chrome --user-data-dir="$(mktemp -d)"`
2. Unzip `jk-nav-<version>-chrome.zip` into a new folder. Chrome does not install a store zip from disk.
3. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select that folder.

**Firefox**

1. Open `about:profiles`, click **Create a New Profile**, then **Launch profile in new browser**.
2. In the new window, open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and select `jk-nav-<version>-firefox.zip`. Firefox removes a temporary add-on when it closes.
3. Open `about:addons`, then jk-nav, then the **Permissions** tab. Write down whether **Access your data for all websites** is on. If it is off, turn it on; the Keys do not work on pages without it.

Done when jk-nav shows in the extension list of both browsers with no error, and the Firefox site-access state is written down.

## 3. Walk the acceptance criteria

Use a long article with a search field, for example any Wikipedia article. Do each row in both browsers and mark it pass or fail.

| # | Action | Expected result |
| --- | --- | --- |
| 1 | Press `j`, `k`, `gg`, `G`. Press `f`, then type one Hint code. Press `f`, then `Esc`. Follow a link, then press `H` and `L`. | Each Key does what the README Keys table says. |
| 2 | Tap `j` once. Then hold `j` for two seconds and release it. | The tap scrolls one Scroll step (200 px) smoothly and stops. The hold starts Continuous scroll when key repeat begins, after the expected short pause, and the page stops at the moment of release. |
| 3 | Open three tabs in one window. On the last tab press `Shift+K`; on the first tab press `Shift+J`. | `Shift+K` activates the first tab; `Shift+J` activates the last tab. |
| 3 | Put the middle tab in a new tab group (right-click the tab) and collapse the group (click its name). On the first tab press `Shift+K`. | The third tab becomes active, and the group stays collapsed. In Firefox older than 139 the middle tab becomes active; this is expected. |
| 4 | Click the search field and type `j`, `k`, `J`, `K`, `f`. | The field shows `jkJKf`. The page does not scroll, and no Link hints show. |
| 5 | Press `Ctrl+F`. | No Link hints show. On Windows and Linux the browser find bar opens. |
| 6 | Turn on the Russian layout and repeat row 1 without `H` and `L`. Then turn on the Latin layout with Caps Lock on and repeat it again. | Each Key does the same as in the Latin layout with Caps Lock off. |
| 7 | Click a button or a checkbox that does not leave the page. Then press `j` and `k`. | The page scrolls. |

Done when every row has a pass or fail mark in both browsers.

## 4. Report the result

Add one comment to issue #1 with:

- the Chrome and Firefox versions;
- the pass or fail mark of each row, per browser;
- the Firefox site-access state from step 2.

Open one issue for each failure.

Done when the comment is on issue #1 and each failure has its own issue.
