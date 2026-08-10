import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@openfanqie/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
    },
  },
})
