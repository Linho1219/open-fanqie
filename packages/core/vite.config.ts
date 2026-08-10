import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/index.ts',
      name: 'OpenFanqieCore',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'open-fanqie-core.js' : 'open-fanqie-core.cjs'),
    },
  },
  test: {
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
