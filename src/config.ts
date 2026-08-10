import type {
  Diagnostic,
  FontFamily,
  LegacyPageConfig,
  NumberStyle,
  PagePreset,
  SourceLocation,
} from "./types";

export const DEFAULT_PAGE_CONFIG: Readonly<LegacyPageConfig> = {
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

const PAGE_SIZES: Record<PagePreset, { width: number; height: number }> = {
  A4: { width: 1000, height: 1415 },
  A5: { width: 840, height: 1193 },
  A4_horizontal: { width: 1415, height: 1000 },
  A5_horizontal: { width: 1193, height: 840 },
};

export interface ResolvedPageConfig {
  page: PagePreset;
  width: number;
  height: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  titleFont: FontFamily;
  lyricFont: FontFamily;
  numberStyle: NumberStyle;
  titleSize: number;
  subtitleSize: number;
  lyricSize: number;
  bodyMarginTop: number;
  musicToLyric: number;
  lyricToLyric: number;
  lineGap: number;
  voiceGap: number;
  slurStyle: "auto" | "arc" | "flat";
  heights?: LegacyPageConfig["heights"];
}

const CONFIG_LOCATION: SourceLocation = { line: 1, column: 1, offset: 0, length: 0 };

function diagnostic(message: string): Diagnostic {
  return {
    severity: "warning",
    code: "invalid-page-config",
    message,
    source: CONFIG_LOCATION,
  };
}

function finiteNumber(value: unknown, fallback: string | number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number(fallback);
}

function parseInput(
  input: string | Partial<LegacyPageConfig> | null | undefined,
  diagnostics: Diagnostic[],
): Partial<LegacyPageConfig> {
  if (input === undefined || input === null || input === "") return {};
  if (typeof input !== "string") return input;
  try {
    const parsed: unknown = JSON.parse(input);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Partial<LegacyPageConfig>;
    }
    diagnostics.push(diagnostic("pageConfig JSON must contain an object."));
  } catch {
    diagnostics.push(diagnostic("pageConfig is not valid JSON."));
  }
  return {};
}

export function resolvePageConfig(
  input: string | Partial<LegacyPageConfig> | null | undefined,
  diagnostics: Diagnostic[],
): ResolvedPageConfig {
  const parsed = parseInput(input, diagnostics);
  const raw = { ...DEFAULT_PAGE_CONFIG, ...parsed };
  const page = raw.page in PAGE_SIZES ? raw.page : DEFAULT_PAGE_CONFIG.page;
  if (page !== raw.page) diagnostics.push(diagnostic(`Unknown page preset '${String(raw.page)}'.`));
  const size = PAGE_SIZES[page];
  const slurIndex = Number(raw.lianyinxian_type);
  const resolved: ResolvedPageConfig = {
    page,
    width: size.width,
    height: size.height,
    marginTop: finiteNumber(raw.margin_top, DEFAULT_PAGE_CONFIG.margin_top),
    marginBottom: finiteNumber(raw.margin_bottom, DEFAULT_PAGE_CONFIG.margin_bottom),
    marginLeft: finiteNumber(raw.margin_left, DEFAULT_PAGE_CONFIG.margin_left),
    marginRight: finiteNumber(raw.margin_right, DEFAULT_PAGE_CONFIG.margin_right),
    titleFont: raw.biaoti_font,
    lyricFont: raw.geci_font,
    numberStyle: raw.shuzi_font,
    titleSize: finiteNumber(raw.biaoti_size, DEFAULT_PAGE_CONFIG.biaoti_size),
    subtitleSize: finiteNumber(raw.fubiaoti_size, DEFAULT_PAGE_CONFIG.fubiaoti_size),
    lyricSize: finiteNumber(raw.geci_size, DEFAULT_PAGE_CONFIG.geci_size),
    bodyMarginTop: finiteNumber(raw.body_margin_top, DEFAULT_PAGE_CONFIG.body_margin_top),
    musicToLyric: finiteNumber(raw.height_quci, DEFAULT_PAGE_CONFIG.height_quci),
    lyricToLyric: finiteNumber(raw.height_cici, DEFAULT_PAGE_CONFIG.height_cici),
    lineGap: finiteNumber(raw.height_ciqu, DEFAULT_PAGE_CONFIG.height_ciqu),
    voiceGap: finiteNumber(raw.height_shengbu, DEFAULT_PAGE_CONFIG.height_shengbu),
    slurStyle: (["auto", "arc", "flat"] as const)[slurIndex] ?? "auto",
  };
  if (raw.heights !== undefined) resolved.heights = raw.heights;
  return resolved;
}

export function pageSpacing(
  config: ResolvedPageConfig,
  pageNumber: number,
): Pick<ResolvedPageConfig, "musicToLyric" | "lyricToLyric" | "lineGap" | "voiceGap"> {
  const values = config.heights?.[`a${pageNumber}`];
  if (values === undefined) {
    return {
      musicToLyric: config.musicToLyric,
      lyricToLyric: config.lyricToLyric,
      lineGap: config.lineGap,
      voiceGap: config.voiceGap,
    };
  }
  return {
    musicToLyric: finiteNumber(values[1], config.musicToLyric),
    lyricToLyric: finiteNumber(values[2], config.lyricToLyric),
    lineGap: finiteNumber(values[3], config.lineGap),
    voiceGap: finiteNumber(values[4], config.voiceGap),
  };
}

