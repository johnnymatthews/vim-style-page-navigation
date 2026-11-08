import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'JK Vim-Style Page/Tab Navigation',
    version: '1.1.0',
    description: 'Vim keys on every page: j/k scroll, gg/G, f link hints, H/L history, Shift+J/K switch tabs. Works in any keyboard layout.',
    permissions: ['tabGroups'],
    icons: {
      16: 'icons/16x16.png',
      32: 'icons/32x32.png',
      48: 'icons/48x48.png',
      128: 'icons/128x128.png',
    },
    browser_specific_settings: {
      gecko: {
        id: 'jk-nav@seigiard.github.io',
        ...(browser === 'firefox'
          ? { data_collection_permissions: { required: ['none'] } }
          : {}),
      },
    },
  }),
  zip: {
    excludeSources: ['test-results/**', 'playwright-report/**', 'docs/store/*.png'],
  },
});
