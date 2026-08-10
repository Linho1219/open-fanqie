import { describe, expect, it } from "vitest";

import { render } from "../src";

function uses(svg: string, line: number): Array<{ x: number; code: string }> {
  const expression = new RegExp(
    `<use x="([^"]+)"[^>]+notepos="0_${line}_[^"]+"[^>]+code="([^"]+)"[^>]*>`,
    "g",
  );
  return [...svg.matchAll(expression)].map((match) => ({
    x: Number(match[1]),
    code: match[2] ?? "",
  }));
}

describe("render", () => {
  it("matches the observed legacy spacing constants", () => {
    const svg = render(`
Q: 1 2 3 4 |
Q: 1/ 2/ 3/ 4/ |
Q: 1// 2// 3// 4// |
`);

    expect(uses(svg, 1)).toEqual([
      { x: 83, code: "1" },
      { x: 120.5, code: "2" },
      { x: 158, code: "3" },
      { x: 195.5, code: "4" },
      { x: 230.5, code: "|" },
    ]);
    expect(uses(svg, 2)).toEqual([
      { x: 83, code: "1/" },
      { x: 108, code: "2/" },
      { x: 145.5, code: "3/" },
      { x: 170.5, code: "4/" },
      { x: 205.5, code: "|" },
    ]);
    expect(uses(svg, 3)).toEqual([
      { x: 83, code: "1//" },
      { x: 108, code: "2//" },
      { x: 133, code: "3//" },
      { x: 158, code: "4//" },
      { x: 193, code: "|" },
    ]);
  });

  it("aligns voices at beat starts without distributing notes within a beat", () => {
    const svg = render(`
Q1: 1// 2// 3// 4// |
Q2: 1/ 2/ |
`);

    expect(uses(svg, 1)).toEqual([
      { x: 103, code: "1//" },
      { x: 128, code: "2//" },
      { x: 153, code: "3//" },
      { x: 178, code: "4//" },
      { x: 213, code: "|" },
    ]);
    expect(uses(svg, 2)).toEqual([
      { x: 103, code: "1/" },
      { x: 128, code: "2/" },
      { x: 213, code: "|" },
    ]);
  });

  it("emits only requested glyph definitions and merges beam lines", () => {
    const svg = render(`Q: 1// 1// 1// 1// |`);

    expect(svg).toContain('<g id="shuzi_b_1"');
    expect(svg).not.toContain('<g id="shuzi_b_2"');
    expect(svg).not.toContain('<g id="xunhuan_zuo"');
    expect(svg.match(/data-type="jianshixian"/g)).toHaveLength(2);
    expect(svg).toContain('x1="77"');
    expect(svg).toContain('x2="164"');
  });

  it("renders score symbols from path-based API glyphs", () => {
    const svg = render(`Q: 1&zkh 2&hx 3&shy 4&cy |&fine`);
    const defs = svg.match(/<defs>([\s\S]*?)<\/defs>/)?.[1] ?? "";

    expect(defs).toContain('<g id="kuohu_zuo"');
    expect(defs).toContain('<g id="huxifu"');
    expect(defs).toContain('<g id="huayin_shang"');
    expect(defs).toContain('<g id="changyinfu1"');
    expect(defs).toContain('<g id="xiaojiexian_fine"');
    expect(defs).toContain("<path");
    expect(defs).not.toContain("<text");
  });

  it("supports legacy page config, pagination, partial redraws, and custom SVG", () => {
    const custom = '<defs><g id="custom_x"></g></defs><use xlink:href="#custom_x"></use>[fenye]';
    const output = render(`Q: 1\n[fenye]\nQ: 2`, {
      pageConfig: JSON.stringify({ page: "A5", margin_left: "100" }),
      customCode: custom,
      pageNum: 0,
    });

    expect(output).toMatch(/^<svg width="840" height="1193"/);
    expect(output).toContain('x="103"');
    expect(output).toContain('<g id="custom"><defs><g id="custom_x">');
    expect(output.endsWith("[fenye]noRedraw[fenye]")).toBe(true);
  });

  it("renders metadata and lyric text with XML escaping", () => {
    const output = render(`B: A & B\nZ: <作者>\nD: C\nP: 4/4\nQ: 1 2\nC: 你~好 世界`);

    expect(output).toContain("A &amp; B");
    expect(output).toContain("&lt;作者&gt;");
    expect(output).toContain(">你好</text>");
    expect(output).toContain(">世</text>");
  });
});
