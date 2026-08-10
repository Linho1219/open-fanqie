import { describe, expect, it } from "vitest";

import { parse } from "../src";

describe("parse", () => {
  it("parses headers, pages, voice groups, and lyrics", () => {
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
`);

    expect(document.metadata).toMatchObject({
      version: "1.0",
      titles: ["主标题", "副标题"],
      authors: ["甲"],
      mode: "F#",
      meters: [
        { numerator: 6, denominator: 8, parenthesized: false },
        { numerator: 2, denominator: 4, parenthesized: true },
      ],
      tempos: [96],
    });
    expect(document.pages).toHaveLength(2);
    expect(document.pages[0]?.groups[0]?.voices.map((voice) => voice.voice)).toEqual([1, 2]);
    expect(document.pages[0]?.groups[0]?.voices[0]?.caption).toBe("主旋律");
    expect(document.pages[0]?.groups[0]?.voices[0]?.lyrics[0]?.syllables.map(({ text }) => text)).toEqual([
      "春天",
      "hello",
      "world",
    ]);
    expect(document.diagnostics).toEqual([]);
  });

  it("parses notes, barlines, commands, and source code", () => {
    const document = parse(`Q: 1'#//..&yc 8 9, 0 2$ 3= - |: :| :|: || ||/ |/ |*`);
    const elements = document.pages[0]?.groups[0]?.voices[0]?.elements ?? [];
    const first = elements[0];

    expect(first).toMatchObject({
      kind: "note",
      pitch: 1,
      octave: 1,
      duration: 16,
      dots: 2,
      accidental: "sharp",
      ornaments: [{ name: "yc", level: 0 }],
      code: "1'#//..&yc",
    });
    expect(elements[1]).toMatchObject({ kind: "note", hidden: true });
    expect(elements[2]).toMatchObject({ kind: "note", pitch: 9, sound: "rhythm", octave: -1 });
    expect(elements.flatMap((element) => element.kind === "barline" ? [element.type] : [])).toEqual([
      "repeat-start",
      "repeat-end",
      "repeat-both",
      "end",
      "double",
      "hidden",
      "invisible",
    ]);
    expect(document.diagnostics).toEqual([]);
  });

  it("parses grace notes, marks, custom beat cuts, and inline voices", () => {
    const document = parse(`Q: |["1" (1[2/]< 2[h3]!) |] ~ ^ {bz 5/ 6/} {dsb 1 2}`);
    const line = document.pages[0]?.groups[0]?.voices[0];
    const notes = line?.elements.filter(({ kind }) => kind === "note") ?? [];
    const layers = line?.elements.filter(({ kind }) => kind === "inline-layer") ?? [];

    expect(notes[0]).toMatchObject({
      kind: "note",
      graceBefore: [{ pitch: 2, duration: 16 }],
    });
    expect(notes[1]).toMatchObject({
      kind: "note",
      graceAfter: [{ pitch: 3, duration: 8 }],
    });
    expect(line?.marks.map(({ type }) => type).sort()).toEqual([
      "crescendo",
      "slur",
      "volta",
    ]);
    expect(line?.elements.flatMap((element) => element.kind === "beat-boundary" ? [element.behavior] : [])).toEqual([
      "join",
      "split",
    ]);
    expect(layers).toMatchObject([
      { role: "accompaniment" },
      { role: "voice" },
    ]);
    expect(document.diagnostics).toEqual([]);
  });

  it("reports malformed input without throwing", () => {
    const document = parse(`hello\nD: h\nQ: 1&unknown (2`);

    expect(document.diagnostics.map(({ code }) => code)).toEqual([
      "missing-prefix",
      "invalid-mode",
      "unknown-command",
      "unclosed-mark",
    ]);
  });
});
