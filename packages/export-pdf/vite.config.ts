import { defineConfig } from 'vitest/config'

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/index.ts',
      name: 'OpenFanqieExportPdf',
      formats: ['es', 'cjs'],
      fileName: (format) =>
        format === 'es' ? 'open-fanqie-export-pdf.js' : 'open-fanqie-export-pdf.cjs',
    },
    rollupOptions: {
      external: ['@openfanqie/export-jpg', 'pdf-lib'],
    },
  },
  test: {
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
