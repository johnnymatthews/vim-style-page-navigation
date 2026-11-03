# Benchmark

`bench.ts` measures what a user feels: how much the extension delays a page and how fast the keys react. It loads the built Chrome package, and optionally another unpacked extension, into Chromium through Playwright. The default scenario opens one generated page with 3000 links and 400 paragraphs. The `--multi-frame` scenario adds same-origin and cross-origin iframe targets.

- `DOMContentLoaded` and `load` from Navigation Timing;
- script and main-thread task time until 500 ms after `load`, from the Chrome DevTools Protocol `Performance.getMetrics`;
- in the multi-frame scenario, script and task time from a separate `Performance` session for every cross-origin OOPIF target;
- the time from a `j` press to the first `scroll` event (first press after load, then a second press), and from `f` to the first hint node added to the document. The start time is `performance.now()` read in the page right before the key is dispatched, so another extension that stops the event early cannot hide it.

Memory is not measured. Each column is a fresh browser profile; the table shows the median and, in brackets, the 90th percentile of 20 runs.

## Run

```sh
npm run build
BENCH_OTHER=/path/to/unpacked-extension BENCH_OTHER_NAME="Vimium C" npx tsx docs/bench/bench.ts 20

# Multi-frame comparison. Use a build made from the before commit and the current build.
BENCH_JK_NAV_BEFORE=/path/to/jk-nav-before/.output/chrome-mv3 \
BENCH_JK_NAV_AFTER=.output/chrome-mv3 \
npx tsx docs/bench/bench.ts --multi-frame 5
```

Without `BENCH_OTHER` the default table has two columns: no extension and jk-nav. The multi-frame table has no extension, jk-nav before, and jk-nav after columns. The last run is in `results.json`.

## Result

jk-nav after the cold-key and link-hint changes, against Vimium C 2.12.2 from the Chrome Web Store, macOS, Chromium 1248 (Playwright 1.64):

Fixture: 3000 links, 400 paragraphs; 20 runs per column; median (p90).

| Metric | no extension | jk-nav | Vimium C 2.12.2 |
| --- | --- | --- | --- |
| DOMContentLoaded, ms | 12.2 (14.4) | 14.1 (16.0) | 17.8 (19.9) |
| load event, ms | 16.6 (18.8) | 18.6 (20.4) | 22.3 (24.1) |
| script time until load+500 ms, ms | 0.3 (0.3) | 1.4 (1.5) | 1.7 (1.8) |
| main-thread task time until load+500 ms, ms | 61.8 (68.6) | 60.3 (69.4) | 58.4 (63.2) |
| first j → first scroll event, ms | n/a (n/a) | 14.5 (22.3) | 21.4 (29.4) |
| second j → first scroll event, ms | n/a (n/a) | 2.1 (3.5) | 3.1 (6.4) |
| f → first hint node, ms | n/a (n/a) | 7.3 (11.4) | 15.3 (20.3) |

### History

The first round moved the content script to `document_start`, applied the first scroll step during the key press, and measured hints once before appending them in one fragment. Before it jk-nav was behind on three rows: `load` 59.1 ms (the `document_idle` injection delayed the load event), second `j` 35.3 ms (the first animation frame moved 0 px) and `f` 23.4 ms (one forced layout per hint). After it: `load` 18.2 ms, second `j` 2.5 ms, `f` 9.6 ms.

The second round (this table) worked on the remaining rows. Before it, on the same machine and day, jk-nav measured first `j` 12.1 ms (p90 25.7) and `f` 8.1 ms (p90 13.8):

- `f`: the three target queries became one `querySelectorAll`, visibility uses `checkVisibility({ visibilityProperty: true })` where the browser has it, and the hints live in one `position: fixed; contain: layout` container instead of 900 separate fixed elements. `f` → first hint node went from 8.1 to 7.3 ms, and the p90 from 13.8 to 11.4.
- first `j`: the `prefers-reduced-motion` media query is created once at startup instead of on every key press. The row did not move beyond run-to-run noise. A control page with no extension and a plain `keydown` handler that calls `scrollBy` measured 15.1 ms (p90 22.9) for the same metric: after the page has been idle, the first `scroll` event waits for the renderer's next frame, so this row has a floor of about 15 ms that no content script can go under. The second `j`, taken while the renderer is still producing frames, shows the real key cost: 2.1 ms.
- warm-up: one empty `requestAnimationFrame` at startup was tried against the p90 of the first `j`. With it 21.5 ms, without it 22.6 ms, within noise, so the change was dropped.

The comparison is per scenario, not per product: Vimium C has many more commands and its own options; only scrolling, link hints and page load are compared here.

## Multi-frame scenario

The multi-frame fixture has 3000 links, 400 paragraphs, three same-origin ad-like frames, three cross-origin ad-like frames, and one same-origin content frame. The cross-origin frames are OOPIF targets. Each column uses a fresh browser profile. The recorded comparison uses 5 runs per column, reports the median and p90, and uses these builds:

- `jk-nav before`: `5def1d05f4187f211218e4cee8b2c7a42be5e726`;
- `jk-nav after`: `f5a568b75a92e07fb1538200a79370e2760b861a`.

| Metric | no extension | jk-nav before | jk-nav after |
| --- | --- | --- | --- |
| DOMContentLoaded, ms | 17.4 (28.8) | 19.9 (23.5) | 19.9 (20.8) |
| load event, ms | 66.6 (77.5) | 68.6 (72.6) | 69.6 (76.3) |
| top-frame renderer script time until load+500 ms, ms | 0.3 (0.4) | 1.5 (2.2) | 2.7 (2.9) |
| top-frame main-thread task time until load+500 ms, ms | 73.1 (84.6) | 72.6 (76.1) | 74.3 (82.7) |
| first j → first scroll event, ms | n/a (n/a) | 23.8 (25.9) | 21.8 (22.8) |
| second j → first scroll event, ms | n/a (n/a) | 2.8 (3.4) | 2.6 (3.5) |
| f → first hint node, ms | n/a (n/a) | 7.1 (9.4) | 7.2 (11.4) |
| OOPIF target 1 ScriptDuration, ms | 0.0 (0.0) | 0.0 (0.0) | 0.0 (0.0) |
| OOPIF target 1 task time, ms | 1.7 (11.7) | 1.9 (14.9) | 2.0 (2.2) |
| OOPIF target 2 ScriptDuration, ms | 0.0 (0.0) | 0.0 (0.0) | 0.0 (0.0) |
| OOPIF target 2 task time, ms | 1.8 (12.2) | 2.2 (15.6) | 2.2 (2.5) |
| OOPIF target 3 ScriptDuration, ms | 0.0 (0.0) | 0.0 (0.0) | 0.0 (0.0) |
| OOPIF target 3 task time, ms | 2.2 (12.4) | 2.5 (16.0) | 2.4 (2.7) |

The after build changes OOPIF task medians by +0.1, +0.0, and −0.1 ms per cross-origin frame for targets 1–3; top-frame script/task deltas are +1.2/+1.7 ms, or +0.3/+0.4 ms per each of 4 same-origin frames. `contentScriptReady=true` for all recorded after-build OOPIF samples, while `ScriptDuration` reads 0.0 in every column. The top-frame renderer script time rises from 1.5 ms before to 2.7 ms after.
