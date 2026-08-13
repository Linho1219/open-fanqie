export interface PageDimensions {
  width: number
  height: number
}

export type PdfPageSize = [width: number, height: number]

const CSS_PIXELS_PER_INCH = 96
const PDF_POINTS_PER_INCH = 72
const MILLIMETERS_PER_INCH = 25.4

const points = (millimeters: number): number =>
  (millimeters * PDF_POINTS_PER_INCH) / MILLIMETERS_PER_INCH

const OPEN_FANQIE_PAGE_SIZES: ReadonlyArray<{
  svg: PdfPageSize
  pdf: PdfPageSize
}> = [
  { svg: [1000, 1415], pdf: [points(210), points(297)] },
  { svg: [840, 1193], pdf: [points(148), points(210)] },
  { svg: [1415, 1000], pdf: [points(297), points(210)] },
  { svg: [1193, 840], pdf: [points(210), points(148)] },
]

export function pdfPageSize(dimensions: PageDimensions): PdfPageSize {
  const { width, height } = dimensions
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new RangeError('SVG page dimensions must be finite positive numbers.')
  }

  const preset = OPEN_FANQIE_PAGE_SIZES.find(({ svg }) => svg[0] === width && svg[1] === height)
  if (preset !== undefined) return [...preset.pdf]

  const pointsPerPixel = PDF_POINTS_PER_INCH / CSS_PIXELS_PER_INCH
  return [width * pointsPerPixel, height * pointsPerPixel]
}
