import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { parse, render, renderSvgPages } from '../src'
import type { LegacyPageConfig, ScoreLine } from '../src'

interface LegacyExample {
  code: string
  page_config: string | null
  custom_code: string | null
}

function loadExample(id: string): LegacyExample {
  return JSON.parse(
    readFileSync(
      new URL(`../../legacy-app/public/Public/examples/example-${id}.json`, import.meta.url),
      'utf8',
    ),
  ) as LegacyExample
}

function linesOf(example: LegacyExample): ScoreLine[] {
  return parse(example.code).pages.flatMap((page) => page.groups.flatMap((group) => group.voices))
}

function renderExample(example: LegacyExample): string {
  const pageConfig =
    example.page_config === null || example.page_config === 'null'
      ? undefined
      : (JSON.parse(example.page_config) as Partial<LegacyPageConfig>)
  return render(example.code, {
    ...(pageConfig === undefined ? {} : { pageConfig }),
    customCode:
      example.custom_code === null || example.custom_code === 'null' ? '' : example.custom_code,
  })
}

function renderExamplePages(example: LegacyExample): string[] {
  const pageConfig =
    example.page_config === null || example.page_config === 'null'
      ? undefined
      : (JSON.parse(example.page_config) as Partial<LegacyPageConfig>)
  return renderSvgPages(example.code, {
    ...(pageConfig === undefined ? {} : { pageConfig }),
    customCode:
      example.custom_code === null || example.custom_code === 'null' ? '' : example.custom_code,
  })
}

describe('bundled legacy examples', () => {
  it('resolves the chained closing slurs in 快乐父子俩 at note level', () => {
    const example = loadExample('37')
    const document = parse(example.code)
    const finalLine = linesOf(example).at(-1)

    expect(document.diagnostics).toEqual([])
    expect(finalLine?.elements[19]).toMatchObject({ kind: 'note', code: "1('" })
    expect(finalLine?.elements[22]).toMatchObject({ kind: 'note', code: "1(')" })
    expect(finalLine?.elements[25]).toMatchObject({ kind: 'note', code: "1')" })
    expect(
      finalLine?.marks.flatMap((mark) => (mark.type === 'slur' ? [[mark.start, mark.end]] : [])),
    ).toEqual([
      [19, 22],
      [22, 25],
    ])
  })

  it('keeps 时间都去哪了 tuplets compact, beams split, and punctuation detached', () => {
    const example = loadExample('110760')
    const document = parse(example.code)
    const svg = renderExample(example)
    const noteX = (notepos: string): number =>
      Number(svg.match(new RegExp(`<use x="([^"]+)"[^>]+notepos="${notepos}"`))?.[1] ?? Number.NaN)
    const beamCount = (y: number): number =>
      svg.match(new RegExp(`<line [^>]*y1="${y}"[^>]*data-type="jianshixian"`, 'g'))?.length ?? 0

    expect(document.diagnostics).toEqual([])
    expect(noteX('0_4_22') - noteX('0_4_21')).toBeLessThan(30)
    expect(noteX('0_4_23') - noteX('0_4_22')).toBeLessThan(30)
    expect(beamCount(665)).toBe(7)
    expect(beamCount(769)).toBe(11)
    expect(svg).toMatch(/<text (?![^>]*cipos)[^>]*>，<\/text>/)
    expect(svg).toContain('>1.</text>')
    expect(svg).toContain('>2.</text>')
  })

  it('renders 同一首歌 cross-page slurs, temporary voices, and custom symbols', () => {
    const example = loadExample('63')
    const document = parse(example.code)
    const svg = renderExample(example)
    const pages = svg.split('[fenye]').filter(Boolean)

    expect(document.diagnostics).toEqual([])
    expect(pages).toHaveLength(2)
    expect(pages[1]).toMatch(/notepos="1__"/)
    expect(svg).toContain('<g id="dakuohu_zuo_2"')
    expect(svg).toContain('<g id="dakuohu_you_2"')
    expect(svg).toContain('<g id="custom_4yPJ2wPA6h"')
    expect(svg.match(/xlink:href="#ci_dakuohu_you"/g)).toHaveLength(2)

    const sbfBarX = Number(
      svg.match(/<use x="([^"]+)"[^>]+notepos="0_3_22"[^>]+code="\|&amp;sbf"/)?.[1],
    )
    const nextNoteX = Number(svg.match(/<use x="([^"]+)"[^>]+notepos="0_3_23"/)?.[1])
    const voiceBraceX = Number(
      svg.match(/<use x="([^"]+)"[^>]+xlink:href="#shengbufu_shang"[^>]*>/)?.[1],
    )
    const temporaryVoiceLeadX = Number(
      svg.match(/<use x="([^"]+)"[^>]+notepos="0_9_12"[^>]+code="5"/)?.[1],
    )
    const lowerRepeatLeadX = Number(
      svg.match(/<use x="([^"]+)"[^>]+notepos="0_10_11"[^>]+code="3\(\)"/)?.[1],
    )
    expect([sbfBarX, nextNoteX, voiceBraceX, temporaryVoiceLeadX, lowerRepeatLeadX]).toSatisfy(
      (values: number[]) => values.every(Number.isFinite),
    )
    expect(nextNoteX).toBeGreaterThan(sbfBarX)
    expect(voiceBraceX).toBe(nextNoteX)
    expect(lowerRepeatLeadX).toBe(temporaryVoiceLeadX)
  })

  it('renders 太阳出来喜洋洋 with path glyphs for positioned score symbols', () => {
    const example = loadExample('61')
    const document = parse(example.code)
    const svg = renderExample(example)
    const pages = svg.split('[fenye]').filter(Boolean)
    const defs = pages.map((page) => page.match(/<defs>([\s\S]*?)<\/defs>/)?.[1] ?? '').join('')
    const lyricLine = linesOf(example).find((line) => line.raw.includes(`1/ 2/ 3/ (2/ | 2/) 1/`))

    expect(document.diagnostics).toEqual([])
    expect(lyricLine?.lyrics[0]?.syllables.map(({ text }) => text)).toContain('洋(')
    expect(svg).toContain('>洋(</text>')
    expect(svg).not.toContain('>洋欧</text>')
    expect(pages).toHaveLength(4)
    expect(defs).toContain('<g id="lidu_f"')
    expect(defs).toContain('<path')
    expect(defs).not.toMatch(/<g id="lidu_[^"]+"[^>]*>[\s\S]*?<text/)
    expect(svg).toContain('<g id="custom_8ztEEB5hay"')
  })

  it.each([
    ['37', 1],
    ['63', 2],
    ['61', 4],
  ])('renders example %s with XML-safe standalone SVG entities', (id, pageCount) => {
    const pages = renderExamplePages(loadExample(id))

    expect(pages).toHaveLength(pageCount)
    expect(pages.join('')).toContain('&amp;')
    for (const page of pages) {
      expect(page).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-f]+;)/i)
    }
  })
})
