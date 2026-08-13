const JFIF_IDENTIFIER = [0x4a, 0x46, 0x49, 0x46, 0x00]

function isJfifSegment(bytes: Uint8Array, offset: number): boolean {
  return JFIF_IDENTIFIER.every((value, index) => bytes[offset + 4 + index] === value)
}

function writeDensity(bytes: Uint8Array, offset: number, dpi: number): void {
  bytes[offset + 11] = 1
  bytes[offset + 12] = dpi >> 8
  bytes[offset + 13] = dpi & 0xff
  bytes[offset + 14] = dpi >> 8
  bytes[offset + 15] = dpi & 0xff
}

export function jpegWithDpi(source: Uint8Array, dpi: number): Uint8Array {
  if (source[0] !== 0xff || source[1] !== 0xd8) {
    throw new Error('Browser returned invalid JPEG data')
  }

  for (let offset = 2; offset + 17 < source.length;) {
    if (source[offset] !== 0xff) break
    const marker = source[offset + 1]
    if (marker === 0xe0 && isJfifSegment(source, offset)) {
      const result = source.slice()
      writeDensity(result, offset, dpi)
      return result
    }
    if (marker === 0xda || marker === 0xd9) break
    const length = ((source[offset + 2] ?? 0) << 8) | (source[offset + 3] ?? 0)
    if (length < 2) break
    offset += length + 2
  }

  const segment = new Uint8Array([
    0xff,
    0xe0,
    0x00,
    0x10,
    ...JFIF_IDENTIFIER,
    0x01,
    0x01,
    0x01,
    dpi >> 8,
    dpi & 0xff,
    dpi >> 8,
    dpi & 0xff,
    0x00,
    0x00,
  ])
  const result = new Uint8Array(source.length + segment.length)
  result.set(source.subarray(0, 2))
  result.set(segment, 2)
  result.set(source.subarray(2), segment.length + 2)
  return result
}
