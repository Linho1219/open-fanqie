import { pageSpacing, resolvePageConfig, type ResolvedPageConfig } from "./config";
import {
  ACCIDENTAL_GLYPH_IDS,
  BARLINE_GLYPH_IDS,
  BARLINE_ORNAMENT_GLYPH_IDS,
  escapeXml,
  formatNumber,
  GlyphRegistry,
  ornamentGlyph,
} from "./glyphs";
import {
  BARLINE_GAP,
  layoutVoiceGroup,
  PLAIN_NOTE_STEP,
  UNDERLINED_NOTE_STEP,
  type LineLayout,
  type PositionedElement,
} from "./layout";
import { parse } from "./parser";
import type {
  BarlineElement,
  Diagnostic,
  InlineLayerElement,
  Mark,
  Metadata,
  NoteElement,
  Ornament,
  RenderOptions,
  ScoreLine,
  ScorePage,
  SustainElement,
} from "./types";

const FONT_SIZE_FIX = 0.8355;
const INK = "#1b1b1b";

function text(
  value: string,
  x: number,
  y: number,
  options: {
    font: string;
    size: number;
    anchor?: "start" | "middle" | "end";
    bold?: boolean;
    italic?: boolean;
    fill?: string;
    dy?: number;
    extra?: Readonly<Record<string, string | number>>;
  },
): string {
  const style = [
    options.bold === true ? "font-weight:bold" : "",
    options.italic === true ? "font-style:italic" : "",
  ].filter(Boolean).join(";");
  const extra = options.extra === undefined
    ? ""
    : Object.entries(options.extra).map(([name, item]) => ` ${name}="${escapeXml(String(item))}"`).join("");
  return `<text x="${formatNumber(x)}" y="${formatNumber(y)}" dy="${formatNumber(options.dy ?? FONT_SIZE_FIX * options.size)}"${options.anchor === undefined || options.anchor === "start" ? "" : ` text-anchor="${options.anchor}"`} fill="${options.fill ?? INK}"${style === "" ? "" : ` style="${style};"`} font-size="${formatNumber(options.size)}" font-family="${escapeXml(options.font)}"${extra}>${escapeXml(value)}</text>`;
}

function durationTime(note: NoteElement): number {
  let multiplier = 1;
  let fraction = 0.5;
  for (let dot = 0; dot < note.dots; dot += 1) {
    multiplier += fraction;
    fraction /= 2;
  }
  return (4 / note.duration) * multiplier;
}

function audioCode(note: NoteElement): string {
  const octave = note.octave > 0
    ? "'".repeat(note.octave)
    : ",".repeat(Math.abs(note.octave));
  return `${note.pitch}${octave}`;
}

function modeHeader(
  metadata: Metadata,
  config: ResolvedPageConfig,
  registry: GlyphRegistry,
  y: number,
): string[] {
  const output: string[] = [];
  let x = config.marginLeft;
  if (metadata.mode !== undefined) {
    output.push(registry.use("diaohao_fu", x, y));
    output.push(registry.use(`diaohao_zimu_${metadata.mode[0]?.toLowerCase()}`, x + 40, y, {
      code: metadata.mode,
      "data-diaohao": "true",
    }));
    if (metadata.mode[1] === "#" || metadata.mode[1] === "$") {
      output.push(registry.use(metadata.mode[1] === "#" ? "bianyinfu_sheng" : "bianyinfu_jiang", x + 50, y));
      x += 12;
    }
    x += 50;
  }

  const meter = metadata.meters[0];
  if (meter !== undefined) {
    output.push(registry.use("paihao_xian", x, y));
    const digitX = x + 10;
    output.push(registry.use(`shuzi_${config.numberStyle}_bian_${meter.numerator}`, digitX, y - 12));
    output.push(registry.use(`shuzi_${config.numberStyle}_bian_${meter.denominator}`, digitX, y + 12, {
      fill: "#414141",
    }));
  }

  metadata.tempos.forEach((tempo, index) => {
    const tempoY = y + 40 + index * 22;
    if (typeof tempo === "number") {
      output.push(registry.use("jiepaifu", config.marginLeft, tempoY));
      output.push(text(String(tempo), config.marginLeft + 32, tempoY + 1, {
        font: config.lyricFont,
        size: 16,
        dy: 0.3355 * 16,
        extra: { "data-jiepai": tempo },
      }));
    } else {
      output.push(text(tempo, config.marginLeft, tempoY, {
        font: config.lyricFont,
        size: 16,
        dy: 0.3355 * 16,
      }));
    }
  });
  return output;
}

function renderHeader(
  metadata: Metadata,
  config: ResolvedPageConfig,
  registry: GlyphRegistry,
): { markup: string[]; bodyY: number } {
  const markup: string[] = [];
  const titleY = config.marginTop + 30;
  const [mainTitle, ...subtitles] = metadata.titles;
  if (mainTitle !== undefined) {
    markup.push(text(mainTitle, config.width / 2, titleY, {
      font: config.titleFont,
      size: config.titleSize,
      anchor: "middle",
      bold: true,
    }));
  }
  subtitles.forEach((subtitle, index) => {
    markup.push(text(subtitle, config.width / 2, titleY + config.titleSize + 20 + index * (config.subtitleSize + 8), {
      font: config.titleFont,
      size: config.subtitleSize,
      anchor: "middle",
    }));
  });
  const titleOffset = config.titleSize - 36;
  const infoY = config.marginTop + 96 + titleOffset;
  markup.push(...modeHeader(metadata, config, registry, infoY));
  const authorSize = config.lyricFont === "KaiTi" ? 19 : 16;
  const authorBottomY = config.marginTop + 125 + titleOffset + Math.max(0, metadata.authors.length - 1) * 21;
  [...metadata.authors].map((author, index) => ({ author, index })).reverse().forEach(({ author, index }) => {
    const authorY = authorBottomY - (metadata.authors.length - 1 - index) * (authorSize + 5);
    markup.push(text(author, config.width - config.marginRight, authorY, {
      font: config.lyricFont,
      size: authorSize,
      anchor: "end",
      dy: -0.1645 * authorSize,
    }));
  });
  return {
    markup,
    bodyY: infoY + config.bodyMarginTop + 20 + (metadata.tempos.length > 0 ? 30 : 0),
  };
}

function notePositionCode(page: number, line: number, item: number): string {
  return `${page}_${line}_${item}`;
}

function itemOrdinals(line: ScoreLine): Map<number, number> {
  const ordinals = new Map<number, number>();
  let ordinal = 0;
  line.elements.forEach((element, index) => {
    if (element.kind === "note" || element.kind === "sustain" || element.kind === "barline") {
      ordinal += 1;
      ordinals.set(index, ordinal);
    }
  });
  return ordinals;
}

function renderGrace(
  notes: NoteElement[],
  x: number,
  y: number,
  before: boolean,
  notepos: string,
  registry: GlyphRegistry,
): string[] {
  if (notes.length === 0) return [];
  const prefix = before ? "qy" : "hy";
  const id = `${prefix}${notepos.replaceAll("_", "-")}`;
  const step = 9;
  const body: string[] = [];
  notes.forEach((note, index) => {
    const localX = index * step;
    const glyph = note.pitch === 9 ? "shuzi_x" : `yiyin_shuzi_${note.pitch}`;
    registry.register(glyph);
    body.push(`<use x="${formatNumber(localX)}" y="-17" xlink:href="#${glyph}" xmlns:xlink="http://www.w3.org/1999/xlink"></use>`);
    if (note.accidental !== undefined) {
      const accidental = ACCIDENTAL_GLYPH_IDS[note.accidental];
      registry.register(accidental);
      body.push(`<use x="${formatNumber(localX - 5)}" y="-17" xlink:href="#${accidental}" xmlns:xlink="http://www.w3.org/1999/xlink"></use>`);
    }
    const octaveGlyph = note.octave >= 0 ? "yingao_gao" : "yingao_di";
    for (let octave = 0; octave < Math.abs(note.octave); octave += 1) {
      registry.register(octaveGlyph);
      body.push(`<use x="${formatNumber(localX)}" y="${formatNumber(note.octave > 0 ? -27 - octave * 4 : -7 + octave * 4)}" xlink:href="#${octaveGlyph}" xmlns:xlink="http://www.w3.org/1999/xlink"></use>`);
    }
  });
  const levels = Math.max(1, ...notes.map((note) => Math.max(1, Math.log2(note.duration / 4))));
  for (let level = 0; level < levels; level += 1) {
    body.unshift(`<line x1="-3.5" y1="${formatNumber(-10.5 + level * 3)}" x2="${formatNumber((notes.length - 1) * step + 3.5)}" y2="${formatNumber(-10.5 + level * 3)}" stroke-width="1" stroke="${INK}"></line>`);
  }
  const tail = before ? "yiyinxian_qian" : "yiyinxian_hou";
  registry.register(tail);
  body.push(`<use x="${formatNumber(before ? (notes.length - 1) * step - 0.5 : -0.5)}" y="-17" xlink:href="#${tail}" xmlns:xlink="http://www.w3.org/1999/xlink"></use>`);
  registry.define(id, body.join(""));
  return [registry.useDefined(id, before ? x - 12 - (notes.length - 1) * step : x + 15, y)];
}

function ornamentY(ornament: Ornament, y: number): number {
  if (["zkh", "ykh", "cy", "tr", "yc", "ycy", "shy", "xhy"].includes(ornament.name)) return y;
  if (ornament.name === "rit") return y - 3 - ornament.level * 6;
  if (ornament.name === "bc") return y - 17 - ornament.level * 6;
  return y - 24 - ornament.level * 6;
}

function renderOrnaments(
  ornaments: Ornament[],
  x: number,
  y: number,
  registry: GlyphRegistry,
): string[] {
  return ornaments.flatMap((ornament) => {
    const id = ornamentGlyph(ornament);
    if (id === undefined) return [];
    return [registry.use(id, x, ornamentY(ornament, y))];
  });
}

function renderNote(
  note: NoteElement,
  x: number,
  y: number,
  notepos: string,
  config: ResolvedPageConfig,
  registry: GlyphRegistry,
  timeOverride?: number,
  audioOverride?: string,
): string[] {
  const output: string[] = [];
  if (!note.hidden) {
    const id = note.pitch === 9 ? "shuzi_x" : `shuzi_${config.numberStyle}_${note.pitch}`;
    output.push(registry.use(id, x, y, {
      time: formatNumber(timeOverride ?? durationTime(note)),
      audio: audioOverride ?? audioCode(note),
      notepos,
      code: note.code,
    }));
    if (note.accidental !== undefined) {
      output.push(registry.use(ACCIDENTAL_GLYPH_IDS[note.accidental], x, y));
    }
    const dotId = note.octave >= 0 ? "yingao_gao" : "yingao_di";
    const underlineCount = Math.max(0, Math.log2(note.duration / 4));
    for (let octave = 0; octave < Math.abs(note.octave); octave += 1) {
      const octaveY = note.octave > 0
        ? y - octave * 6
        : y + 1 + underlineCount * 4 + octave * 6;
      output.push(registry.use(dotId, x + (note.pitch === 4 ? 2.5 : 0), octaveY));
    }
    if (note.dots >= 2) output.push(registry.use("fudian2", x, y));
    else if (note.dots === 1) output.push(registry.use("fudian", x, y));
    for (let dot = 2; dot < note.dots; dot += 1) output.push(registry.use("fudian", x + 14 + (dot - 2) * 7, y));
    if (note.graceBefore !== undefined) {
      output.push(...renderGrace(note.graceBefore, x, y, true, notepos, registry));
    }
    if (note.graceAfter !== undefined) {
      output.push(...renderGrace(note.graceAfter, x, y, false, notepos, registry));
    }
    if (note.annotation !== undefined) {
      output.push(text(note.annotation, x - 6, y - 24, {
        font: config.lyricFont,
        size: 12,
        fill: "#303030",
        dy: 0.3355 * 12,
        extra: { "xml:space": "preserve" },
      }));
    }
    output.push(...renderOrnaments(note.ornaments, x, y, registry));
  }
  return output;
}

function renderSustain(
  sustain: SustainElement,
  x: number,
  y: number,
  notepos: string,
  registry: GlyphRegistry,
): string[] {
  return [
    registry.use("yanyinfu", x, y, {
      time: 1,
      audio: "",
      notepos,
      code: sustain.code,
    }),
    ...renderOrnaments(sustain.ornaments, x, y, registry),
  ];
}

function renderBarline(
  barline: BarlineElement | undefined,
  synthetic: boolean,
  x: number,
  y: number,
  notepos: string,
  registry: GlyphRegistry,
): string[] {
  if (barline?.type === "hidden" || barline?.type === "invisible") return [];
  const id = synthetic
    ? "xiaojiexian_weibu"
    : BARLINE_GLYPH_IDS[barline?.type ?? "normal"];
  const code = synthetic
    ? "|w"
    : ({
        normal: "|",
        end: "|j",
        double: "|s",
        "repeat-start": "|z",
        "repeat-end": "|y",
        "repeat-both": "|l",
      } as const)[barline?.type ?? "normal"];
  const output = [registry.use(id, x, y, {
    notepos,
    time: 0,
    audio: "",
    code,
  })];
  barline?.ornaments.forEach((ornament) => {
    const id = BARLINE_ORNAMENT_GLYPH_IDS[ornament.name];
    if (id !== undefined) output.push(registry.use(id, x, y - 26));
  });
  if (barline?.temporaryMeter !== undefined) {
    output.push(registry.use("linshi_paihao_fenxian", x + 18, y));
    output.push(registry.use(`linshi_paihao_shuzi_${barline.temporaryMeter.numerator}`, x + 28, y - 12));
    output.push(registry.use(`linshi_paihao_shuzi_${barline.temporaryMeter.denominator}`, x + 28, y + 12));
  }
  if (barline?.annotation !== undefined) {
    output.push(text(barline.annotation, x, y + 20, {
      font: "Microsoft YaHei",
      size: 12,
      anchor: "middle",
    }));
  }
  return output;
}

function renderUnderlines(layout: LineLayout, y: number): string[] {
  const output: string[] = [];
  const notes = layout.elements.filter((positioned): positioned is PositionedElement & { element: NoteElement; beat: number } =>
    positioned.element.kind === "note" && positioned.beat !== undefined && !positioned.element.hidden
  );
  const groups = new Map<string, typeof notes>();
  notes.forEach((positioned) => {
    const key = `${positioned.measure}:${positioned.beat}`;
    const group = groups.get(key) ?? [];
    group.push(positioned);
    groups.set(key, group);
  });

  groups.forEach((items) => {
    const maxLines = Math.max(0, ...items.map(({ element }) => Math.max(0, Math.log2(element.duration / 4))));
    for (let level = 1; level <= maxLines; level += 1) {
      let run: typeof items = [];
      const flush = (): void => {
        if (run.length === 0) return;
        const first = run[0];
        const last = run[run.length - 1];
        if (first !== undefined && last !== undefined) {
          output.push(`<line x1="${formatNumber(first.x - 6)}" y1="${formatNumber(y + 13 + (level - 1) * 3)}" x2="${formatNumber(last.x + 6 + last.element.dots * 10)}" y2="${formatNumber(y + 13 + (level - 1) * 3)}" data-type="jianshixian" stroke-width="2" stroke="${INK}"></line>`);
        }
        run = [];
      };
      items.forEach((item) => {
        if (Math.log2(item.element.duration / 4) >= level) run.push(item);
        else flush();
      });
      flush();
    }
  });
  return output;
}

function nearestMarkX(layout: LineLayout, index: number, direction: "forward" | "backward"): number | undefined {
  const exact = layout.xByElement.get(index);
  if (exact !== undefined) return exact;
  const candidates = [...layout.xByElement.entries()]
    .filter(([elementIndex]) => direction === "forward" ? elementIndex >= index : elementIndex <= index)
    .sort(([left], [right]) => direction === "forward" ? left - right : right - left);
  return candidates[0]?.[1];
}

function renderMark(
  mark: Mark,
  layout: LineLayout,
  y: number,
  config: ResolvedPageConfig,
  registry: GlyphRegistry,
): string[] {
  const start = nearestMarkX(layout, mark.start, "forward");
  const end = nearestMarkX(layout, mark.end, "backward");
  if (start === undefined || end === undefined) return [];
  const x1 = start + 1;
  const x2 = end - 1;
  const markedElements = layout.line.elements.slice(mark.start, mark.end + 1);
  const markClearance = markedElements.some((element) =>
    (element.kind === "note" && element.ornaments.some(({ name }) => name === "yc" || name === "ycy"))
  )
    ? 7
    : markedElements.some((element) => element.kind === "note" && element.octave > 0) ? 5 : 0;
  const top = y - 16 - mark.level * 7 - markClearance;
  if (mark.type === "slur" || mark.type === "tuplet") {
    const span = x2 - x1;
    const flat = config.slurStyle === "flat" || (
      mark.type === "slur" && config.slurStyle === "auto" && end - start > 100
    );
    if (flat) {
      const left = start + 12;
      const right = end - 12;
      const flatY = y - 25.95 - mark.level * 7 - markClearance;
      return [
        registry.use("lianyinxian_zuo", left, flatY),
        registry.use("lianyinxian_you", right, flatY),
        `<line x1="${formatNumber(left + 0.8)}" y1="${formatNumber(flatY + 0.75)}" x2="${formatNumber(right + 1)}" y2="${formatNumber(flatY + 0.75)}" stroke-width="1.2" stroke="${INK}" fill="none"></line>`,
      ];
    }
    const control = span * 0.3 - 0.4;
    const path = `M ${formatNumber(x1)},${formatNumber(top)} C ${formatNumber(x1 + control)},${formatNumber(top - 10)},${formatNumber(x2 - control)},${formatNumber(top - 10)},${formatNumber(x2)},${formatNumber(top)} M ${formatNumber(x2)},${formatNumber(top)} C  ${formatNumber(x2 - control)},${formatNumber(top - 9)},${formatNumber(x1 + control)},${formatNumber(top - 9)},${formatNumber(x1)},${formatNumber(top)}`;
    const output = [`<path d="${path}" stroke-width="0.5" stroke="${INK}"></path>`];
    if (mark.type === "tuplet" && mark.caption !== undefined && /^[2-9]$/.test(mark.caption)) {
      output.push(registry.use(`lianyin_shuzi_${mark.caption}`, (x1 + x2) / 2, top - 7));
    }
    return output;
  }
  if (mark.type === "crescendo" || mark.type === "decrescendo") {
    const middle = (x1 + x2) / 2;
    const leftSpread = mark.type === "crescendo" ? 0 : 4;
    const rightSpread = mark.type === "crescendo" ? 4 : 0;
    return [
      `<path d="M ${formatNumber(x1)} ${formatNumber(top - leftSpread)} L ${formatNumber(middle)} ${formatNumber(top - 2)} L ${formatNumber(x2)} ${formatNumber(top - rightSpread)} M ${formatNumber(x1)} ${formatNumber(top + leftSpread)} L ${formatNumber(middle)} ${formatNumber(top + 2)} L ${formatNumber(x2)} ${formatNumber(top + rightSpread)}" fill="none" stroke="${INK}" stroke-width="1"></path>`,
    ];
  }
  const voltaTop = y - 36 - mark.level * 8;
  const right = mark.openEnd === true ? "" : ` L ${formatNumber(x2)} ${formatNumber(voltaTop + 8)}`;
  const output = [`<path d="M ${formatNumber(x1)} ${formatNumber(voltaTop + 8)} L ${formatNumber(x1)} ${formatNumber(voltaTop)} L ${formatNumber(x2)} ${formatNumber(voltaTop)}${right}" fill="none" stroke="${INK}" stroke-width="1"></path>`];
  if (mark.caption !== undefined) {
    output.push(text(mark.caption, x1 + 4, voltaTop - 1, {
      font: "Microsoft YaHei",
      size: 11,
    }));
  }
  return output;
}

function renderLyrics(
  layout: LineLayout,
  pageIndex: number,
  lineOrdinal: number,
  y: number,
  config: ResolvedPageConfig,
  musicToLyric: number,
  lyricToLyric: number,
): string[] {
  const output: string[] = [];
  const ordinals = itemOrdinals(layout.line);
  const notePositions = layout.line.elements.flatMap((element, index) => {
    if (element.kind !== "note") return [];
    const x = layout.xByElement.get(index);
    return x === undefined ? [] : [{ x, ordinal: ordinals.get(index) ?? 0 }];
  });
  layout.line.lyrics.forEach((lyric, lyricIndex) => {
    const lyricY = y + 25 + musicToLyric + lyricIndex * (config.lyricSize + lyricToLyric);
    if (lyric.annotation !== undefined) {
      output.push(text(lyric.annotation, (notePositions[0]?.x ?? config.marginLeft) - 10, lyricY, {
        font: config.lyricFont,
        size: config.lyricSize,
        anchor: "end",
        fill: "#101010",
        dy: 0.3355 * config.lyricSize,
      }));
    }
    notePositions.forEach((positioned, index) => {
      const syllable = lyric.syllables[index];
      if (syllable?.text === "") return;
      const value = syllable?.text ?? "";
      const width = syllable === undefined
        ? config.lyricSize
        : [...value].reduce(
            (sum, character) => sum + (/^[\x00-\x7f]$/.test(character) ? config.lyricSize * 0.55 : config.lyricSize),
            0,
          );
      output.push(text(value, positioned.x - width / 2, lyricY, {
        font: config.lyricFont,
        size: config.lyricSize,
        fill: "#101010",
        dy: 0.3355 * config.lyricSize,
        extra: { cipos: notePositionCode(pageIndex, lineOrdinal, positioned.ordinal) },
      }));
    });
  });
  return output;
}

function inlineElementStep(element: NoteElement | SustainElement): number {
  return element.kind === "note" && element.duration > 4
    ? UNDERLINED_NOTE_STEP
    : PLAIN_NOTE_STEP;
}

function renderInlineLayer(
  layer: InlineLayerElement,
  startX: number,
  y: number,
  config: ResolvedPageConfig,
  registry: GlyphRegistry,
): string[] {
  const output: string[] = [];
  let x = startX;
  layer.elements.forEach((element) => {
    if (element.kind === "note") {
      if (!element.hidden) {
        const id = layer.role === "accompaniment" && element.pitch !== 9
          ? `shuzi_${config.numberStyle}_bian_${element.pitch}`
          : element.pitch === 9 ? "shuzi_x" : `shuzi_${config.numberStyle}_${element.pitch}`;
        output.push(registry.use(id, x, y));
        output.push(...renderOrnaments(element.ornaments, x, y, registry));
      }
      x += inlineElementStep(element);
    } else if (element.kind === "sustain") {
      output.push(registry.use("yanyinfu", x, y));
      x += PLAIN_NOTE_STEP;
    } else if (element.kind === "barline") {
      if (element.type !== "hidden" && element.type !== "invisible") {
        output.push(registry.use(BARLINE_GLYPH_IDS[element.type], x, y));
      }
      x += BARLINE_GAP;
    }
  });
  return output;
}

function renderLine(
  layout: LineLayout,
  pageIndex: number,
  lineOrdinal: number,
  y: number,
  config: ResolvedPageConfig,
  registry: GlyphRegistry,
  musicToLyric: number,
  lyricToLyric: number,
): string[] {
  const output: string[] = [];
  const ordinals = itemOrdinals(layout.line);
  layout.elements.forEach((positioned) => {
    if (positioned.element.kind === "barline") return;
    const ordinal = ordinals.get(positioned.elementIndex) ?? 0;
    const notepos = notePositionCode(pageIndex, lineOrdinal, ordinal);
    if (positioned.element.kind === "note") {
      const tuplet = layout.line.marks.find((mark) =>
        mark.type === "tuplet" &&
        positioned.elementIndex >= mark.start && positioned.elementIndex <= mark.end
      );
      const count = Number(tuplet?.caption);
      const normalCount = Number.isFinite(count) && count >= 3
        ? 2 ** Math.floor(Math.log2(count - 1))
        : count;
      const timeOverride = tuplet === undefined || !Number.isFinite(normalCount)
        ? undefined
        : Number((durationTime(positioned.element) * normalCount / count).toFixed(2));
      const tie = layout.line.marks.find((mark) =>
        mark.type === "slur" && mark.end === positioned.elementIndex
      );
      const tieStart = tie === undefined ? undefined : layout.line.elements[tie.start];
      const audioOverride = tieStart?.kind === "sustain" || (
        tieStart?.kind === "note" &&
        tieStart.pitch === positioned.element.pitch &&
        tieStart.octave === positioned.element.octave
      ) ? "0" : undefined;
      output.push(...renderNote(
        positioned.element,
        positioned.x,
        y,
        notepos,
        config,
        registry,
        timeOverride,
        audioOverride,
      ));
    } else {
      output.push(...renderSustain(positioned.element, positioned.x, y, notepos, registry));
    }
  });

  const syntheticOrdinal = Math.max(0, ...ordinals.values()) + 1;
  layout.barlines.forEach((barline) => {
    const ordinal = barline.elementIndex === undefined
      ? syntheticOrdinal
      : ordinals.get(barline.elementIndex) ?? syntheticOrdinal;
    output.push(...renderBarline(
      barline.element,
      barline.synthetic,
      barline.x,
      y,
      notePositionCode(pageIndex, lineOrdinal, ordinal),
      registry,
    ));
  });
  output.push(...renderUnderlines(layout, y));
  layout.line.marks.forEach((mark) => output.push(...renderMark(mark, layout, y, config, registry)));
  output.push(...renderLyrics(layout, pageIndex, lineOrdinal, y, config, musicToLyric, lyricToLyric));
  layout.inlineLayers.forEach(({ element, x }) => {
    output.push(...renderInlineLayer(element, x, y - 38, config, registry));
  });
  return output;
}

function rowAdvance(
  line: ScoreLine,
  config: ResolvedPageConfig,
  spacing: ReturnType<typeof pageSpacing>,
): number {
  const lyricHeight = line.lyrics.length === 0
    ? 0
    : spacing.musicToLyric +
      line.lyrics.length * config.lyricSize +
      Math.max(0, line.lyrics.length * spacing.lyricToLyric - 10);
  return 35 + lyricHeight + spacing.lineGap;
}

function renderPage(
  page: ScorePage,
  metadata: Metadata,
  config: ResolvedPageConfig,
  customCode: string,
): string {
  const registry = new GlyphRegistry();
  const header = page.index === 0
    ? renderHeader(metadata, config, registry)
    : { markup: [], bodyY: config.marginTop + config.bodyMarginTop + 10 };
  const body: string[] = [...header.markup];
  const spacing = pageSpacing(config, page.index + 1);
  let y = header.bodyY;
  let lineOrdinal = 1;

  page.groups.forEach((group) => {
    const multiVoice = group.voices.length > 1;
    const captionWidth = Math.max(0, ...group.voices.map((voice) => [...voice.caption ?? ""].length * 19));
    const startX = config.marginLeft + (multiVoice ? 23 : 3) + captionWidth;
    const layout = layoutVoiceGroup(group, startX, config.width - config.marginRight + 3);
    const firstY = y;
    let lastY = y;
    layout.lines.forEach((lineLayout, index) => {
      const scoreLine = lineLayout.line;
      if (multiVoice) {
        body.push(text(scoreLine.caption ?? "", startX - 35, y, {
          font: config.lyricFont,
          size: config.lyricSize,
          anchor: "end",
          fill: "#101010",
          dy: 0.3355 * config.lyricSize,
        }));
      }
      body.push(...renderLine(
        lineLayout,
        page.index,
        lineOrdinal,
        y,
        config,
        registry,
        spacing.musicToLyric,
        spacing.lyricToLyric,
      ));
      lineOrdinal += 1;
      lastY = y;
      y += rowAdvance(scoreLine, config, spacing);
      if (index === layout.lines.length - 1) return;
    });
    if (multiVoice) {
      const braceX = startX;
      body.push(registry.use("shengbufu_shang", braceX, firstY));
      body.push(`<line x1="${formatNumber(braceX - 25.5)}" y1="${formatNumber(firstY - 6.5)}" x2="${formatNumber(braceX - 25.5)}" y2="${formatNumber(lastY + 6.5)}" stroke-width="4" stroke="${INK}" fill="none"></line>`);
      body.push(`<line x1="${formatNumber(braceX - 21)}" y1="${formatNumber(firstY - 8)}" x2="${formatNumber(braceX - 21)}" y2="${formatNumber(lastY + 8)}" stroke-width="2" stroke="${INK}" fill="none"></line>`);
      body.push(registry.use("shengbufu_xia", braceX, lastY));
    }
    if (multiVoice) y += spacing.voiceGap;
  });

  return `<svg width="${formatNumber(config.width)}" height="${formatNumber(config.height)}" version="1.1" viewBox="0 0 ${formatNumber(config.width)} ${formatNumber(config.height)}" encoding="UTF-8" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" height="100%" width="100%" fill="#ffffff"></rect>${registry.definitions()}\n${body.join("\n")}\n<g id="custom">${customCode}</g></svg>`;
}

function splitCustomCode(customCode: string | null | undefined): string[] {
  if (customCode === undefined || customCode === null || customCode === "") return [];
  return customCode.replaceAll("&hh&", "\n").split("[fenye]");
}

/** Render a Fanqie score using the legacy API's SVG-page response format. */
export function render(dsl: string, options: RenderOptions = {}): string {
  const document = parse(dsl);
  const diagnostics: Diagnostic[] = [...document.diagnostics];
  const config = resolvePageConfig(options.pageConfig, diagnostics);
  const customPages = splitCustomCode(options.customCode);
  options.onDiagnostics?.(diagnostics);
  const requestedPage = options.pageNum ?? -1;
  const pages = document.pages.map((page) =>
    requestedPage >= 0 && requestedPage !== page.index
      ? "noRedraw"
      : renderPage(page, document.metadata, config, customPages[page.index] ?? "")
  );
  return `${pages.join("[fenye]")}[fenye]`;
}
