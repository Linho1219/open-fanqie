import { describe, expect, it } from 'vitest'

import { parse } from '../src'

describe('parse', () => {
  it('parses headers, pages, voice groups, and lyrics', () => {
    const document = parse(`
V: 1.0
B: 主标题
B: 副标题
Z: 甲
D: F#
P: 6/8 (2/4)
J: 96
Q1"主旋律": 1 2 | 3 4 |
C1: 春~天/hello/world
Q2"低声部": 5, 6, | 7, 1 |
C2: @低@@
[fenye]
Q: 1 - ||
`)

    expect(document.metadata).toMatchObject({
      version: '1.0',
      titles: ['主标题', '副标题'],
      authors: ['甲'],
      mode: 'F#',
      meters: [
        { numerator: 6, denominator: 8, parenthesized: false },
        { numerator: 2, denominator: 4, parenthesized: true },
      ],
      tempos: [96],
    })
    expect(document.pages).toHaveLength(2)
    expect(document.pages[0]?.groups[0]?.voices.map((voice) => voice.voice)).toEqual([1, 2])
    expect(document.pages[0]?.groups[0]?.voices[0]?.caption).toBe('主旋律')
    expect(
      document.pages[0]?.groups[0]?.voices[0]?.lyrics[0]?.syllables.map(({ text }) => text),
    ).toEqual(['春天', 'hello', 'world'])
    expect(document.diagnostics).toEqual([])
  })

  it('groups auxiliary meters and applies repeated header precedence', () => {
    const document = parse(`
B: 标题
P: 4/4
P: 3/4 ( 2/4 1/4 )
J: 80
J: 120
J: 欢快地
J: 抒情地
Q: 1 |
`)

    expect(document.metadata.meters).toEqual([
      { numerator: 3, denominator: 4, parenthesized: false },
      { numerator: 2, denominator: 4, parenthesized: true },
      { numerator: 1, denominator: 4, parenthesized: true },
    ])
    expect(document.metadata.tempos).toEqual([80, '欢快地'])
    expect(document.diagnostics).toEqual([])
  })

  it('preserves normalized barline annotation code', () => {
    const document = parse(`Q: 1 |"p:2 / 4" 2 |"foo bar" 3 |`)
    const barlines = document.pages[0]?.groups[0]?.voices[0]?.elements.filter(
      (element) => element.kind === 'barline',
    )

    expect(barlines).toMatchObject([
      { temporaryMeter: { numerator: 2, denominator: 4 }, code: "|'p:2/4'" },
      { code: "|'foobar'" },
      { code: '|' },
    ])
    expect(document.diagnostics).toEqual([])
  })

  it('parses notes, barlines, commands, and source code', () => {
    const document = parse(`Q: 1'#//..&yc 8 9, 0 2$ 3= - |: :| :|: || ||/ |/ |*`)
    const elements = document.pages[0]?.groups[0]?.voices[0]?.elements ?? []
    const first = elements[0]

    expect(first).toMatchObject({
      kind: 'note',
      pitch: 1,
      octave: 1,
      duration: 16,
      dots: 2,
      accidental: 'sharp',
      ornaments: [{ name: 'yc', level: 0 }],
      code: "1'#//..&yc",
    })
    expect(elements[1]).toMatchObject({ kind: 'note', hidden: true })
    expect(elements[2]).toMatchObject({ kind: 'note', pitch: 9, sound: 'rhythm', octave: -1 })
    expect(
      elements.flatMap((element) => (element.kind === 'barline' ? [element.type] : [])),
    ).toEqual(['repeat-start', 'repeat-end', 'repeat-both', 'end', 'double', 'hidden', 'invisible'])
    expect(document.diagnostics).toEqual([])
  })

  it('parses grace notes, marks, custom beat cuts, and inline voices', () => {
    const document = parse(`Q: |["1" (1[2/]< 2[h3]!) |] ~ ^ {bz 5/ 6/} {dsb 1 2}`)
    const line = document.pages[0]?.groups[0]?.voices[0]
    const notes = line?.elements.filter(({ kind }) => kind === 'note') ?? []
    const layers = line?.elements.filter(({ kind }) => kind === 'inline-layer') ?? []

    expect(notes[0]).toMatchObject({
      kind: 'note',
      graceBefore: [{ pitch: 2, duration: 16 }],
    })
    expect(notes[1]).toMatchObject({
      kind: 'note',
      graceAfter: [{ pitch: 3, duration: 8 }],
    })
    expect(line?.marks.map(({ type }) => type).sort()).toEqual(['crescendo', 'slur', 'volta'])
    expect(
      line?.elements.flatMap((element) =>
        element.kind === 'beat-boundary' ? [element.behavior] : [],
      ),
    ).toEqual(['join', 'split'])
    expect(layers).toMatchObject([{ role: 'accompaniment' }, { role: 'voice' }])
    expect(document.diagnostics).toEqual([])
  })

  it('resolves slur nesting after assigning parentheses to notes', () => {
    const document = parse(`Q: (1 (1) 1) ((2 3) 4) |`)
    const line = document.pages[0]?.groups[0]?.voices[0]

    expect(line?.elements.flatMap((element) => ('code' in element ? [element.code] : []))).toEqual([
      '1(',
      '1()',
      '1)',
      '2((',
      '3)',
      '4)',
      '|',
    ])
    expect(line?.marks.map(({ type, start, end }) => ({ type, start, end }))).toEqual([
      { type: 'slur', start: 0, end: 1 },
      { type: 'slur', start: 1, end: 2 },
      { type: 'slur', start: 3, end: 4 },
      { type: 'slur', start: 3, end: 5 },
    ])
    expect(document.diagnostics).toEqual([])
  })

  it('accepts zero-length nested slurs without drawing ranges', () => {
    const document = parse(`Q: (1) (1 (2)) ((3) 4) |`)
    const line = document.pages[0]?.groups[0]?.voices[0]

    expect(line?.marks.map(({ start, end }) => [start, end])).toEqual([
      [1, 2],
      [3, 4],
    ])
    expect(document.diagnostics).toEqual([])
  })

  it('counts sustain elements as tuplet members', () => {
    const document = parse(`Q: (y1 - 2) |`)

    expect(document.pages[0]?.groups[0]?.voices[0]?.marks).toMatchObject([
      { type: 'tuplet', caption: '3' },
    ])
    expect(document.diagnostics).toEqual([])
  })

  it('attaches parentheses to notes across intervening barlines', () => {
    const document = parse(`Q: ( |/ 1 2 |)`)
    const line = document.pages[0]?.groups[0]?.voices[0]

    expect(line?.elements.flatMap((element) => ('code' in element ? [element.code] : []))).toEqual([
      '|/',
      '1(',
      '2)',
      '|',
    ])
    expect(line?.marks).toMatchObject([{ type: 'slur', start: 1, end: 2 }])
    expect(document.diagnostics).toEqual([])
  })

  it('anchors hairpins to the preceding note and preserves boundary code', () => {
    const document = parse(`Q: 1> 2/~ 3! |`)
    const line = document.pages[0]?.groups[0]?.voices[0]

    expect(line?.marks).toMatchObject([{ type: 'decrescendo', start: 0, end: 3 }])
    expect(line?.elements[1]).toMatchObject({ kind: 'note', code: '2/~' })
    expect(line?.elements[3]).toMatchObject({ kind: 'note', code: '3!' })
    expect(document.diagnostics).toEqual([])
  })

  it('keeps trailing lyric punctuation separate from its syllable', () => {
    const document = parse(`Q: 1 2 |\nC: 你，ABC,`)
    const syllables = document.pages[0]?.groups[0]?.voices[0]?.lyrics[0]?.syllables

    expect(syllables).toMatchObject([
      { text: '你', trailingPunctuation: '，' },
      { text: 'ABC', trailingPunctuation: ',' },
    ])
    expect(document.diagnostics).toEqual([])
  })

  it('attaches lyric braces without consuming note slots', () => {
    const document = parse(`Q: 1 2 3 |\nC: {甲乙}丙`)
    const syllables = document.pages[0]?.groups[0]?.voices[0]?.lyrics[0]?.syllables

    expect(syllables).toMatchObject([
      { text: '甲', leftBrace: true },
      { text: '乙', rightBrace: true },
      { text: '丙' },
    ])
    expect(document.diagnostics).toEqual([])
  })

  it('parses the barred repeat end as one barline', () => {
    const document = parse(`Q: 1 :|| 2 |`)
    const barlines =
      document.pages[0]?.groups[0]?.voices[0]?.elements.filter(
        (element) => element.kind === 'barline',
      ) ?? []

    expect(barlines).toMatchObject([
      { type: 'repeat-end', code: ':||' },
      { type: 'normal', code: '|' },
    ])
    expect(document.diagnostics).toEqual([])
  })

  it('joins punctuation to the previous lyric syllable after a tilde', () => {
    const document = parse(`Q: 1 2 3 4 5 6 7 |\nC: 喜洋洋~(欧@郎啰`)
    const syllables = document.pages[0]?.groups[0]?.voices[0]?.lyrics[0]?.syllables

    expect(syllables?.map(({ text }) => text)).toEqual(['喜', '洋', '洋(', '欧', '', '郎', '啰'])
    expect(syllables?.[2]?.trailingPunctuation).toBeUndefined()
    expect(document.diagnostics).toEqual([])
  })

  it('binds lyrics to the most recent music line regardless of the C suffix', () => {
    const document = parse(`Q1: 1\nC2: 甲\nQ2: 2\nC1: 乙`)
    const voices = document.pages[0]?.groups[0]?.voices

    expect(voices?.[0]?.lyrics[0]?.syllables[0]?.text).toBe('甲')
    expect(voices?.[1]?.lyrics[0]?.syllables[0]?.text).toBe('乙')
    expect(document.diagnostics).toEqual([])
  })

  it('parses the legacy temporary-voice shorthand', () => {
    const document = parse(`Y: Piano, Voice\nS: 备注\nQ: { | 6, - } 2, - |`)
    const layer = document.pages[0]?.groups[0]?.voices[0]?.elements[0]

    expect(layer).toMatchObject({
      kind: 'inline-layer',
      role: 'voice',
      elements: [{ kind: 'note', pitch: 6, octave: -1 }, { kind: 'sustain' }],
    })
    expect(document.metadata.instruments).toEqual(['Piano', 'Voice'])
    expect(document.metadata.remarks).toEqual(['备注'])
    expect(document.diagnostics).toEqual([])
  })

  it('carries slurs across music lines of the same voice', () => {
    const document = parse(`Q: 1 2 (3 4 |\nQ: 1 2 3) 4 |`)
    const groups = document.pages[0]?.groups ?? []

    expect(groups[0]?.voices[0]?.marks).toMatchObject([{ continuationToNext: true }])
    expect(groups[1]?.voices[0]?.marks).toMatchObject([{ continuationFromPrevious: true }])
    expect(document.diagnostics).toEqual([])
  })

  it('carries volta marks across music lines of the same voice', () => {
    const document = parse(`Q: 1 |["1." 2 3 |\nQ: |/ 4 5 |] 6 |`)
    const groups = document.pages[0]?.groups ?? []

    expect(groups[0]?.voices[0]?.marks).toMatchObject([
      { type: 'volta', continuationToNext: true, caption: '1.' },
    ])
    expect(groups[1]?.voices[0]?.marks).toMatchObject([
      { type: 'volta', continuationFromPrevious: true },
    ])
    expect(document.diagnostics).toEqual([])
  })

  it('does not carry slurs across page breaks', () => {
    const document = parse(`Q: 1 (2 |\n[fenye]\nQ: 3) 4 |`)

    expect(document.pages[0]?.groups[0]?.voices[0]?.marks).toEqual([])
    expect(document.pages[1]?.groups[0]?.voices[0]?.marks).toEqual([])
    expect(document.diagnostics.map(({ code }) => code)).toContain('unclosed-mark')
  })

  it('does not carry slurs across intervening voices', () => {
    const document = parse(`Q3: 1 (2 |\nQ1: 3 4 |\nQ3: 5) 6 |`)
    const lines = document.pages[0]?.groups.flatMap((group) => group.voices) ?? []

    expect(lines.flatMap(({ marks }) => marks)).toEqual([])
    expect(document.diagnostics).toEqual([])
  })

  it('reports malformed input without throwing', () => {
    const document = parse(`hello\nD: h\nQ: 1&unknown (2`)

    expect(document.diagnostics.map(({ code }) => code)).toEqual([
      'missing-prefix',
      'invalid-mode',
      'unknown-command',
      'unclosed-mark',
    ])
  })
})
