import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ENDPOINT = 'http://zhipu.lezhi99.com/Zhipu-draw'
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/assets/glyphs.json')

const coreProbe = `V: 1.0
B: glyph probe
D: A
P: 0/1 2/3 4/5 6/7 8/9
J: 80
Q: 0 1 2 3 4 5 6 7 8 9 - |
Q: 1# 2$ 3= 4' 5'' 6, 7,, 1. 2.. |
Q: 1[0/1/2/3/4/5/6/7/] 1[h0/1/2/3/4/5/6/7/] |
Q: 1&zkh 1&ykh 1&yc 1&ycy 1&bc 1&zy 1&dy 1&hx 1&shy 1&xhy 1&sby 1&sby+ 1&xby 1&xby+ 1&cy 1&cy+ 1&tr |
Q: 1&ppp 1&pp 1&p 1&mp 1&mf 1&f 1&ff 1&fff 1&cresc 1&dim 1&sf 1&fp 1&sfp 1&atempo 1&rit |
Q: 1 |&fine 2 |&dc 3 |&ds 4 |&ty 5 |&hs 6 || 7 ||/ 1 |: 2 :| 3 :|:
Q1: 1 |
Q2: 1 |
Q: |"p:0/1" 1 |"p:2/3" 2 |"p:4/5" 3 |"p:6/7" 4 |"p:8/9" 5
Q: (y1/ 2/) | (y1/ 2/ 3/) | (y1/ 2/ 3/ 4/) | (y1/ 2/ 3/ 4/ 5/) |
Q: (y1/ 2/ 3/ 4/ 5/ 6/) | (y1/ 2/ 3/ 4/ 5/ 6/ 7/) |
Q: (y1/ 2/ 3/ 4/ 5/ 6/ 7/ 1/) | (y1/ 2/ 3/ 4/ 5/ 6/ 7/ 1/ 2/) |
Q: (1 2 |
Q: 3 4) |
Q: 1 2 | {dsb 6, - } 2 - | 3 4 |
Q: 1 2 {dsb 6, - } 2 - | 3 4 |
Q: 1 2 | {bz 3&zkh 4&ykh } 5 6 | 7 1 |
`

const probes = [
  {
    code: 'Q: 1 2 {dsb 6, - } 2 - | 3 4 |',
    pageConfig: '{}',
  },
  ...['a', 'b', 'c'].map((numberStyle) => ({
    code: coreProbe,
    pageConfig: JSON.stringify({ shuzi_font: numberStyle }),
  })),
  ...['B', 'C', 'D', 'E', 'F', 'G'].map((mode) => ({
    code: `V: 1.0\nB: glyph probe\nD: ${mode}\nP: 4/4\nQ: 1 |`,
    pageConfig: '{}',
  })),
]

async function draw({ code, pageConfig }) {
  const body = new URLSearchParams({ code, customCode: '', pageConfig, pageNum: '0' })
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
  })
  if (!response.ok) throw new Error(`Fanqie renderer returned HTTP ${response.status}`)
  return response.text()
}

function staticGroups(svg) {
  const defs = svg.match(/<defs>([\s\S]*?)<\/defs>/)?.[1] ?? ''
  return [...defs.matchAll(/<g id="([^"]+)"[\s\S]*?<\/g>/g)]
    .filter(([, id]) => id !== 'custom' && !/^(?:hy|qy)\d+_/.test(id))
    .map((match) => [match[1], match[0]])
}

const glyphs = new Map()
for (const probe of probes) {
  for (const [id, markup] of staticGroups(await draw(probe))) glyphs.set(id, markup)
}

// The legacy response references this right brace without emitting its def.
// It is the same two-staff outline as the paired right brace.
if (!glyphs.has('dakuohu_you_') && glyphs.has('dakuohu_you_2')) {
  glyphs.set(
    'dakuohu_you_',
    glyphs.get('dakuohu_you_2').replace('id="dakuohu_you_2"', 'id="dakuohu_you_"'),
  )
}

const output = Object.fromEntries([...glyphs].sort(([left], [right]) => left.localeCompare(right)))
if (Object.keys(output).length < 100) {
  throw new Error(
    `Only extracted ${Object.keys(output).length} glyphs; refusing to overwrite ${OUTPUT}`,
  )
}
if (Object.values(output).some((markup) => markup.includes('<text'))) {
  throw new Error('The API response unexpectedly contained text-based score glyphs')
}

await mkdir(dirname(OUTPUT), { recursive: true })
await writeFile(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
console.log(`Extracted ${Object.keys(output).length} glyphs to ${OUTPUT}`)
