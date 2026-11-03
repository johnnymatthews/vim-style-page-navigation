# Benchmark

`bench.ts` measures what a user feels: how much the extension delays a page and how fast the keys react. It loads the built Chrome package, and optionally another unpacked extension, into Chromium through Playwright, opens one generated page with 3000 links and 400 paragraphs, and records per run:

- `DOMContentLoaded` and `load` from Navigation Timing;
- script and main-thread task time until 500 ms after `load`, from the Chrome DevTools Protocol `Performance.getMetrics`;
- the time from a `j` press to the first `scroll` event (first press after load, then a second press), and from `f` to the first hint node added to the document. The start time is `performance.now()` read in the page right before the key is dispatched, so another extension that stops the event early cannot hide it.

Memory is not measured. Each column is a fresh browser profile; the table shows the median and, in brackets, the 90th percentile of 20 runs.

## Run

```sh
npm run build
BENCH_OTHER=/path/to/unpacked-extension BENCH_OTHER_NAME="Vimium C" npx tsx docs/bench/bench.ts 20
```

Without `BENCH_OTHER` the table has two columns: no extension and jk-nav. The last run is in `results.json`.

## Result

jk-nav after the startup and first-frame changes, against Vimium C 2.12.2 from the Chrome Web Store, macOS, Chromium 1248 (Playwright 1.64):

Fixture: 3000 links, 400 paragraphs; 20 runs per column; median (p90).

| Metric | no extension | jk-nav | Vimium C 2.12.2 |
| --- | --- | --- | --- |
| DOMContentLoaded, ms | 11.8 (14.1) | 13.8 (15.4) | 17.1 (19.2) |
| load event, ms | 16.2 (18.6) | 18.2 (20.1) | 21.5 (23.7) |
| script time until load+500 ms, ms | 0.3 (0.3) | 1.4 (1.5) | 1.6 (1.7) |
| main-thread task time until load+500 ms, ms | 60.0 (63.4) | 61.1 (65.2) | 58.1 (62.7) |
| first j → first scroll event, ms | n/a (n/a) | 12.4 (27.1) | 25.0 (29.1) |
| second j → first scroll event, ms | n/a (n/a) | 2.5 (3.5) | 3.9 (4.8) |
| f → first hint node, ms | n/a (n/a) | 9.6 (13.5) | 17.3 (19.9) |

Before those changes jk-nav was behind on three rows: `load` 59.1 ms (the content script ran at `document_idle`, whose injection delayed the load event), second `j` 35.3 ms (the first animation frame moved 0 px) and `f` 23.4 ms (one forced layout per hint). The changes: the content script runs at `document_start`, the first scroll step is applied during the key press, and hints are measured once and appended in one fragment.

The comparison is per scenario, not per product: Vimium C has many more commands and its own options; only scrolling, link hints and page load are compared here.
