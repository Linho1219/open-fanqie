export interface SourceLocation {
  line: number
  column: number
  offset: number
  length: number
}

export type DiagnosticSeverity = 'warning' | 'error'

export interface Diagnostic {
  severity: DiagnosticSeverity
  code: string
  message: string
  source: SourceLocation
}

export interface Meter {
  numerator: number
  denominator: number
  parenthesized: boolean
}

export type Tempo = number | string

export interface Metadata {
  version?: string
  titles: string[]
  authors: string[]
  mode?: string
  meters: Meter[]
  tempos: Tempo[]
}

export type Accidental = 'sharp' | 'flat' | 'natural'

export interface Ornament {
  name: string
  level: number
}

export interface NoteElement {
  kind: 'note'
  pitch: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 9
  sound: 'note' | 'rest' | 'rhythm'
  hidden: boolean
  octave: number
  duration: number
  dots: number
  accidental?: Accidental
  ornaments: Ornament[]
  graceBefore?: NoteElement[]
  graceAfter?: NoteElement[]
  annotation?: string
  code: string
  source: SourceLocation
}

export interface SustainElement {
  kind: 'sustain'
  duration: 4
  ornaments: Ornament[]
  code: string
  source: SourceLocation
}

export type BarlineType =
  | 'normal'
  | 'end'
  | 'double'
  | 'repeat-start'
  | 'repeat-end'
  | 'repeat-both'
  | 'hidden'
  | 'invisible'

export interface BarlineElement {
  kind: 'barline'
  type: BarlineType
  ornaments: Ornament[]
  temporaryMeter?: Meter
  annotation?: string
  code: string
  source: SourceLocation
}

export interface BeatBoundaryElement {
  kind: 'beat-boundary'
  behavior: 'join' | 'split'
  code: '~' | '^'
  source: SourceLocation
}

export interface InlineLayerElement {
  kind: 'inline-layer'
  role: 'accompaniment' | 'voice'
  elements: MusicElement[]
  marks: Mark[]
  code: string
  source: SourceLocation
}

export type MusicElement =
  NoteElement | SustainElement | BarlineElement | BeatBoundaryElement | InlineLayerElement

export type MarkType = 'slur' | 'tuplet' | 'crescendo' | 'decrescendo' | 'volta'

export interface Mark {
  type: MarkType
  start: number
  end: number
  level: number
  caption?: string
  openEnd?: boolean
  source: SourceLocation
}

export interface LyricSyllable {
  text: string
  source: SourceLocation
}

export interface LyricLine {
  annotation?: string
  syllables: LyricSyllable[]
  source: SourceLocation
}

export interface ScoreLine {
  voice: number
  caption?: string
  elements: MusicElement[]
  marks: Mark[]
  lyrics: LyricLine[]
  raw: string
  source: SourceLocation
}

export interface VoiceGroup {
  index: number
  voices: ScoreLine[]
}

export interface ScorePage {
  index: number
  groups: VoiceGroup[]
}

export interface ScoreDocument {
  source: string
  metadata: Metadata
  pages: ScorePage[]
  diagnostics: Diagnostic[]
}

export type PagePreset = 'A4' | 'A5' | 'A4_horizontal' | 'A5_horizontal'
export type FontFamily = 'Microsoft YaHei' | 'SimSun' | 'SimHei' | 'KaiTi'
export type NumberStyle = 'a' | 'b' | 'c'

export interface LegacyPageConfig {
  page: PagePreset
  margin_top: string | number
  margin_bottom: string | number
  margin_left: string | number
  margin_right: string | number
  biaoti_font: FontFamily
  shuzi_font: NumberStyle
  geci_font: FontFamily
  height_quci: string | number
  height_cici: string | number
  height_ciqu: string | number
  height_shengbu: string | number
  biaoti_size: string | number
  fubiaoti_size: string | number
  geci_size: string | number
  body_margin_top: string | number
  lianyinxian_type: '0' | '1' | '2' | 0 | 1 | 2
  heights?: Record<
    string,
    [string | number, string | number, string | number, string | number, string | number]
  >
}

export interface RenderOptions {
  pageConfig?: string | Partial<LegacyPageConfig> | null
  customCode?: string | null
  pageNum?: number
  onDiagnostics?: (diagnostics: readonly Diagnostic[]) => void
}
