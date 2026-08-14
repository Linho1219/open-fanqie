import type {
  BarlineElement,
  InlineLayerElement,
  Mark,
  MusicElement,
  ScoreLine,
  VoiceGroup,
} from './types'
import { graceWidth } from './grace'
import { durationInQuarterNotes, type TimedElement, tupletScale } from './timing'

export const PLAIN_NOTE_STEP = 37.5
export const UNDERLINED_NOTE_STEP = 25
export const BARLINE_GAP = 35
const FINAL_SYMBOL_WIDTH = 14
// The backend uses a fixed lyric collision grid rather than the configured font size.
const LYRIC_FULL_WIDTH_STEP = 250 / 9

interface AnalyzedItem {
  element: TimedElement
  elementIndex: number
  beat: number
  compact: boolean
  lyricOverflow: number
}

interface AnalyzedBarline {
  element?: BarlineElement
  elementIndex?: number
  synthetic: boolean
}

interface AnalyzedMeasure {
  beats: AnalyzedItem[][]
  barline: AnalyzedBarline
}

interface AnalyzedLine {
  line: ScoreLine
  measures: AnalyzedMeasure[]
  inlineLayers: Array<{ element: InlineLayerElement; elementIndex: number }>
}

interface InlineVoicePlan {
  hostLineIndex: number
  element: InlineLayerElement
  elementIndex: number
  inlineOffset: number
  upperLine: ScoreLine
  virtualAnalysis: AnalyzedLine
  startMeasure?: number
  closingMeasure?: number
  closingBarOriginal?: number
  upperEndsWithBarline: boolean
  hasLeftBrace: boolean
  closesWithinLine: boolean
  fullHeightRightBrace: boolean
}

export interface PositionedElement {
  element: TimedElement | BarlineElement
  elementIndex: number
  measure: number
  beat?: number
  x: number
}

export interface PositionedBarline {
  element?: BarlineElement
  elementIndex?: number
  measure: number
  synthetic: boolean
  x: number
}

export interface PositionedInlineLayer {
  element: InlineLayerElement
  elementIndex: number
  x: number
  layout?: LineLayout
  braceStartX?: number
  braceEndX?: number
  closesWithinLine?: boolean
  closingElementIndex?: number
  fullHeightRightBrace?: boolean
}

export interface LineLayout {
  line: ScoreLine
  elements: PositionedElement[]
  barlines: PositionedBarline[]
  inlineLayers: PositionedInlineLayer[]
  xByElement: Map<number, number>
}

export interface VoiceGroupLayout {
  lines: LineLayout[]
  endX: number
  voiceBraceX?: number
}

function tupletScalesByIndex(
  elements: readonly MusicElement[],
  marks: readonly Mark[],
): Map<number, number> {
  const tupletScaleByIndex = new Map<number, number>()
  marks
    .filter(({ type }) => type === 'tuplet')
    .forEach((mark) => {
      const timedIndices = elements.flatMap((element, index) =>
        index >= mark.start &&
        index <= mark.end &&
        (element.kind === 'note' || element.kind === 'sustain')
          ? [index]
          : [],
      )
      const scale = tupletScale(mark)
      if (scale === undefined) return
      timedIndices.forEach((index) => tupletScaleByIndex.set(index, scale))
    })
  return tupletScaleByIndex
}

function timedDuration(elements: readonly MusicElement[], marks: readonly Mark[]): number {
  const tupletScaleByIndex = tupletScalesByIndex(elements, marks)
  return elements.reduce(
    (total, element, index) =>
      element.kind === 'note' || element.kind === 'sustain'
        ? total + durationInQuarterNotes(element) * (tupletScaleByIndex.get(index) ?? 1)
        : total,
    0,
  )
}

function targetSpacing(element: TimedElement, compact = false): number {
  return compact || (element.kind === 'note' && element.duration > 4)
    ? UNDERLINED_NOTE_STEP
    : PLAIN_NOTE_STEP
}

function lyricOverflow(text: string): number {
  const cells = [...text].reduce(
    (total, character) => total + (/^[\x00-\x7f]$/.test(character) ? 0.5 : 1),
    0,
  )
  if (cells <= 1) return 0
  return Math.max(0, cells * LYRIC_FULL_WIDTH_STEP - UNDERLINED_NOTE_STEP)
}

function lyricOverflowByElement(line: ScoreLine): Map<number, number> {
  const noteIndices = line.elements.flatMap((element, elementIndex) =>
    element.kind === 'note' ? [elementIndex] : [],
  )
  const overflowByElement = new Map<number, number>()
  line.lyrics.forEach(({ syllables }) => {
    syllables.forEach(({ text }, syllableIndex) => {
      const elementIndex = noteIndices[syllableIndex]
      if (elementIndex === undefined) return
      const overflow = lyricOverflow(text)
      overflowByElement.set(
        elementIndex,
        Math.max(overflowByElement.get(elementIndex) ?? 0, overflow),
      )
    })
  })
  return overflowByElement
}

function withinBeatTrailingWidth(element: TimedElement): number {
  if (element.kind !== 'note') return 0
  return (
    element.dots * (PLAIN_NOTE_STEP - UNDERLINED_NOTE_STEP) +
    (element.ornaments.some(({ name }) => name === 'xhy' || name === 'shy') ? 7.5 : 0) +
    graceWidth(element.graceAfter)
  )
}

function leadingWidth(element: TimedElement, atBeatStart = false, previous?: TimedElement): number {
  if (element.kind !== 'note') return 0
  return (
    graceWidth(element.graceBefore) +
    (element.accidental === undefined ? 0 : 5) +
    (!atBeatStart && element.duration === 8 && previous?.kind === 'note' && previous.duration === 8
      ? element.dots * (PLAIN_NOTE_STEP - UNDERLINED_NOTE_STEP)
      : 0)
  )
}

function withinBeatSpacing(previous: AnalyzedItem, current: AnalyzedItem): number {
  return (
    Math.max(
      targetSpacing(previous.element, previous.compact),
      targetSpacing(current.element, current.compact),
    ) +
    withinBeatTrailingWidth(previous.element) +
    leadingWidth(current.element, false, previous.element) +
    previous.lyricOverflow
  )
}

function beatTerminalWidth(items: AnalyzedItem[]): number {
  const last = items[items.length - 1]
  if (last === undefined) return 0
  return (
    withinBeatTrailingWidth(last.element) +
    (items.some(({ element }) => element.kind === 'note' && element.accidental !== undefined)
      ? 5
      : 0)
  )
}

function beatBarlineTrailingWidth(items: AnalyzedItem[]): number {
  const last = items[items.length - 1]
  // A barline is a collision boundary for lyrics attached to the final note.
  return beatTerminalWidth(items) + (last?.lyricOverflow ?? 0)
}

function analyzeLine(line: ScoreLine): AnalyzedLine {
  const measures: AnalyzedMeasure[] = []
  const inlineLayers: AnalyzedLine['inlineLayers'] = []
  let beats: AnalyzedItem[][] = []
  let beat = -1
  let measureTime = 0
  let previousNaturalBeat: number | undefined
  let nextBoundary: 'join' | 'split' | undefined
  let endedWithBarline = false
  const tupletScales = tupletScalesByIndex(line.elements, line.marks)
  const tupletGroups = new Map<number, Mark>()
  let previousTimedIndex: number | undefined
  const lyricOverflow = lyricOverflowByElement(line)

  line.marks
    .filter(({ type }) => type === 'tuplet')
    .forEach((mark) => {
      const timedIndices = line.elements.flatMap((element, elementIndex) =>
        elementIndex >= mark.start &&
        elementIndex <= mark.end &&
        (element.kind === 'note' || element.kind === 'sustain')
          ? [elementIndex]
          : [],
      )
      timedIndices.forEach((elementIndex) => {
        tupletGroups.set(elementIndex, mark)
      })
    })

  const closeMeasure = (barline: AnalyzedBarline): void => {
    measures.push({ beats, barline })
    beats = []
    beat = -1
    measureTime = 0
    previousNaturalBeat = undefined
    previousTimedIndex = undefined
    nextBoundary = undefined
  }

  line.elements.forEach((element, elementIndex) => {
    if (element.kind === 'beat-boundary') {
      nextBoundary = element.behavior
      return
    }
    if (element.kind === 'inline-layer') {
      inlineLayers.push({ element, elementIndex })
      return
    }
    if (element.kind === 'barline') {
      closeMeasure({ element, elementIndex, synthetic: false })
      endedWithBarline = true
      return
    }

    endedWithBarline = false
    const continuesTuplet =
      previousTimedIndex !== undefined &&
      tupletGroups.get(previousTimedIndex) === tupletGroups.get(elementIndex) &&
      tupletGroups.has(elementIndex)
    const naturalBeat = Math.floor(measureTime + 1e-9)
    const beginsBeat =
      beat < 0 ||
      nextBoundary === 'split' ||
      (nextBoundary !== 'join' &&
        !continuesTuplet &&
        previousNaturalBeat !== undefined &&
        naturalBeat !== previousNaturalBeat)
    if (beginsBeat) beat += 1
    const currentBeat = Math.max(0, beat)
    while (beats.length <= currentBeat) beats.push([])
    const items = beats[currentBeat]
    if (items === undefined) return
    items.push({
      element,
      elementIndex,
      beat: currentBeat,
      compact: (tupletScales.get(elementIndex) ?? 1) < 1,
      lyricOverflow: lyricOverflow.get(elementIndex) ?? 0,
    })
    previousTimedIndex = elementIndex
    previousNaturalBeat = naturalBeat
    measureTime += durationInQuarterNotes(element) * (tupletScales.get(elementIndex) ?? 1)
    nextBoundary = undefined
  })

  if (!endedWithBarline || measures.length === 0) {
    closeMeasure({ synthetic: true })
  }

  return { line, measures, inlineLayers }
}

function remapMarks(marks: Mark[], indexByOriginal: Map<number, number>): Mark[] {
  return marks.flatMap((mark) => {
    const start = indexByOriginal.get(mark.start)
    const end = indexByOriginal.get(mark.end)
    return start === undefined || end === undefined ? [] : [{ ...mark, start, end }]
  })
}

function analysisSuffix(line: ScoreLine, elementIndex: number): ScoreLine {
  const entries = line.elements.flatMap((item, index) =>
    index > elementIndex && item.kind !== 'inline-layer' ? [{ item, index }] : [],
  )
  const indexByOriginal = new Map(
    entries.map(({ index }, syntheticIndex) => [index, syntheticIndex]),
  )
  return {
    ...line,
    voice: 2,
    elements: entries.map(({ item }) => item),
    marks: remapMarks(line.marks, indexByOriginal),
    lyrics: [],
  }
}

function measureContainingElement(
  analysis: AnalyzedLine,
  elementIndex: number,
): number | undefined {
  return analysis.measures.findIndex(
    ({ barline }, measure) =>
      elementIndex <= (barline.elementIndex ?? Number.POSITIVE_INFINITY) &&
      (measure === 0 ||
        elementIndex >
          (analysis.measures[measure - 1]?.barline.elementIndex ?? Number.NEGATIVE_INFINITY)),
  )
}

function planInlineVoices(analyzed: AnalyzedLine[]): InlineVoicePlan[] {
  return analyzed.flatMap((analysis, hostLineIndex) =>
    analysis.inlineLayers.flatMap(({ element, elementIndex }) => {
      const upperLine: ScoreLine = {
        ...analysis.line,
        voice: 1,
        elements: element.elements,
        marks: element.marks,
        lyrics: [],
      }
      if (element.role !== 'voice') {
        return [
          {
            hostLineIndex,
            element,
            elementIndex,
            inlineOffset: 0,
            upperLine,
            virtualAnalysis: analyzeLine(upperLine),
            upperEndsWithBarline: false,
            hasLeftBrace: false,
            closesWithinLine: false,
            fullHeightRightBrace: false,
          },
        ]
      }
      const hostEntries = analysis.line.elements.map((item, index) => ({ item, index }))
      const prefixEntries = hostEntries.filter(({ index }) => index < elementIndex)
      const lowerEntries = hostEntries.filter(
        ({ item, index }) => index > elementIndex && item.kind !== 'inline-layer',
      )
      if (lowerEntries.length === 0) return []
      const upperDuration = timedDuration(element.elements, element.marks)
      const hostTupletScales = tupletScalesByIndex(analysis.line.elements, analysis.line.marks)
      let lowerDuration = 0
      let closingBarOriginal: number | undefined
      for (const { item, index } of lowerEntries) {
        if (item.kind === 'note' || item.kind === 'sustain') {
          lowerDuration += durationInQuarterNotes(item) * (hostTupletScales.get(index) ?? 1)
        } else if (item.kind === 'barline' && lowerDuration >= upperDuration - 1e-9) {
          closingBarOriginal = index
          break
        }
      }

      const previousElement = prefixEntries
        .map(({ item }) => item)
        .reverse()
        .find((item) => item.kind !== 'beat-boundary' && item.kind !== 'inline-layer')
      const hasLeftBrace =
        previousElement?.kind === 'barline' &&
        previousElement.type !== 'hidden' &&
        previousElement.type !== 'invisible'
      const closesWithinLine =
        closingBarOriginal !== undefined &&
        analysis.line.elements.some(
          (item, index) =>
            index > closingBarOriginal && (item.kind === 'note' || item.kind === 'sustain'),
        )

      const upperEndsWithBarline =
        [...element.elements]
          .reverse()
          .find((item) => item.kind !== 'beat-boundary' && item.kind !== 'inline-layer')?.kind ===
        'barline'
      const suffixEntries = lowerEntries.filter(
        ({ index }) =>
          closingBarOriginal !== undefined &&
          (upperEndsWithBarline ? index > closingBarOriginal : index >= closingBarOriginal),
      )
      const inlineOffset = prefixEntries.length
      const suffixOffset = inlineOffset + element.elements.length
      const elements = [
        ...prefixEntries.map(({ item }) => item),
        ...element.elements,
        ...suffixEntries.map(({ item }) => item),
      ]
      const prefixIndexByOriginal = new Map(
        prefixEntries.map(({ index }, virtualIndex) => [index, virtualIndex]),
      )
      const suffixIndexByOriginal = new Map(
        suffixEntries.map(({ index }, suffixIndex) => [index, suffixOffset + suffixIndex]),
      )
      const virtualLine: ScoreLine = {
        ...analysis.line,
        voice: 1,
        elements,
        marks: [
          ...remapMarks(analysis.line.marks, prefixIndexByOriginal),
          ...element.marks.map((mark) => ({
            ...mark,
            start: mark.start + inlineOffset,
            end: mark.end + inlineOffset,
          })),
          ...remapMarks(analysis.line.marks, suffixIndexByOriginal),
        ],
        lyrics: [],
      }
      const virtualAnalysis = analyzeLine(virtualLine)
      const startMeasure = measureContainingElement(analysis, elementIndex)
      const closingMeasure =
        closingBarOriginal === undefined
          ? undefined
          : analysis.measures.findIndex(
              ({ barline }) => barline.elementIndex === closingBarOriginal,
            )

      return [
        {
          hostLineIndex,
          element,
          elementIndex,
          inlineOffset,
          upperLine,
          virtualAnalysis,
          ...(startMeasure === undefined || startMeasure < 0 ? {} : { startMeasure }),
          ...(closingMeasure === undefined || closingMeasure < 0 ? {} : { closingMeasure }),
          ...(closingBarOriginal === undefined ? {} : { closingBarOriginal }),
          upperEndsWithBarline,
          hasLeftBrace,
          closesWithinLine,
          fullHeightRightBrace: previousElement?.kind === 'barline',
        },
      ]
    }),
  )
}

/**
 * Lay out a voice group using the original renderer's two observed spacing units.
 * Voices share measure and beat starts, while their notes remain left-aligned
 * inside each beat.
 */
export function layoutVoiceGroup(
  group: VoiceGroup,
  startX: number,
  maximumX = Number.POSITIVE_INFINITY,
  voiceColumnWidth = 0,
): VoiceGroupLayout {
  const analyzed = group.voices.map(analyzeLine)
  const inlineVoicePlans = planInlineVoices(analyzed)
  const voiceAlignmentAnalyses = inlineVoicePlans.flatMap(({ element, virtualAnalysis }) =>
    element.role === 'voice' ? [virtualAnalysis] : [],
  )
  const alignmentAnalyses = [...analyzed, ...voiceAlignmentAnalyses]
  const lineLayouts: LineLayout[] = analyzed.map(({ line }) => ({
    line,
    elements: [],
    barlines: [],
    inlineLayers: [],
    xByElement: new Map(),
  }))
  const virtualLayouts: Array<LineLayout | undefined> = inlineVoicePlans.map(
    ({ element, virtualAnalysis: { line } }) =>
      element.role === 'voice'
        ? {
            line,
            elements: [],
            barlines: [],
            inlineLayers: [],
            xByElement: new Map(),
          }
        : undefined,
  )
  const measureCount = Math.max(0, ...alignmentAnalyses.map(({ measures }) => measures.length))
  const voiceBraceMeasure = analyzed.reduce<number | undefined>((first, { measures }) => {
    const found = measures.findIndex(({ barline }) =>
      barline.element?.ornaments.some(({ name }) => name === 'sbf'),
    )
    if (found < 0) return first
    return first === undefined ? found : Math.min(first, found)
  }, undefined)
  let measureStart = startX
  let endX = startX
  let voiceBraceX: number | undefined
  let voiceColumnEndX: number | undefined

  for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
    const hasInlineLeftColumn = inlineVoicePlans.some(
      (plan) =>
        plan.element.role === 'voice' && plan.hasLeftBrace && plan.startMeasure === measureIndex,
    )
    if (hasInlineLeftColumn) measureStart += 20

    const beatCount = Math.max(
      0,
      ...alignmentAnalyses.map(({ measures }) => measures[measureIndex]?.beats.length ?? 0),
    )
    const beatStarts: number[] = []
    const beatColumns: number[][] = []
    let nextBeatStart = 0

    for (let beatIndex = 0; beatIndex < beatCount; beatIndex += 1) {
      beatStarts.push(nextBeatStart)
      const voiceItems = alignmentAnalyses.map(
        ({ measures }) => measures[measureIndex]?.beats[beatIndex] ?? [],
      )
      const itemCount = Math.max(0, ...voiceItems.map((items) => items.length))
      const columns =
        itemCount === 0
          ? []
          : [
              Math.max(
                0,
                ...voiceItems.flatMap((items) => {
                  const first = items[0]
                  return first === undefined ? [] : [leadingWidth(first.element, true)]
                }),
              ),
            ]
      for (let itemIndex = 1; itemIndex < itemCount; itemIndex += 1) {
        const step = Math.max(
          0,
          ...voiceItems.flatMap((items) => {
            const previous = items[itemIndex - 1]
            const current = items[itemIndex]
            return previous === undefined || current === undefined
              ? []
              : [withinBeatSpacing(previous, current)]
          }),
        )
        columns.push((columns[itemIndex - 1] ?? 0) + step)
      }
      beatColumns.push(columns)

      const lastColumn = columns[columns.length - 1] ?? 0
      const terminalWidth = Math.max(0, ...voiceItems.map(beatTerminalWidth))
      const nextBeatCandidates = voiceItems.flatMap((items) => {
        const last = items[items.length - 1]
        if (last === undefined) return []
        return [
          (columns[items.length - 1] ?? 0) +
            PLAIN_NOTE_STEP +
            beatTerminalWidth(items) +
            last.lyricOverflow,
        ]
      })
      nextBeatStart += Math.max(lastColumn + PLAIN_NOTE_STEP + terminalWidth, ...nextBeatCandidates)
    }

    const lastBeat = beatCount - 1
    const barRelativeX =
      beatCount === 0
        ? 0
        : (beatStarts[lastBeat] ?? 0) +
          (beatColumns[lastBeat]?.[beatColumns[lastBeat].length - 1] ?? 0) +
          BARLINE_GAP +
          Math.max(
            0,
            ...alignmentAnalyses.flatMap(({ measures }) => {
              const items = measures[measureIndex]?.beats[lastBeat] ?? []
              return items.length === 0 ? [] : [beatBarlineTrailingWidth(items)]
            }),
          )
    const hasInlineRightColumn = inlineVoicePlans.some(
      (plan) =>
        plan.element.role === 'voice' &&
        plan.closesWithinLine &&
        plan.closingMeasure === measureIndex,
    )
    const barX = measureStart + barRelativeX + (hasInlineRightColumn ? 20 : 0)

    analyzed.forEach((analysis, lineIndex) => {
      const output = lineLayouts[lineIndex]
      const measure = analysis.measures[measureIndex]
      if (output === undefined || measure === undefined) return
      measure.beats.forEach((items, beatIndex) => {
        const beatStart = beatStarts[beatIndex] ?? 0
        items.forEach((item, itemIndex) => {
          const x = measureStart + beatStart + (beatColumns[beatIndex]?.[itemIndex] ?? 0)
          output.elements.push({
            element: item.element,
            elementIndex: item.elementIndex,
            measure: measureIndex,
            beat: beatIndex,
            x,
          })
          output.xByElement.set(item.elementIndex, x)
        })
      })
      const barline = measure.barline
      output.barlines.push({
        measure: measureIndex,
        synthetic: barline.synthetic,
        x: barX,
        ...(barline.element === undefined ? {} : { element: barline.element }),
        ...(barline.elementIndex === undefined ? {} : { elementIndex: barline.elementIndex }),
      })
      if (barline.element !== undefined && barline.elementIndex !== undefined) {
        output.elements.push({
          element: barline.element,
          elementIndex: barline.elementIndex,
          measure: measureIndex,
          x: barX,
        })
        output.xByElement.set(barline.elementIndex, barX)
      }
    })

    inlineVoicePlans.forEach(({ element, virtualAnalysis }, planIndex) => {
      if (element.role !== 'voice') return
      const output = virtualLayouts[planIndex]
      const measure = virtualAnalysis.measures[measureIndex]
      if (output === undefined || measure === undefined) return
      measure.beats.forEach((items, beatIndex) => {
        const beatStart = beatStarts[beatIndex] ?? 0
        items.forEach((item, itemIndex) => {
          const x = measureStart + beatStart + (beatColumns[beatIndex]?.[itemIndex] ?? 0)
          output.elements.push({
            element: item.element,
            elementIndex: item.elementIndex,
            measure: measureIndex,
            beat: beatIndex,
            x,
          })
          output.xByElement.set(item.elementIndex, x)
        })
      })
      const barline = measure.barline
      output.barlines.push({
        measure: measureIndex,
        synthetic: barline.synthetic,
        x: barX,
        ...(barline.element === undefined ? {} : { element: barline.element }),
        ...(barline.elementIndex === undefined ? {} : { elementIndex: barline.elementIndex }),
      })
      if (barline.element !== undefined && barline.elementIndex !== undefined) {
        output.elements.push({
          element: barline.element,
          elementIndex: barline.elementIndex,
          measure: measureIndex,
          x: barX,
        })
        output.xByElement.set(barline.elementIndex, barX)
      }
    })

    const closures = alignmentAnalyses
      .map(({ measures }) => measures[measureIndex]?.barline.element)
      .filter((barline): barline is BarlineElement => barline !== undefined)
    const zeroWidthHiddenBar =
      beatCount === 0 && closures.length > 0 && closures.every(({ type }) => type === 'hidden')
    endX = barX
    if (!zeroWidthHiddenBar) measureStart = barX + BARLINE_GAP
    if (measureIndex === voiceBraceMeasure) {
      measureStart += voiceColumnWidth
      voiceBraceX = measureStart
      voiceColumnEndX = measureStart
    }
  }

  inlineVoicePlans.forEach((plan, planIndex) => {
    const output = lineLayouts[plan.hostLineIndex]
    const virtualLayout = virtualLayouts[planIndex]
    if (output === undefined) return
    if (plan.element.role === 'accompaniment') {
      const next = output.elements
        .filter((positioned) => positioned.elementIndex > plan.elementIndex)
        .sort((left, right) => left.elementIndex - right.elementIndex)[0]
      const x = next?.x ?? output.barlines[output.barlines.length - 1]?.x ?? startX
      const lowerLine = analysisSuffix(output.line, plan.elementIndex)
      if (lowerLine.elements.length === 0) {
        output.inlineLayers.push({
          element: plan.element,
          elementIndex: plan.elementIndex,
          x,
        })
        return
      }
      const branch = layoutVoiceGroup({ index: -1, voices: [plan.upperLine, lowerLine] }, x)
      const lowerLayout = branch.lines[1]
      const lowerIndices = output.line.elements.flatMap((item, index) =>
        index > plan.elementIndex && item.kind !== 'inline-layer' ? [index] : [],
      )
      lowerLayout?.elements.forEach((positioned) => {
        const originalIndex = lowerIndices[positioned.elementIndex]
        if (originalIndex === undefined) return
        const original = output.elements.find((item) => item.elementIndex === originalIndex)
        if (original !== undefined) original.x = positioned.x
        output.xByElement.set(originalIndex, positioned.x)
      })
      lowerLayout?.barlines.forEach((barline) => {
        if (barline.elementIndex === undefined) return
        const originalIndex = lowerIndices[barline.elementIndex]
        if (originalIndex === undefined) return
        const original = output.barlines.find((item) => item.elementIndex === originalIndex)
        if (original !== undefined) original.x = barline.x
      })
      output.inlineLayers.push({
        element: plan.element,
        elementIndex: plan.elementIndex,
        x,
        ...(branch.lines[0] === undefined ? {} : { layout: branch.lines[0] }),
      })
      endX = Math.max(endX, branch.endX)
      return
    }
    if (virtualLayout === undefined) return
    const upperElements = virtualLayout.elements.flatMap((positioned) => {
      const elementIndex = positioned.elementIndex - plan.inlineOffset
      return elementIndex >= 0 && elementIndex < plan.upperLine.elements.length
        ? [{ ...positioned, elementIndex }]
        : []
    })
    const upperBarlines = virtualLayout.barlines.flatMap((barline) => {
      if (barline.measure < (plan.startMeasure ?? 0)) return []
      if (plan.closingMeasure !== undefined && barline.measure > plan.closingMeasure) return []
      const virtualElementIndex = barline.elementIndex
      const elementIndex =
        virtualElementIndex === undefined ? undefined : virtualElementIndex - plan.inlineOffset
      const borrowedClosingBar =
        !plan.upperEndsWithBarline &&
        plan.closingMeasure !== undefined &&
        barline.measure === plan.closingMeasure
      if (borrowedClosingBar) {
        return [
          {
            measure: barline.measure,
            synthetic: true,
            x: barline.x,
          },
        ]
      }
      if (
        virtualElementIndex !== undefined &&
        (virtualElementIndex < plan.inlineOffset ||
          virtualElementIndex >= plan.inlineOffset + plan.upperLine.elements.length)
      ) {
        return []
      }
      return [
        {
          ...barline,
          ...(elementIndex === undefined ? {} : { elementIndex }),
        },
      ]
    })
    const upperLayout: LineLayout = {
      line: plan.upperLine,
      elements: upperElements,
      barlines: upperBarlines,
      inlineLayers: [],
      xByElement: new Map(upperElements.map(({ elementIndex, x }) => [elementIndex, x])),
    }
    const x =
      upperElements[0]?.x ??
      output.elements
        .filter((positioned) => positioned.elementIndex > plan.elementIndex)
        .sort((left, right) => left.elementIndex - right.elementIndex)[0]?.x ??
      output.barlines[output.barlines.length - 1]?.x ??
      startX
    const closingBarX =
      plan.closingMeasure === undefined
        ? undefined
        : virtualLayout.barlines.find(({ measure }) => measure === plan.closingMeasure)?.x
    output.inlineLayers.push({
      element: plan.element,
      elementIndex: plan.elementIndex,
      x,
      layout: upperLayout,
      ...(plan.closingBarOriginal === undefined
        ? {}
        : { closingElementIndex: plan.closingBarOriginal }),
      ...(plan.hasLeftBrace ? { braceStartX: x - 35 } : {}),
      ...(plan.closesWithinLine && closingBarX !== undefined
        ? {
            braceEndX: closingBarX - 20,
            closesWithinLine: true,
            fullHeightRightBrace: plan.fullHeightRightBrace,
          }
        : {}),
    })
  })
  lineLayouts.forEach((output) =>
    output.elements.sort((left, right) => left.elementIndex - right.elementIndex),
  )

  if (voiceBraceMeasure !== undefined) {
    const nextMeasureTimedElements = lineLayouts.flatMap(({ elements }) =>
      elements.filter(
        ({ element, measure }) =>
          measure === voiceBraceMeasure + 1 &&
          (element.kind === 'note' || element.kind === 'sustain'),
      ),
    )
    if (nextMeasureTimedElements.length > 0) {
      voiceBraceX = Math.min(...nextMeasureTimedElements.map(({ x }) => x))
    }
  }

  const availableWidth = maximumX - startX
  const naturalWidth = endX - startX
  const fillRatio = naturalWidth / availableWidth
  const shouldFitLine =
    endX > maximumX || naturalWidth >= 700 || (measureCount > 1 && fillRatio >= 0.69)
  if (shouldFitLine && Number.isFinite(maximumX) && endX !== maximumX && endX > startX) {
    // The legacy renderer reserves one reduced-note unit plus the 14 px width
    // of the closing symbol, then pins that final barline to the right edge.
    const fixedVoiceColumn = voiceColumnEndX === undefined ? 0 : voiceColumnWidth
    const scale =
      (maximumX - startX + FINAL_SYMBOL_WIDTH - fixedVoiceColumn) /
      (endX - startX + UNDERLINED_NOTE_STEP - fixedVoiceColumn)
    const compress = (x: number): number => {
      const precedingFixedVoiceColumn =
        voiceColumnEndX !== undefined && x >= voiceColumnEndX - 1e-9 ? voiceColumnWidth : 0
      return startX + (x - startX - precedingFixedVoiceColumn) * scale + precedingFixedVoiceColumn
    }
    lineLayouts.forEach((layout) => {
      layout.elements.forEach((positioned) => {
        positioned.x = compress(positioned.x)
      })
      layout.barlines.forEach((barline) => {
        barline.x = compress(barline.x)
      })
      layout.inlineLayers.forEach((layer) => {
        layer.x = compress(layer.x)
        layer.layout?.elements.forEach((positioned) => {
          positioned.x = compress(positioned.x)
        })
        layer.layout?.barlines.forEach((barline) => {
          barline.x = compress(barline.x)
        })
        layer.layout?.xByElement.forEach((x, index) => {
          layer.layout?.xByElement.set(index, compress(x))
        })
        if (layer.braceStartX !== undefined) layer.braceStartX = compress(layer.braceStartX)
        if (layer.braceEndX !== undefined) layer.braceEndX = compress(layer.braceEndX)
      })
      layout.xByElement.forEach((x, index) => {
        layout.xByElement.set(index, compress(x))
      })
      layout.barlines
        .filter(({ measure }) => measure === measureCount - 1)
        .forEach((barline) => {
          barline.x = maximumX
          if (barline.elementIndex !== undefined)
            layout.xByElement.set(barline.elementIndex, maximumX)
        })
      layout.elements
        .filter(
          (positioned) =>
            positioned.measure === measureCount - 1 && positioned.element.kind === 'barline',
        )
        .forEach((positioned) => {
          positioned.x = maximumX
        })
    })
    if (voiceBraceX !== undefined) voiceBraceX = compress(voiceBraceX)
    endX = maximumX
  }

  return {
    lines: lineLayouts,
    endX,
    ...(voiceBraceX === undefined ? {} : { voiceBraceX }),
  }
}
