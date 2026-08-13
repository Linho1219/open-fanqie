import { jpegWithDpi } from './jpeg'

export interface SvgDimensions {
  width: number
  height: number
}

export interface JpegExportOptions {
  /** Output pixel multiplier. @default 1 */
  scale?: number
  /** JPEG encoder quality from 0 to 1. @default 0.92 */
  quality?: number
  /** Canvas color painted behind the SVG. @default '#ffffff' */
  background?: string
  /** JPEG resolution metadata in dots per inch. @default 96 */
  dpi?: number
}

const DEFAULT_SCALE = 1
const DEFAULT_QUALITY = 0.92
const DEFAULT_BACKGROUND = '#ffffff'
const DEFAULT_DPI = 96

const ABSOLUTE_UNIT_FACTORS: Readonly<Record<string, number>> = {
  '': 1,
  px: 1,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
  pt: 96 / 72,
  pc: 16,
}

const RELATIVE_UNITS = new Set(['%', 'em', 'rem', 'ex', 'ch', 'vw', 'vh', 'vmin', 'vmax'])
const SVG_LENGTH_PATTERN = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([a-z%]*)$/i

function readRootAttributes(svg: string): Map<string, string> {
  const root = /<svg\b[^>]*>/i.exec(svg)?.[0]
  if (root === undefined) {
    throw new Error('Expected a complete SVG document with an <svg> root element')
  }

  const attributes = new Map<string, string>()
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g
  for (const match of root.matchAll(pattern)) {
    const name = match[1]
    const value = match[2] ?? match[3] ?? match[4]
    if (name !== undefined && value !== undefined) {
      attributes.set(name.toLowerCase(), value.trim())
    }
  }
  return attributes
}

function readAbsoluteLength(value: string | undefined, attribute: string): number | undefined {
  if (value === undefined || value === '' || value.toLowerCase() === 'auto') {
    return undefined
  }

  const match = SVG_LENGTH_PATTERN.exec(value)
  if (match === null) {
    throw new Error(`Invalid SVG ${attribute} value: ${JSON.stringify(value)}`)
  }

  const numberText = match[1]
  const unit = (match[2] ?? '').toLowerCase()
  if (numberText === undefined) {
    throw new Error(`Invalid SVG ${attribute} value: ${JSON.stringify(value)}`)
  }
  if (RELATIVE_UNITS.has(unit)) {
    return undefined
  }

  const factor = ABSOLUTE_UNIT_FACTORS[unit]
  if (factor === undefined) {
    throw new Error(`Unsupported SVG ${attribute} unit: ${JSON.stringify(unit)}`)
  }

  const length = Number(numberText) * factor
  if (!Number.isFinite(length) || length <= 0) {
    throw new Error(`SVG ${attribute} must resolve to a positive finite length`)
  }
  return length
}

function readViewBox(value: string | undefined): SvgDimensions | undefined {
  if (value === undefined || value === '') {
    return undefined
  }

  const parts = value.trim().split(/[\s,]+/)
  if (parts.length !== 4) {
    throw new Error(`Invalid SVG viewBox value: ${JSON.stringify(value)}`)
  }

  const numbers = parts.map(Number)
  const width = numbers[2]
  const height = numbers[3]
  if (
    numbers.some((number) => !Number.isFinite(number)) ||
    width === undefined ||
    height === undefined
  ) {
    throw new Error(`Invalid SVG viewBox value: ${JSON.stringify(value)}`)
  }
  if (width <= 0 || height <= 0) {
    throw new Error('SVG viewBox width and height must be positive')
  }
  return { width, height }
}

/** Reads the intrinsic SVG size without requiring DOM APIs. */
export function readSvgDimensions(svg: string): SvgDimensions {
  if (typeof svg !== 'string') {
    throw new TypeError('SVG source must be a string')
  }
  if (svg.trim() === '') {
    throw new Error('SVG source cannot be empty')
  }

  const attributes = readRootAttributes(svg)
  const width = readAbsoluteLength(attributes.get('width'), 'width')
  const height = readAbsoluteLength(attributes.get('height'), 'height')

  if (width !== undefined && height !== undefined) {
    return { width, height }
  }

  const viewBox = readViewBox(attributes.get('viewbox'))
  if (viewBox !== undefined) {
    if (width !== undefined) {
      return { width, height: (width * viewBox.height) / viewBox.width }
    }
    if (height !== undefined) {
      return { width: (height * viewBox.width) / viewBox.height, height }
    }
    return viewBox
  }

  throw new Error('SVG must define positive width and height or a valid viewBox')
}

function normalizeOptions(options: JpegExportOptions): Required<JpegExportOptions> {
  const scale = options.scale ?? DEFAULT_SCALE
  const quality = options.quality ?? DEFAULT_QUALITY
  const background = options.background ?? DEFAULT_BACKGROUND
  const dpi = options.dpi ?? DEFAULT_DPI

  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError('JPEG scale must be a positive finite number')
  }
  if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
    throw new RangeError('JPEG quality must be a finite number between 0 and 1')
  }
  if (typeof background !== 'string' || background.trim() === '') {
    throw new TypeError('JPEG background must be a non-empty CSS color string')
  }
  if (!Number.isFinite(dpi) || dpi < 1 || dpi > 65_535) {
    throw new RangeError('JPEG DPI must be a finite number between 1 and 65535')
  }

  return { scale, quality, background, dpi: Math.round(dpi) }
}

function requireBrowserApis(): void {
  if (
    typeof document === 'undefined' ||
    typeof Image === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function'
  ) {
    throw new Error('JPEG export requires a browser environment with DOM and Canvas APIs')
  }
}

function loadSvgImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      image.onload = null
      image.onerror = null
      resolve(image)
    }
    image.onerror = () => {
      image.onload = null
      image.onerror = null
      reject(new Error('Browser failed to decode the SVG image'))
    }
    image.src = url
  })
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  if (typeof canvas.toBlob !== 'function') {
    throw new Error('JPEG export requires HTMLCanvasElement.toBlob support')
  }

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob === null) {
            reject(new Error('Browser failed to encode the canvas as JPEG'))
            return
          }
          resolve(blob)
        },
        'image/jpeg',
        quality,
      )
    } catch (error) {
      reject(new Error('Browser failed to encode the canvas as JPEG', { cause: error }))
    }
  })
}

/** Converts one complete SVG document to an `image/jpeg` Blob in the browser. */
export async function svgToJpeg(svg: string, options: JpegExportOptions = {}): Promise<Blob> {
  const dimensions = readSvgDimensions(svg)
  const normalized = normalizeOptions(options)
  requireBrowserApis()

  const width = Math.round(dimensions.width * normalized.scale)
  const height = Math.round(dimensions.height * normalized.scale)
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new RangeError('Scaled SVG dimensions must produce positive safe-integer pixel sizes')
  }

  const source = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(source)
  try {
    const image = await loadSvgImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (context === null) {
      throw new Error('Browser failed to create a 2D canvas context')
    }

    context.fillStyle = normalized.background
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    const blob = await canvasToJpeg(canvas, normalized.quality)
    const jpeg = jpegWithDpi(new Uint8Array(await blob.arrayBuffer()), normalized.dpi)
    return new Blob([Uint8Array.from(jpeg).buffer], { type: 'image/jpeg' })
  } catch (error) {
    if (error instanceof Error) {
      throw error
    }
    throw new Error('Failed to convert SVG to JPEG', { cause: error })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Converts SVG pages sequentially to limit peak browser memory usage. */
export async function svgPagesToJpegs(
  pages: readonly string[],
  options: JpegExportOptions = {},
): Promise<Blob[]> {
  if (!Array.isArray(pages)) {
    throw new TypeError('SVG pages must be an array')
  }
  const normalized = normalizeOptions(options)

  const results: Blob[] = []
  for (const [index, page] of pages.entries()) {
    if (typeof page !== 'string') {
      throw new TypeError(`SVG page ${index + 1} must be a string`)
    }
    try {
      results.push(await svgToJpeg(page, normalized))
    } catch (error) {
      const reason = error instanceof Error ? `: ${error.message}` : ''
      throw new Error(`Failed to export SVG page ${index + 1} as JPEG${reason}`, { cause: error })
    }
  }
  return results
}
