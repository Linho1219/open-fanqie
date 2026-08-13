export { parse } from './parser'
export { render, renderSvgPages } from './renderer'
export { DEFAULT_PAGE_CONFIG } from './config'
export type {
  Accidental,
  BarlineElement,
  BarlineType,
  BeatBoundaryElement,
  Diagnostic,
  InlineLayerElement,
  LegacyPageConfig,
  LyricLine,
  LyricSyllable,
  Mark,
  Metadata,
  Meter,
  MusicElement,
  NoteElement,
  NumberStyle,
  Ornament,
  PagePreset,
  RenderOptions,
  ScoreDocument,
  ScoreLine,
  ScorePage,
  SourceLocation,
  SustainElement,
  SvgRenderOptions,
  VoiceGroup,
} from './types'

export const VERSION = '0.1.0'
