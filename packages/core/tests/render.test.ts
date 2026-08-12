import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { render } from '../src'

const compatibilityScore = readFileSync(new URL('./fixtures/test.jps', import.meta.url), 'utf8')

function uses(svg: string, line: number): Array<{ x: number; code: string }> {
  const expression = new RegExp(
    `<use x="([^"]+)"[^>]+notepos="0_${line}_[^"]+"[^>]+code="([^"]+)"[^>]*>`,
    'g',
  )
  return [...svg.matchAll(expression)].map((match) => ({
    x: Number(match[1]),
    code: match[2] ?? '',
  }))
}

function elementCount(svg: string, name: 'use' | 'text' | 'line' | 'path'): number {
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/, '')
  return body.match(new RegExp(`<${name}\\b`, 'g'))?.length ?? 0
}

describe('render', () => {
  it('matches legacy empty input and nonstandard page selection', () => {
    expect(render('')).toBe('')
    expect(render(' ')).toMatch(/^<svg/)
    expect(render(`Q: 1\n[fenye]\nQ: 2`, { pageNum: -2 })).toBe('noRedraw[fenye]noRedraw[fenye]')
  })

  it('falls back from inherited page names and tolerates missing legacy glyphs', () => {
    for (const page of ['toString', 'constructor', '__proto__']) {
      expect(render('Q: 1 |', { pageConfig: JSON.stringify({ page }) })).toMatch(
        /^<svg width="1000" height="1415"/,
      )
    }

    expect(render('Q: 1 |', { pageConfig: JSON.stringify({ shuzi_font: 'z' }) })).toContain(
      'xlink:href="#shuzi_z_1"',
    )
    expect(render('Q: 1&constructor |')).not.toContain('[object Object]')
  })

  it('renders the full compatibility score without diagnostics', () => {
    const diagnostics: string[] = []
    const output = render(compatibilityScore, {
      onDiagnostics: (items) => diagnostics.push(...items.map(({ code }) => code)),
    })
    const pages = output.split('[fenye]').filter(Boolean)

    expect(diagnostics).toEqual([])
    expect(pages).toHaveLength(3)
    expect(pages[0]).toContain('>时　忆</text>')
    expect(pages[0]).toContain('<g id="changyinfu1"')
    expect(pages[2]).toContain('<g id="yanchang"')
    expect(pages[1]).not.toContain('>时　忆</text>')
    expect(
      pages.map((page) => [
        elementCount(page, 'use'),
        elementCount(page, 'text'),
        elementCount(page, 'line'),
        elementCount(page, 'path'),
      ]),
    ).toEqual([
      [391, 141, 77, 11],
      [692, 359, 210, 10],
      [603, 276, 150, 20],
    ])
    expect(pages[0]).toContain('x="141" y="266" xlink:href="#shuzi_b_0"')
    expect(pages[1]).toContain('x="103" y="130" xlink:href="#shuzi_b_6"')
    expect(pages[2]).toContain('x="103" y="130" xlink:href="#shuzi_b_0"')
  })

  it('matches legacy page-setting interactions', () => {
    const svg = render(
      `
B: 标题
Z: 甲
Z: 乙
J: 80
Q1: (y1/ 2/ 3/) |
C1: 一二三
Q2: 1 |
C2: 一

Q1: 1 |
C1: 一
Q2: 1 |
C2: 一
`,
      {
        pageConfig: {
          biaoti_size: 24,
          geci_font: 'KaiTi',
          body_margin_top: 27,
          height_shengbu: 27,
          lianyinxian_type: 2,
        },
      },
    )

    expect(svg).toContain('font-size="19" font-family="KaiTi">甲</text>')
    expect(svg).toContain('font-size="19" font-family="KaiTi">乙</text>')
    expect(svg).toContain('xlink:href="#lianyinxian_zuo"')
    expect(svg).not.toContain('<g id="lianyin_shuzi_3"')
    expect(svg).not.toContain('<path d="M ')
  })

  it('renders all meters from the final P header and one tempo of each kind', () => {
    const svg = render(`
B: 标题
P: 4/4
P: 3/4 (2/4 1/4)
J: 80
J: 120
J: 欢快地
J: 抒情地
Q: 1 |
`)

    expect(svg.match(/xlink:href="#paihao_xian"/g)).toHaveLength(3)
    expect(svg).toContain('<g id="paihao_kuohu_zuo"')
    expect(svg).toContain('<g id="paihao_kuohu_you"')
    expect(svg).toContain('xlink:href="#paihao_kuohu_zuo"')
    expect(svg).toContain('xlink:href="#paihao_kuohu_you"')
    expect(svg).toContain('data-jiepai="80"')
    expect(svg).not.toContain('data-jiepai="120"')
    expect(svg).toContain('>欢快地</text>')
    expect(svg).not.toContain('>抒情地</text>')
  })

  it('does not render metadata header fields without a B line', () => {
    const svg = render(`D: C\nP: 4/4\nJ: 80\nZ: 作者\nQ: 1 |`)

    expect(svg).not.toContain('xlink:href="#diaohao_fu"')
    expect(svg).not.toContain('xlink:href="#paihao_xian"')
    expect(svg).not.toContain('xlink:href="#jiepaifu"')
    expect(svg).not.toContain('>作者</text>')
    expect(svg).toContain('x="83" y="130" xlink:href="#shuzi_b_1"')
  })

  it('keeps barline annotations in code without displaying ordinary text', () => {
    const svg = render(`Q: 1 |"p:2 / 4" 2 |"备注" 3 |`)

    expect(svg).toContain('code="|\'p:2/4\'"')
    expect(svg).toContain('code="|\'备注\'"')
    expect(svg).not.toContain('>备注</text>')
  })

  it('matches the observed legacy spacing constants', () => {
    const svg = render(`
Q: 1 2 3 4 |
Q: 1/ 2/ 3/ 4/ |
Q: 1// 2// 3// 4// |
`)

    expect(uses(svg, 1)).toEqual([
      { x: 83, code: '1' },
      { x: 120.5, code: '2' },
      { x: 158, code: '3' },
      { x: 195.5, code: '4' },
      { x: 230.5, code: '|' },
    ])
    expect(uses(svg, 2)).toEqual([
      { x: 83, code: '1/' },
      { x: 108, code: '2/' },
      { x: 145.5, code: '3/' },
      { x: 170.5, code: '4/' },
      { x: 205.5, code: '|' },
    ])
    expect(uses(svg, 3)).toEqual([
      { x: 83, code: '1//' },
      { x: 108, code: '2//' },
      { x: 133, code: '3//' },
      { x: 158, code: '4//' },
      { x: 193, code: '|' },
    ])
  })

  it('keeps hidden placeholder notes in the positioned SVG stream', () => {
    const svg = render(`Q: 8 1 |`)

    expect(svg).toContain('<g id="shuzi_null"')
    expect(svg).toContain(
      'x="83" y="130" xlink:href="#shuzi_null" time="0" audio="" notepos="0_1_1" code="8"',
    )
  })

  it('numbers grace-note definitions by page-local source order', () => {
    const svg = render(`Q: 1[1/] 2[2/] 3[h3/] |\n[fenye]\nQ: 1[1/] |`)
    const pages = svg.split('[fenye]').filter(Boolean)

    expect(pages[0]).toContain('<g id="qy0_0"')
    expect(pages[0]).toContain('<g id="qy1_0"')
    expect(pages[0]).toContain('<g id="hy2_0"')
    expect(pages[1]).toContain('<g id="qy0_1"')
  })

  it('aligns voices at beat starts without distributing notes within a beat', () => {
    const svg = render(`
Q1: 1// 2// 3// 4// |
Q2: 1/ 2/ |
`)

    expect(uses(svg, 1)).toEqual([
      { x: 103, code: '1//' },
      { x: 128, code: '2//' },
      { x: 153, code: '3//' },
      { x: 178, code: '4//' },
      { x: 213, code: '|' },
    ])
    expect(uses(svg, 2)).toEqual([
      { x: 103, code: '1/' },
      { x: 128, code: '2/' },
      { x: 213, code: '|' },
    ])
  })

  it('moves the voice-brace column to the first sbf boundary', () => {
    const svg = render(`
Q1: 1 2 |&sbf 3 4 |
Q2: 8 8 |* 5 6 |
`)

    expect(uses(svg, 1)).toEqual([
      { x: 83, code: '1' },
      { x: 120.5, code: '2' },
      { x: 210.5, code: '3' },
      { x: 248, code: '4' },
      { x: 155.5, code: '|&sbf' },
      { x: 283, code: '|' },
    ])
    expect(svg).toContain('x="210.5" y="130" xlink:href="#shengbufu_shang"')
    expect(svg).toContain('x1="185" y1="123.5"')
    expect(svg).toContain('x="155.5" y="208" xlink:href="#xiaojiexian_weibu"')
    expect(svg).toContain('code="|w"')
  })

  it('anchors a moved voice brace to an accidental-shifted first note', () => {
    const svg = render(`
Q1: 1 |&sbf 2# |
Q2: 8 |* 3 |
`)

    expect(svg).toContain('x="178" y="130" xlink:href="#shuzi_b_2"')
    expect(svg).toContain('x="178" y="130" xlink:href="#shengbufu_shang"')
  })

  it('renders lyric braces as zero-width SVG controls', () => {
    const svg = render(`Q: 1 2 |\nC: {甲乙}`)

    expect(svg).toContain('<g id="ci_dakuohu_zuo"')
    expect(svg).toContain('<g id="ci_dakuohu_you"')
    expect(svg).toContain('xlink:href="#ci_dakuohu_zuo" transform="translate(68,182)scale(1,4.2)"')
    expect(svg).toContain(
      'xlink:href="#ci_dakuohu_you" transform="translate(135.5,182)scale(1,4.2)"',
    )
    expect(svg).not.toContain('>}</text>')
  })

  it('keeps voices aligned after a barred repeat end', () => {
    const svg = render(`
Q1: 1 - - - | 2 - - - | 3 - - - | {dsb 4 - - - |} 5 - - - |
Q2: 6 - - - | 7 - - - :|| 1' - - - | 2 - - - |
`)
    const upper = uses(svg, 1)
    const lower = uses(svg, 2)
    const upperLead = upper.find(({ code }) => code === '3')
    const lowerLead = lower.find(({ code }) => code === "1'")

    expect(upperLead).toBeDefined()
    expect(lowerLead).toBeDefined()
    expect(upperLead?.x).toBe(lowerLead?.x)
    expect(lower.filter(({ code }) => code === '|yj')).toHaveLength(1)
  })

  it('uses reduced spacing throughout quarter-note tuplets', () => {
    const svg = render(`Q: (y1 2 3) 4 |`)

    expect(uses(svg, 1)).toEqual([
      { x: 83, code: '1(ys' },
      { x: 108, code: '2' },
      { x: 133, code: '3)' },
      { x: 170.5, code: '4' },
      { x: 205.5, code: '|' },
    ])
  })

  it('scales notes and sustains consistently inside tuplets', () => {
    const svg = render(`Q: (y1 - 2) |`)

    expect(svg.match(/time="0\.67"/g)).toHaveLength(3)
    expect(svg).toContain('xlink:href="#lianyin_shuzi_3"')
  })

  it('stacks genuinely overlapping slurs while sharing touching endpoints', () => {
    const nested = render(`Q: ((1 2) 3) |`)
    const coincident = render(`Q: ((1 2)) |`)
    const chained = render(`Q: (1 (1) 1) |`)

    expect(nested).toContain('M 84,114 C')
    expect(nested).toContain('M 84,106 C')
    expect(coincident).toContain('M 84,114 C')
    expect(coincident).toContain('M 84,109 C')
    expect(chained.match(/M \d+(?:\.\d+)?,114 C/g)).toHaveLength(4)
    expect(chained).not.toContain(',106 C')
  })

  it('matches legacy dynamics, hairpins, and volta positioning', () => {
    const svg = render(`
Q: 1&f 2 |
Q: 1>&mf 2 3! |
Q: 1> 2 3!&p |
Q: 1>+ 2 3! |
Q: 1>++ 2 3! |
Q: |/[+"1." 1 2 |]
`)

    expect(svg).toContain('x="83" y="127" xlink:href="#lidu_f"')
    expect(svg).toContain('x="58" y="210" xlink:href="#lidu_mf"')
    expect(svg).toContain('x="178" y="300" xlink:href="#lidu_p"')
    expect(svg).toContain('x1="76" y1="185" x2="165" y2="190"')
    expect(svg).toContain('x1="76" y1="195" x2="165" y2="190"')
    expect(svg).toContain('x1="76" y1="360" x2="165" y2="365"')
    expect(svg).toContain('x1="76" y1="445" x2="165" y2="450"')
    expect(svg).toContain('x1="77" y1="550" x2="77" y2="540"')
    expect(svg).toContain('x1="77" y1="540" x2="153.5" y2="540"')
    expect(svg).toContain('x1="153.5" y1="550" x2="153.5" y2="540"')
    expect(svg).toContain(
      'x="80" y="550" dy="4.026" fill="#303030" font-size="12" font-family="Microsoft YaHei" xml:space="preserve">1.</text>',
    )
  })

  it('renders lyric punctuation separately using legacy width estimates', () => {
    const svg = render(`Q: 1 2 |\nC: 你，ABC,`, {
      pageConfig: { geci_size: 16 },
    })

    expect(svg).toContain(
      'x="75" y="168" dy="5.368" fill="#101010" font-size="16" font-family="Microsoft YaHei" cipos="0_1_1">你</text>',
    )
    expect(svg).toContain(
      'x="91" y="168" dy="5.368" fill="#101010" font-size="16" font-family="Microsoft YaHei">，</text>',
    )
    expect(svg).toContain(
      'x="112.5" y="168" dy="5.368" fill="#101010" font-size="16" font-family="Microsoft YaHei" cipos="0_1_2">ABC</text>',
    )
    expect(svg).toContain(
      'x="135.5" y="168" dy="5.368" fill="#101010" font-size="16" font-family="Microsoft YaHei">,</text>',
    )
  })

  it('pushes later notes apart for overlong full-width and ASCII lyrics', () => {
    const svg = render(`Q1: 1/ 2/ 3/ 4/\nC1: 多~个~字 example 测试`)

    expect(uses(svg, 1).filter(({ code }) => code.endsWith('/'))).toEqual([
      { x: 83, code: '1/' },
      { x: 166.33333333333, code: '2/' },
      { x: 276.05555555556, code: '3/' },
      { x: 301.05555555556, code: '4/' },
    ])
  })

  it('aligns and reserves space for temporary accompaniment and voices', () => {
    const svg = render(`
Q: 1 2 {dsb 3 4} 5 6 |
C: 甲乙丙丁
Q: 1 2 {bz 3/ 4/} 5 6 |
`)

    expect(svg).toContain('x="158" y="130" xlink:href="#shuzi_b_3"')
    expect(svg).toContain('x="195.5" y="130" xlink:href="#shuzi_b_4"')
    expect(svg).toContain('x="158" y="186" xlink:href="#shuzi_b_5"')
    expect(svg).toContain('x="195.5" y="186" xlink:href="#shuzi_b_6"')
    expect(svg).toContain('x="74" y="224"')
    expect(svg).toContain('x="158" y="292" xlink:href="#shuzi_b_bian_3"')
    expect(svg).toContain('x="183" y="292" xlink:href="#shuzi_b_bian_4"')
    expect(svg).toContain('x="158" y="332" xlink:href="#shuzi_b_5"')
    expect(svg).toContain('x="220.5" y="332" xlink:href="#shuzi_b_6"')
  })

  it('reserves SVG brace columns around an in-line temporary voice', () => {
    const svg = render(`Q: 1 2 | {dsb 6, - } 2 - | 3 4 |`)

    expect(svg).toContain('<g id="dakuohu_zuo_2"')
    expect(svg).toContain('<g id="dakuohu_you_2"')
    expect(svg).toContain('x="175.5" y="158" xlink:href="#dakuohu_zuo_2"')
    expect(svg).toContain('x="210.5" y="130" xlink:href="#shuzi_b_6"')
    expect(svg).toContain('x="210.5" y="186" xlink:href="#shuzi_b_2"')
    expect(svg).toContain('x="283" y="158" xlink:href="#dakuohu_you_2"')
    expect(svg).toContain('x="303" y="158" xlink:href="#xiaojiexian"')
    expect(svg).toContain('x="338" y="158" xlink:href="#shuzi_b_3"')
  })

  it('closes a temporary voice after its matching multi-measure duration', () => {
    const svg = render(`Q: 3 4 | {dsb 1 2 3 4 | 5 6 7 1'} 5 6 7 1' | 1' 7 6 5 | 5 5 |`)

    expect(svg).toContain('x="212.5" y="158" xlink:href="#dakuohu_zuo_2"')
    expect(svg).toContain('x="261.5" y="130" xlink:href="#shuzi_b_1"')
    expect(svg).toContain('x="261.5" y="186" xlink:href="#shuzi_b_5"')
    expect(svg).toContain('x="468" y="130" xlink:href="#xiaojiexian"')
    expect(svg).toContain('x="468" y="186" xlink:href="#xiaojiexian"')
    expect(svg).toContain('x="723.5" y="158" xlink:href="#dakuohu_you_2"')
    expect(svg).toContain('x="751.5" y="158" xlink:href="#xiaojiexian"')
    expect(svg).toContain('x="800.5" y="158" xlink:href="#shuzi_b_5"')
    expect(svg).toContain('x="923" y="158" xlink:href="#xiaojiexian"')
  })

  it('uses reduced SVG parentheses for temporary accompaniment', () => {
    const svg = render(`Q: 3 4 | {bz 1&zkh 2 3 4&ykh} 5 6 7 1 |`)

    expect(svg).toContain('<g id="kuohu_zuo_bian"')
    expect(svg).toContain('<g id="kuohu_you_bian"')
    expect(svg).toMatch(/xlink:href="#kuohu_zuo_bian"/)
    expect(svg).toMatch(/xlink:href="#kuohu_you_bian"/)
  })

  it('emits temporary-voice braces only at visible branch boundaries', () => {
    const rightOnly = render(`Q: 1 2 {dsb 3 4} 5 6 | 7 1 |`)
    const leftOnly = render(`Q: 1 2 | {dsb 3 4} 5 6 |`)

    expect(rightOnly).not.toContain('xlink:href="#dakuohu_zuo_2"')
    expect(rightOnly).toContain('x="230.5" y="158" xlink:href="#dakuohu_you_"')
    expect(rightOnly).toContain('x="250.5" y="158" xlink:href="#xiaojiexian"')
    expect(leftOnly).toContain('x="175.5" y="158" xlink:href="#dakuohu_zuo_2"')
    expect(leftOnly).not.toMatch(/xlink:href="#dakuohu_you_/)
    expect(leftOnly).toContain('x="210.5" y="130" xlink:href="#shuzi_b_3"')
    expect(leftOnly).toContain('x="283" y="186" xlink:href="#xiaojiexian"')
  })

  it('drops a terminal temporary voice like the legacy renderer', () => {
    const svg = render(`Q: 1 {dsb 2#'//[3/]}`)

    expect(svg).not.toContain('code="2#&apos;//[3/]"')
    expect(svg).not.toContain('xlink:href="#shuzi_b_2"')
    expect(svg).not.toContain('<g id="qy0_0"')
  })

  it('splits same-page cross-line slurs at the page margins', () => {
    const svg = render(`Q: 1 2 (3 4 |\nQ: 1 2 3) 4 |`)

    expect(svg).toContain('xlink:href="#lianyinxian_zuo"')
    expect(svg).toContain('xlink:href="#lianyinxian_you"')
    expect(svg).toContain('x2="924" y2="104.8"')
    expect(svg).toContain('x1="77" y1="182.8"')
  })

  it('splits same-page cross-line volta marks at the page margins', () => {
    const svg = render(`Q: 1 |["1." 2 3 |\nQ: |/ 4 5 |] 6 |`)

    expect(svg).toContain('x2="924"')
    expect(svg).toContain('x1="76"')
    expect(svg.match(/>1\.<\/text>/g)).toHaveLength(1)
  })

  it('does not render automatic slur continuations across pages', () => {
    const svg = render(`Q: 1 (2 |\n[fenye]\nQ: 3) 4 |`)

    expect(svg).not.toContain('xlink:href="#lianyinxian_zuo"')
    expect(svg).not.toContain('xlink:href="#lianyinxian_you"')
  })

  it('keeps short multi-measure phrases at their natural width', () => {
    const svg = render(`Q: 1 2 | 3 4 |`)

    expect(uses(svg, 1)).toEqual([
      { x: 83, code: '1' },
      { x: 120.5, code: '2' },
      { x: 190.5, code: '3' },
      { x: 228, code: '4' },
      { x: 155.5, code: '|' },
      { x: 263, code: '|' },
    ])
  })

  it('emits only requested glyph definitions and merges beam lines', () => {
    const svg = render(`Q: 1// 1// 1// 1// |`)

    expect(svg).toContain('<g id="shuzi_b_1"')
    expect(svg).not.toContain('<g id="shuzi_b_2"')
    expect(svg).not.toContain('<g id="xunhuan_zuo"')
    expect(svg.match(/data-type="jianshixian"/g)).toHaveLength(2)
    expect(svg).toContain('x1="77"')
    expect(svg).toContain('x2="164"')
  })

  it('renders score symbols from path-based API glyphs', () => {
    const svg = render(`Q: 1&zkh 2&hx 3&shy 4&cy |&fine`)
    const defs = svg.match(/<defs>([\s\S]*?)<\/defs>/)?.[1] ?? ''

    expect(defs).toContain('<g id="kuohu_zuo"')
    expect(defs).toContain('<g id="huxifu"')
    expect(defs).toContain('<g id="huayin_shang"')
    expect(defs).toContain('<g id="changyinfu1"')
    expect(defs).toContain('<g id="xiaojiexian_fine"')
    expect(defs).toContain('<path')
    expect(defs).not.toContain('<text')
  })

  it('supports legacy page config, pagination, partial redraws, and custom SVG', () => {
    const custom = '<defs><g id="custom_x"></g></defs><use xlink:href="#custom_x"></use>[fenye]'
    const output = render(`Q: 1\n[fenye]\nQ: 2`, {
      pageConfig: JSON.stringify({ page: 'A5', margin_left: '100' }),
      customCode: custom,
      pageNum: 0,
    })

    expect(output).toMatch(/^<svg width="840" height="1193"/)
    expect(output).toContain('x="103"')
    expect(output).toContain('<g id="custom"><defs><g id="custom_x">')
    expect(output.endsWith('[fenye]noRedraw[fenye]')).toBe(true)
  })

  it('renders metadata and lyric text with XML escaping', () => {
    const output = render(`B: A & B\nZ: <作者>\nD: C\nP: 4/4\nQ: 1 2\nC: 你~好 世界`)

    expect(output).toContain('A &amp; B')
    expect(output).toContain('&lt;作者&gt;')
    expect(output).toContain('>你好</text>')
    expect(output).toContain('>世</text>')
  })
})
