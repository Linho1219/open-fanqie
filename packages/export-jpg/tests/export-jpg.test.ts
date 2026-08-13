import { describe, expect, it } from 'vitest'

import { readSvgDimensions, svgPagesToJpegs, svgToJpeg } from '../src'
import { jpegWithDpi } from '../src/jpeg'

describe('readSvgDimensions', () => {
  it('reads unitless and pixel dimensions', () => {
    expect(readSvgDimensions('<svg width="1000" height="1415"></svg>')).toEqual({
      width: 1000,
      height: 1415,
    })
    expect(readSvgDimensions("<svg height='240px' width='320px'></svg>")).toEqual({
      width: 320,
      height: 240,
    })
  })

  it('converts absolute CSS units to pixels', () => {
    expect(readSvgDimensions('<svg width="1in" height="25.4mm"></svg>')).toEqual({
      width: 96,
      height: 96,
    })
  })

  it('uses the viewBox for relative or omitted dimensions', () => {
    expect(
      readSvgDimensions('<svg width="100%" height="100%" viewBox="0 0 840 1193"></svg>'),
    ).toEqual({ width: 840, height: 1193 })
    expect(readSvgDimensions('<svg viewBox="-10,-20,200,100"></svg>')).toEqual({
      width: 200,
      height: 100,
    })
  })

  it('infers a missing dimension from the viewBox aspect ratio', () => {
    expect(readSvgDimensions('<svg width="400" viewBox="0 0 200 100"></svg>')).toEqual({
      width: 400,
      height: 200,
    })
  })

  it('rejects invalid or indeterminate dimensions with clear errors', () => {
    expect(() => readSvgDimensions('not svg')).toThrow(/<svg> root element/)
    expect(() => readSvgDimensions('<svg width="100%" height="100%"></svg>')).toThrow(
      /width and height or a valid viewBox/,
    )
    expect(() => readSvgDimensions('<svg viewBox="0 0 0 100"></svg>')).toThrow(/must be positive/)
  })
})

describe('browser-only JPEG conversion', () => {
  const svg = '<svg width="10" height="20" xmlns="http://www.w3.org/2000/svg"></svg>'

  it('can be imported in Node and reports the missing browser APIs on use', async () => {
    await expect(svgToJpeg(svg)).rejects.toThrow(/browser environment/)
  })

  it('validates options before accessing browser APIs', async () => {
    await expect(svgToJpeg(svg, { quality: 2 })).rejects.toThrow(/between 0 and 1/)
    await expect(svgToJpeg(svg, { scale: 0 })).rejects.toThrow(/positive finite/)
    await expect(svgToJpeg(svg, { dpi: 0 })).rejects.toThrow(/between 1 and 65535/)
  })

  it('accepts an empty page list without accessing browser APIs', async () => {
    await expect(svgPagesToJpegs([])).resolves.toEqual([])
  })

  it('retains browser error context for a failing page', async () => {
    await expect(svgPagesToJpegs([svg])).rejects.toThrow(/page 1.*browser environment/)
  })
})

describe('jpegWithDpi', () => {
  it('updates an existing JFIF density segment', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ])

    const result = jpegWithDpi(jpeg, 300)

    expect([...result.slice(13, 18)]).toEqual([1, 1, 44, 1, 44])
    expect(result).not.toBe(jpeg)
  })

  it('adds a JFIF density segment when the JPEG has none', () => {
    const result = jpegWithDpi(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 96)

    expect([...result.slice(0, 11)]).toEqual([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
    ])
    expect([...result.slice(13, 18)]).toEqual([1, 0, 96, 0, 96])
    expect([...result.slice(-2)]).toEqual([0xff, 0xd9])
  })
})
