#!/bin/bash
# Build the zip for submission to addons.mozilla.org.
set -e
cd "$(dirname "$0")"
rm -f vim-style-page-navigation.zip
zip -r vim-style-page-navigation.zip manifest.json page-navigator.js icons
