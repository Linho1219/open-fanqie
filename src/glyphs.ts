import staticGlyphs from "./assets/glyphs.json";
import type { Accidental, BarlineType, Ornament } from "./types";

const GLYPHS: Readonly<Record<string, string>> = staticGlyphs;

export const ORNAMENT_GLYPH_IDS: Readonly<Record<string, string>> = {
  zkh: "kuohu_zuo",
  ykh: "kuohu_you",
  yc: "yanchang",
  bc: "baochifu",
  zy: "zhongyinfu",
  dy: "dunyinfu",
  hx: "huxifu",
  shy: "huayin_shang",
  xhy: "huayin_xia",
  sby: "boyinfu_shang1",
  xby: "boyinfu_xia1",
  cy: "changyinfu1",
  ppp: "lidu_ppp",
  pp: "lidu_pp",
  p: "lidu_p",
  mp: "lidu_mp",
  mf: "lidu_mf",
  f: "lidu_f",
  ff: "lidu_ff",
  fff: "lidu_fff",
  cresc: "lidu_cresc",
  dim: "lidu_dim",
  sf: "lidu_sf",
  fp: "lidu_fp",
  sfp: "lidu_sfp",
  atempo: "lidu_atempo",
  rit: "lidu_rit",
};

export const BARLINE_GLYPH_IDS: Readonly<Record<Exclude<BarlineType, "hidden" | "invisible">, string>> = {
  normal: "xiaojiexian",
  end: "jieshufu",
  double: "xiaojiexian_shuangxian",
  "repeat-start": "xunhuan_zuo",
  "repeat-end": "xunhuan_you",
  "repeat-both": "xunhuan_zuoyou",
};

export const BARLINE_ORNAMENT_GLYPH_IDS: Readonly<Record<string, string>> = {
  fine: "xiaojiexian_fine",
  dc: "xiaojiexian_dc",
  ds: "xiaojiexian_ds",
  ty: "xiaojiexian_ty",
  hs: "xiaojiexian_hs",
};

export const ACCIDENTAL_GLYPH_IDS: Readonly<Record<Accidental, string>> = {
  sharp: "bianyinfu_sheng",
  flat: "bianyinfu_jiang",
  natural: "bianyinfu_huanyuan",
};

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function attributes(values: Readonly<Record<string, string | number | undefined>>): string {
  return Object.entries(values)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([name, value]) => `${name}="${escapeXml(String(value))}"`)
    .join(" ");
}

/** Collects only the glyphs used by one rendered page, matching the legacy API. */
export class GlyphRegistry {
  readonly #definitions = new Map<string, string>();

  register(id: string): void {
    if (this.#definitions.has(id)) return;
    const definition = GLYPHS[id];
    if (definition === undefined) throw new Error(`Unknown static SVG glyph: ${id}`);
    this.#definitions.set(id, definition);
  }

  define(id: string, body: string): void {
    if (!this.#definitions.has(id)) this.#definitions.set(id, `<g id="${escapeXml(id)}">${body}</g>`);
  }

  use(
    id: string,
    x: number,
    y: number,
    extra: Readonly<Record<string, string | number | undefined>> = {},
  ): string {
    this.register(id);
    return this.useDefined(id, x, y, extra);
  }

  useDefined(
    id: string,
    x: number,
    y: number,
    extra: Readonly<Record<string, string | number | undefined>> = {},
  ): string {
    if (!this.#definitions.has(id)) throw new Error(`Undefined SVG glyph: ${id}`);
    const suffix = attributes(extra);
    return `<use x="${formatNumber(x)}" y="${formatNumber(y)}" xlink:href="#${escapeXml(id)}"${suffix === "" ? "" : ` ${suffix}`} xmlns:xlink="http://www.w3.org/1999/xlink"></use>`;
  }

  definitions(): string {
    return `<defs>\n${[...this.#definitions.values()].join("\n")}\n</defs>`;
  }
}

export function ornamentGlyph(ornament: Ornament): string | undefined {
  const base = ORNAMENT_GLYPH_IDS[ornament.name];
  if (base === undefined) return undefined;
  if ((ornament.name === "sby" || ornament.name === "xby" || ornament.name === "cy") && ornament.level > 0) {
    return `${base.slice(0, -1)}2`;
  }
  return base;
}
