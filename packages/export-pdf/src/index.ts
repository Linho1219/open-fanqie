import { readSvgDimensions, svgToJpeg } from '@openfanqie/export-jpg'
import { PDFDocument } from 'pdf-lib'

import { pdfPageSize } from './page'

const DEFAULT_SCALE = 2
const DEFAULT_QUALITY = 0.92
const DEFAULT_BACKGROUND = '#ffffff'

export interface PdfExportOptions {
  /** Raster pixel multiplier. @default 2 */
  scale?: number
  /** JPEG encoder quality from 0 to 1. @default 0.92 */
  quality?: number
  /** Canvas color painted behind the SVG. @default '#ffffff' */
  background?: string
}

function requirePages(pages: readonly string[]): void {
  if (!Array.isArray(pages)) throw new TypeError('SVG pages must be an array.')
  if (pages.length === 0) throw new RangeError('At least one SVG page is required.')
  pages.forEach((page, index) => {
    if (typeof page !== 'string') throw new TypeError(`SVG page ${index + 1} must be a string.`)
    if (page.trim() === '') throw new RangeError(`SVG page ${index + 1} is empty.`)
  })
}

function finitePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number.`)
  }
  return value
}

function jpegQuality(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError('quality must be a finite number from 0 to 1.')
  }
  return value
}

function backgroundColor(value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError('background must be a non-empty CSS color string.')
  }
  return value
}

export async function svgPagesToPdf(
  pages: readonly string[],
  options: PdfExportOptions = {},
): Promise<Blob> {
  requirePages(pages)

  const scale = finitePositive(options.scale ?? DEFAULT_SCALE, 'scale')
  const quality = jpegQuality(options.quality ?? DEFAULT_QUALITY)
  const background = backgroundColor(options.background ?? DEFAULT_BACKGROUND)
  const document = await PDFDocument.create()

  for (const svg of pages) {
    const dimensions = readSvgDimensions(svg)
    const jpegBlob = await svgToJpeg(svg, { scale, quality, background })
    const image = await document.embedJpg(await jpegBlob.arrayBuffer())
    const [width, height] = pdfPageSize(dimensions)
    const page = document.addPage([width, height])
    page.drawImage(image, { x: 0, y: 0, width, height })
  }

  const bytes = await document.save()
  return new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' })
}
