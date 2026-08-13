import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/index.ts',
      name: 'OpenFanqieExportJpg',
      formats: ['es', 'cjs'],
      fileName: (format) =>
        format === 'es' ? 'open-fanqie-export-jpg.js' : 'open-fanqie-export-jpg.cjs',
    },
  },
  test: {
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
