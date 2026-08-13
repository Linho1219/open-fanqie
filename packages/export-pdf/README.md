# Open Fanqie PDF Export

Browser-side PDF export for SVG pages produced by Open Fanqie. Each SVG is rasterized to JPEG and embedded as one PDF page, keeping the SVG page size and orientation. Open Fanqie's four A4/A5 presets map to their exact physical paper sizes; other SVG dimensions fall back to the standard 96 CSS px/in to 72 PDF pt/in conversion.

## Installation

```bash
pnpm add @openfanqie/export-pdf
```

## Usage

```ts
import { svgPagesToPdf } from '@openfanqie/export-pdf'

const pdf = await svgPagesToPdf(svgPages, {
  scale: 2,
  quality: 0.92,
  background: '#ffffff',
})

const url = URL.createObjectURL(pdf)
```

The function returns an `application/pdf` `Blob`. Download handling is intentionally left to the application. Revoke object URLs after use.

`scale` controls raster resolution without changing the PDF page size. Larger values improve print clarity but consume more memory. Text is rasterized, so the resulting PDF does not require the viewer to have the score's fonts installed.

At least one non-empty SVG page is required. Invalid SVG dimensions, rasterization failures, and PDF encoding failures reject the returned promise.
