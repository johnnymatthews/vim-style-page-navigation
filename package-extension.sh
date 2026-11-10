#!/bin/bash
# Build the zip for submission to addons.mozilla.org. Runs locally and in CI.
set -e
cd "$(dirname "$0")"
VERSION=$(grep -o '"version": *"[^"]*"' manifest.json | cut -d'"' -f4)
OUTPUT="vim-style-page-navigation-$VERSION.zip"
rm -f "$OUTPUT"
zip -r "$OUTPUT" manifest.json page-navigator.js popup.html popup.js background.js site-toggle.js icons
