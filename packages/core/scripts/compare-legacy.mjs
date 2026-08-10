import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { render } from "../dist/open-fanqie-core.js";

const ENDPOINT = "http://zhipu.lezhi99.com/Zhipu-draw";
const FIXTURE = resolve("tests/fixtures/test.jps");

const defaultConfig = {
  page: "A4",
  margin_top: "80",
  margin_bottom: "80",
  margin_left: "80",
  margin_right: "80",
  biaoti_font: "Microsoft YaHei",
  shuzi_font: "b",
  geci_font: "Microsoft YaHei",
  height_quci: "13",
  height_cici: "10",
  height_ciqu: "40",
  height_shengbu: "0",
  biaoti_size: "36",
  fubiaoti_size: "20",
  geci_size: "18",
  body_margin_top: "40",
  lianyinxian_type: "0",
};

const cases = [
  ["default", {}],
  ...["A4", "A5", "A4_horizontal", "A5_horizontal"].map((page) => [`page:${page}`, { page }]),
  ["margin:top", { margin_top: "47" }],
  ["margin:bottom", { margin_bottom: "47" }],
  ["margin:left", { margin_left: "47" }],
  ["margin:right", { margin_right: "47" }],
  ["spacing:body", { body_margin_top: "27" }],
  ["spacing:music-lyric", { height_quci: "27" }],
  ["spacing:lyric-lyric", { height_cici: "27" }],
  ["spacing:line", { height_ciqu: "27" }],
  ["spacing:voice", { height_shengbu: "27" }],
  ...["a", "b", "c"].map((shuzi_font) => [`number:${shuzi_font}`, { shuzi_font }]),
  ...["Microsoft YaHei", "SimSun", "SimHei", "KaiTi"].map((biaoti_font) => [
    `title-font:${biaoti_font}`,
    { biaoti_font },
  ]),
  ...["Microsoft YaHei", "SimSun", "SimHei", "KaiTi"].map((geci_font) => [
    `lyric-font:${geci_font}`,
    { geci_font },
  ]),
  ...[24, 28, 32, 36, 42].map((biaoti_size) => [`title-size:${biaoti_size}`, { biaoti_size: String(biaoti_size) }]),
  ...[16, 18, 22, 24, 28].map((fubiaoti_size) => [`subtitle-size:${fubiaoti_size}`, { fubiaoti_size: String(fubiaoti_size) }]),
  ...[14, 16, 18, 20, 22, 24, 26, 28, 30, 32].map((geci_size) => [`lyric-size:${geci_size}`, { geci_size: String(geci_size) }]),
  ...["0", "1", "2"].map((lianyinxian_type) => [`slur:${lianyinxian_type}`, { lianyinxian_type }]),
  ["page-spacing", { heights: { a2: [2, "21", "22", "23", "24"] } }],
];

function splitPages(output) {
  return output.split("[fenye]").filter((page) => page !== "" && page !== "noRedraw");
}

function attributes(source) {
  return Object.fromEntries([...source.matchAll(/([:\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
}

function inspectPage(svg) {
  const root = attributes(svg.match(/^<svg\b([^>]*)>/)?.[1] ?? "");
  const defsSource = svg.match(/<defs>([\s\S]*?)<\/defs>/)?.[1] ?? "";
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/, "");
  const defs = [...defsSource.matchAll(/<g id="([^"]+)"/g)].map((match) => match[1]);
  const uses = [...body.matchAll(/<use\b([^>]*)>/g)].map((match) => attributes(match[1]));
  const texts = [...body.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)].map((match) => ({
    ...attributes(match[1]),
    text: match[2],
  }));
  const lines = [...body.matchAll(/<line\b([^>]*)>/g)].map((match) => attributes(match[1]));
  const paths = [...body.matchAll(/<path\b([^>]*)>/g)].map((match) => attributes(match[1]));
  return { root, defs, uses, texts, lines, paths };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function firstDifference(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (stable(left[index]) !== stable(right[index])) return { index, api: left[index], local: right[index] };
  }
  return undefined;
}

function comparableAttributes(item) {
  return Object.fromEntries(Object.entries(item).map(([key, rawValue]) => {
    let value = String(rawValue)
      .replaceAll("&amp;", "&")
      .replaceAll("&quot;", '"')
      .replaceAll("&apos;", "'")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">");
    if (key === "code") value = value.replaceAll(/\s/g, "");
    if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
      value = Number(value).toFixed(8);
    } else if (key === "d") {
      value = value.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi, (number) =>
        Number(number).toFixed(8));
    }
    return [key, value];
  }));
}

function firstUnorderedAttributeDifference(left, right) {
  const sorted = (items) => items.map((item) => ({ item, comparable: comparableAttributes(item) }))
    .sort((a, b) => stable(a.comparable).localeCompare(stable(b.comparable), undefined, { numeric: true }));
  const expected = sorted(left);
  const actual = sorted(right);
  const length = Math.max(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    if (stable(expected[index]?.comparable) !== stable(actual[index]?.comparable)) {
      return { index, api: expected[index]?.item, local: actual[index]?.item };
    }
  }
  return undefined;
}

function unorderedAttributeMismatches(expected, actual, limit = 12) {
  const subtract = (left, right) => {
    const available = new Map();
    right.forEach((item) => {
      const key = stable(comparableAttributes(item));
      available.set(key, (available.get(key) ?? 0) + 1);
    });
    return left.flatMap((item) => {
      const key = stable(comparableAttributes(item));
      const count = available.get(key) ?? 0;
      if (count > 0) {
        available.set(key, count - 1);
        return [];
      }
      return [item];
    }).slice(0, limit);
  };
  return { missing: subtract(expected, actual), extra: subtract(actual, expected) };
}

function useMismatchContexts(mismatches, uses) {
  const notes = uses.filter((item) => item.notepos !== undefined && /#shuzi_/.test(item["xlink:href"] ?? ""));
  return mismatches.map((item) => ({
    item,
    nearest: [...notes].sort((left, right) =>
      Math.abs(Number(left.x) - Number(item.x)) + Math.abs(Number(left.y) - Number(item.y)) -
      Math.abs(Number(right.x) - Number(item.x)) - Math.abs(Number(right.y) - Number(item.y))
    )[0],
  }));
}

function firstPositionedUseDifference(left, right) {
  const byPosition = (items) => items.filter((item) => item.notepos !== undefined)
    .sort((a, b) => a.notepos.localeCompare(b.notepos, undefined, { numeric: true }));
  const api = byPosition(left);
  const local = byPosition(right);
  const decode = (value) => String(value ?? "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
  const length = Math.max(api.length, local.length);
  for (let index = 0; index < length; index += 1) {
    const expected = api[index];
    const actual = local[index];
    const keys = new Set([...Object.keys(expected ?? {}), ...Object.keys(actual ?? {})]);
    const equal = [...keys].every((key) => {
      if (key === "x" || key === "y") {
        return Math.abs(Number(expected?.[key]) - Number(actual?.[key])) <= 1e-8;
      }
      const expectedValue = decode(expected?.[key]);
      const actualValue = decode(actual?.[key]);
      return key === "code"
        ? expectedValue.replaceAll(/\s/g, "") === actualValue.replaceAll(/\s/g, "")
        : expectedValue === actualValue;
    });
    if (!equal) return { index, api: expected, local: actual };
  }
  return undefined;
}

function firstPositionedCoordinateDifference(left, right) {
  const byPosition = (items) => items.filter((item) => item.notepos !== undefined)
    .sort((a, b) => a.notepos.localeCompare(b.notepos, undefined, { numeric: true }));
  const api = byPosition(left);
  const local = byPosition(right);
  const length = Math.max(api.length, local.length);
  for (let index = 0; index < length; index += 1) {
    const expected = api[index];
    const actual = local[index];
    if (expected === undefined || actual === undefined || expected.notepos !== actual.notepos ||
      Math.abs(Number(expected.x) - Number(actual.x)) > 1e-8 ||
      Math.abs(Number(expected.y) - Number(actual.y)) > 1e-8) {
      return { index, api: expected, local: actual };
    }
  }
  return undefined;
}

function unique(items) {
  return [...new Map(items.map((item) => [stable(item), item])).values()];
}

function missingSignatures(expected, actual, signature) {
  const available = new Map();
  actual.forEach((item) => {
    const key = signature(item);
    available.set(key, (available.get(key) ?? 0) + 1);
  });
  return expected.flatMap((item) => {
    const key = signature(item);
    const count = available.get(key) ?? 0;
    if (count > 0) {
      available.set(key, count - 1);
      return [];
    }
    return [key];
  });
}

function lineCategories(lines) {
  const counts = {};
  lines.forEach((line) => {
    const category = line["data-type"] ??
      (line["stroke-width"] === "4" && line.x1 === line.x2 ? "voice-brace" : "other");
    counts[category] = (counts[category] ?? 0) + 1;
  });
  return counts;
}

function lineDetails(lines) {
  const beamsByY = {};
  lines.filter((line) => line["data-type"] === "jianshixian").forEach((line) => {
    beamsByY[line.y1] = (beamsByY[line.y1] ?? 0) + 1;
  });
  return {
    beamsByY,
    other: lines.filter((line) => line["data-type"] === undefined && !(
      line["stroke-width"] === "4" && line.x1 === line.x2
    )),
  };
}

function beamMismatches(apiLines, localLines) {
  const beamYs = new Set([
    ...apiLines.filter((line) => line["data-type"] === "jianshixian").map((line) => line.y1),
    ...localLines.filter((line) => line["data-type"] === "jianshixian").map((line) => line.y1),
  ]);
  return [...beamYs].flatMap((y) => {
    const api = apiLines.filter((line) => line["data-type"] === "jianshixian" && line.y1 === y);
    const local = localLines.filter((line) => line["data-type"] === "jianshixian" && line.y1 === y);
    return api.length === local.length ? [] : [{ y, api, local }];
  });
}

function firstLinePositions(uses) {
  const positioned = uses.filter((item) => /^\d+_1_\d+$/.test(item.notepos ?? ""))
    .sort((left, right) => Number((left.notepos ?? "").split("_")[2]) - Number((right.notepos ?? "").split("_")[2]));
  const concise = positioned.map(({ x, code, notepos }) => ({ x, code, notepos }));
  return [...concise.slice(0, 8), ...concise.slice(-3)];
}

function curveUses(uses) {
  return uses.filter((item) => /#(?:lianyinxian_|lianyin_shuzi_)/.test(item["xlink:href"] ?? ""));
}

function comparePage(apiSvg, localSvg) {
  const api = inspectPage(apiSvg);
  const local = inspectPage(localSvg);
  const apiUses = unique(api.uses);
  const localUses = unique(local.uses);
  const apiLines = unique(api.lines);
  const localLines = unique(local.lines);
  const apiPaths = unique(api.paths);
  const localPaths = unique(local.paths);
  const useAttributeMismatches = unorderedAttributeMismatches(apiUses, localUses);
  const hrefs = [...new Set([...apiUses, ...localUses].map((item) => item["xlink:href"] ?? ""))]
    .map((href) => ({
      href,
      api: apiUses.filter((item) => item["xlink:href"] === href).length,
      local: localUses.filter((item) => item["xlink:href"] === href).length,
    }))
    .filter(({ api: apiCount, local: localCount }) => apiCount !== localCount);
  return {
    root: stable(api.root) === stable(local.root),
    firstLinePositions: [firstLinePositions(apiUses), firstLinePositions(localUses)],
    curveUses: [curveUses(apiUses), curveUses(localUses)],
    defs: {
      missing: api.defs.filter((id) => !local.defs.includes(id)),
      extra: local.defs.filter((id) => !api.defs.includes(id)),
    },
    uses: {
      api: apiUses.length,
      local: localUses.length,
      raw: [api.uses.length, local.uses.length],
      first: firstPositionedUseDifference(apiUses, localUses),
      firstCoordinate: firstPositionedCoordinateDifference(apiUses, localUses),
      firstUnordered: firstUnorderedAttributeDifference(apiUses, localUses),
      attributeMismatches: useAttributeMismatches,
      mismatchContexts: {
        missing: useMismatchContexts(useAttributeMismatches.missing, apiUses),
        extra: useMismatchContexts(useAttributeMismatches.extra, localUses),
      },
      missing: missingSignatures(apiUses, localUses, (item) => `${item.notepos ?? ""}|${item["xlink:href"] ?? ""}|${item.code ?? ""}`).slice(0, 12),
      hrefs,
    },
    texts: {
      api: api.texts.length,
      local: local.texts.length,
      first: firstUnorderedAttributeDifference(api.texts, local.texts),
      attributeMismatches: unorderedAttributeMismatches(api.texts, local.texts),
      missing: missingSignatures(api.texts, local.texts, (item) => `${item.cipos ?? ""}|${item.text}`).slice(0, 20),
    },
    lines: {
      api: apiLines.length,
      local: localLines.length,
      raw: [api.lines.length, local.lines.length],
      categories: [lineCategories(apiLines), lineCategories(localLines)],
      details: [lineDetails(apiLines), lineDetails(localLines)],
      beamMismatches: beamMismatches(apiLines, localLines),
      first: firstUnorderedAttributeDifference(apiLines, localLines),
      attributeMismatches: unorderedAttributeMismatches(apiLines, localLines),
    },
    paths: {
      api: apiPaths.length,
      local: localPaths.length,
      raw: [api.paths.length, local.paths.length],
      first: firstUnorderedAttributeDifference(apiPaths, localPaths),
      attributeMismatches: unorderedAttributeMismatches(apiPaths, localPaths),
    },
  };
}

async function legacyRender(code, config) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({
      code,
      customCode: "",
      pageConfig: JSON.stringify(config),
      pageNum: "-1",
    }),
  });
  if (!response.ok) throw new Error(`Legacy API returned HTTP ${response.status}`);
  return response.text();
}

const code = await readFile(FIXTURE, "utf8");
const caseArgument = process.argv.find((argument) => argument.startsWith("--case="));
const caseName = caseArgument?.slice("--case=".length);
const selected = caseName !== undefined
  ? cases.filter(([name]) => name === caseName)
  : process.argv.includes("--all") ? cases : cases.slice(0, 1);
if (selected.length === 0) throw new Error(`Unknown comparison case: ${caseName}`);

async function compareCase(name, overrides) {
  const config = { ...defaultConfig, ...overrides };
  const [apiOutput, localOutput] = await Promise.all([
    legacyRender(code, config),
    Promise.resolve(render(code, { pageConfig: config })),
  ]);
  const apiPages = splitPages(apiOutput);
  const localPages = splitPages(localOutput);
  return {
    case: name,
    pageCount: { api: apiPages.length, local: localPages.length },
    pages: apiPages.map((page, index) => comparePage(page, localPages[index] ?? "")),
  };
}

const reports = new Array(selected.length);
let nextCase = 0;
async function worker() {
  while (nextCase < selected.length) {
    const index = nextCase;
    nextCase += 1;
    const [name, overrides] = selected[index];
    reports[index] = await compareCase(name, overrides);
  }
}
await Promise.all(Array.from({ length: Math.min(4, selected.length) }, () => worker()));

if (process.argv.includes("--summary")) {
  console.log(JSON.stringify(reports.map((report) => ({
    case: report.case,
    failedPages: report.pages.flatMap((page, index) => {
      const countsMatch = page.uses.api === page.uses.local &&
        page.texts.api === page.texts.local &&
        page.lines.api === page.lines.local &&
        page.paths.api === page.paths.local;
      const matches = page.root && page.defs.missing.length === 0 && page.defs.extra.length === 0 &&
        countsMatch && page.uses.first === undefined && page.uses.firstCoordinate === undefined &&
        page.uses.firstUnordered === undefined && page.texts.first === undefined &&
        page.lines.first === undefined && page.paths.first === undefined;
      return matches ? [] : [index];
    }),
  }))));
} else for (const report of reports) {
  if (process.argv.includes("--compact")) {
    console.log(JSON.stringify({
      case: report.case,
      pageCount: report.pageCount,
      pages: report.pages.map((page) => ({
        root: page.root,
        defs: { missing: page.defs.missing, extra: page.defs.extra },
        counts: {
          uses: [page.uses.api, page.uses.local],
          texts: [page.texts.api, page.texts.local],
          lines: [page.lines.api, page.lines.local],
          paths: [page.paths.api, page.paths.local],
        },
        firstUse: page.uses.first,
        firstCoordinateUse: page.uses.firstCoordinate,
        firstUnorderedUse: page.uses.firstUnordered,
        firstText: page.texts.first,
        firstLine: page.lines.first,
        firstPath: page.paths.first,
        hrefs: page.uses.hrefs,
        ...(process.argv.includes("--attributes") ? {
          attributeMismatches: {
            uses: page.uses.attributeMismatches,
            useContexts: page.uses.mismatchContexts,
            texts: page.texts.attributeMismatches,
            lines: page.lines.attributeMismatches,
            paths: page.paths.attributeMismatches,
          },
        } : {}),
        ...(process.argv.includes("--debug") ? {
          rawCounts: {
            uses: page.uses.raw,
            lines: page.lines.raw,
            paths: page.paths.raw,
          },
          firstLinePositions: page.firstLinePositions,
          curveUses: page.curveUses,
          lineCategories: page.lines.categories,
          lineDetails: page.lines.details,
          beamMismatches: page.lines.beamMismatches,
        } : {}),
      })),
    }));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}
