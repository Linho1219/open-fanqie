import type {
  BarlineElement,
  InlineLayerElement,
  Mark,
  NoteElement,
  ScoreLine,
  SustainElement,
  VoiceGroup,
} from './types'

export const PLAIN_NOTE_STEP = 37.5
export const UNDERLINED_NOTE_STEP = 25
export const BARLINE_GAP = 35
const FINAL_SYMBOL_WIDTH = 14
// The backend uses a fixed lyric collision grid rather than the configured font size.
const LYRIC_FULL_WIDTH_STEP = 250 / 9

type TimedElement = NoteElement | SustainElement

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

function durationInQuarterNotes(element: TimedElement): number {
  if (element.kind === 'sustain') return 1
  const base = 4 / element.duration
  let multiplier = 1
  let fraction = 0.5
  for (let dot = 0; dot < element.dots; dot += 1) {
    multiplier += fraction
    fraction /= 2
  }
  return base * multiplier
}

function timedDuration(
  elements: readonly (TimedElement | BarlineElement)[],
  marks: Mark[],
): number {
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
      if (timedIndices.length < 3) return
      const normalCount = 2 ** Math.floor(Math.log2(timedIndices.length - 1))
      timedIndices.forEach((index) =>
        tupletScaleByIndex.set(index, normalCount / timedIndices.length),
      )
    })
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
    (element.ornaments.some(({ name }) => name === 'xhy' || name === 'shy') ? 7.5 : 0)
  )
}

function leadingWidth(element: TimedElement, atBeatStart = false, previous?: TimedElement): number {
  if (element.kind !== 'note') return 0
  return (
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

function analyzeLine(line: ScoreLine): AnalyzedLine {
  const measures: AnalyzedMeasure[] = []
  const inlineLayers: AnalyzedLine['inlineLayers'] = []
  let beats: AnalyzedItem[][] = []
  let beat = -1
  let beatTime = 0
  let nextBoundary: 'join' | 'split' | undefined
  let endedWithBarline = false
  const tupletScales = new Map<number, number>()
  const tupletGroups = new Map<number, Mark>()
  let previousTimedIndex: number | undefined
  let previousTimedElement: TimedElement | undefined
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
      const count = timedIndices.length
      if (count < 3) return
      const normalCount = 2 ** Math.floor(Math.log2(count - 1))
      timedIndices.forEach((elementIndex) => {
        tupletScales.set(elementIndex, normalCount / count)
        tupletGroups.set(elementIndex, mark)
      })
    })

  const closeMeasure = (barline: AnalyzedBarline): void => {
    measures.push({ beats, barline })
    beats = []
    beat = -1
    beatTime = 0
    previousTimedIndex = undefined
    previousTimedElement = undefined
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
    const beginsBeat =
      beat < 0 ||
      nextBoundary === 'split' ||
      (nextBoundary !== 'join' &&
        previousTimedElement?.kind === 'note' &&
        previousTimedElement.sound === 'rest') ||
      (nextBoundary !== 'join' && !continuesTuplet && beatTime >= 1 - 1e-9)
    if (beginsBeat) {
      beat += 1
      beatTime = 0
    }
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
    previousTimedElement = element
    beatTime += durationInQuarterNotes(element) * (tupletScales.get(elementIndex) ?? 1)
    nextBoundary = undefined
  })

  if (!endedWithBarline || measures.length === 0) {
    closeMeasure({ synthetic: true })
  }

  return { line, measures, inlineLayers }
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
  const lineLayouts: LineLayout[] = analyzed.map(({ line }) => ({
    line,
    elements: [],
    barlines: [],
    inlineLayers: [],
    xByElement: new Map(),
  }))
  const measureCount = Math.max(0, ...analyzed.map(({ measures }) => measures.length))
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

  for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
    const beatCount = Math.max(
      0,
      ...analyzed.map(({ measures }) => measures[measureIndex]?.beats.length ?? 0),
    )
    const beatStarts: number[] = []
    const beatColumns: number[][] = []
    let nextBeatStart = 0

    for (let beatIndex = 0; beatIndex < beatCount; beatIndex += 1) {
      beatStarts.push(nextBeatStart)
      const voiceItems = analyzed.map(
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
            ...analyzed.flatMap(({ measures }) => {
              const items = measures[measureIndex]?.beats[lastBeat] ?? []
              return items.length === 0 ? [] : [beatTerminalWidth(items)]
            }),
          )
    const barX = measureStart + barRelativeX

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

    const closures = analyzed
      .map(({ measures }) => measures[measureIndex]?.barline.element)
      .filter((barline): barline is BarlineElement => barline !== undefined)
    const zeroWidthHiddenBar =
      beatCount === 0 && closures.length > 0 && closures.every(({ type }) => type === 'hidden')
    endX = barX
    if (!zeroWidthHiddenBar) measureStart = barX + BARLINE_GAP
    if (measureIndex === voiceBraceMeasure) {
      measureStart += voiceColumnWidth
      voiceBraceX = measureStart
    }
  }

  analyzed.forEach((analysis, lineIndex) => {
    const output = lineLayouts[lineIndex]
    if (output === undefined) return
    analysis.inlineLayers.forEach(({ element, elementIndex }) => {
      const next = output.elements
        .filter((positioned) => positioned.elementIndex > elementIndex)
        .sort((left, right) => left.elementIndex - right.elementIndex)[0]
      const x = next?.x ?? output.barlines[output.barlines.length - 1]?.x ?? startX
      const lowerEntries = analysis.line.elements.flatMap((item, index) =>
        index > elementIndex && item.kind !== 'inline-layer' ? [{ item, index }] : [],
      )
      const lowerIndexBySynthetic = lowerEntries.map(({ index }) => index)
      const syntheticByOriginal = new Map(
        lowerIndexBySynthetic.map((originalIndex, syntheticIndex) => [
          originalIndex,
          syntheticIndex,
        ]),
      )
      const lowerMarks = analysis.line.marks.flatMap((mark) => {
        const markStart = syntheticByOriginal.get(mark.start)
        const markEnd = syntheticByOriginal.get(mark.end)
        return markStart === undefined || markEnd === undefined
          ? []
          : [{ ...mark, start: markStart, end: markEnd }]
      })
      const upperLine: ScoreLine = {
        ...analysis.line,
        voice: 1,
        elements: element.elements,
        marks: element.marks,
        lyrics: [],
      }
      const lowerLine: ScoreLine = {
        ...analysis.line,
        voice: 2,
        elements: lowerEntries.map(({ item }) => item),
        marks: lowerMarks,
        lyrics: [],
      }
      const branch =
        lowerEntries.length === 0
          ? undefined
          : layoutVoiceGroup({ index: -1, voices: [upperLine, lowerLine] }, x)
      const upperLayout = branch?.lines[0]
      const lowerLayout = branch?.lines[1]
      const upperDuration = timedDuration(
        element.elements.filter(
          (item): item is TimedElement | BarlineElement =>
            item.kind !== 'inline-layer' && item.kind !== 'beat-boundary',
        ),
        element.marks,
      )
      let lowerDuration = 0
      let closingBarOriginal: number | undefined
      for (const { item, index } of lowerEntries) {
        if (item.kind === 'note' || item.kind === 'sustain') {
          lowerDuration += durationInQuarterNotes(item)
        } else if (item.kind === 'barline' && lowerDuration >= upperDuration - 1e-9) {
          closingBarOriginal = index
          break
        }
      }
      const closesWithinLine =
        element.role === 'voice' &&
        closingBarOriginal !== undefined &&
        analysis.line.elements.some(
          (item, index) =>
            index > closingBarOriginal && (item.kind === 'note' || item.kind === 'sustain'),
        )
      const previousElement = analysis.line.elements
        .slice(0, elementIndex)
        .reverse()
        .find((item) => item.kind !== 'beat-boundary' && item.kind !== 'inline-layer')
      const hasLeftBrace =
        element.role === 'voice' &&
        previousElement?.kind === 'barline' &&
        previousElement.type !== 'hidden' &&
        previousElement.type !== 'invisible'
      const leftBraceShift = hasLeftBrace ? 20 : 0
      const closingBarBeforeShift =
        closingBarOriginal === undefined
          ? undefined
          : lowerLayout?.xByElement.get(syntheticByOriginal.get(closingBarOriginal) ?? -1)
      lowerLayout?.elements.forEach((positioned) => {
        const originalIndex = lowerIndexBySynthetic[positioned.elementIndex]
        if (originalIndex === undefined) return
        const branchShift =
          leftBraceShift +
          (closesWithinLine &&
          closingBarOriginal !== undefined &&
          originalIndex >= closingBarOriginal
            ? 20
            : 0)
        const original = output.elements.find((item) => item.elementIndex === originalIndex)
        if (original !== undefined) original.x = positioned.x + branchShift
        output.xByElement.set(originalIndex, positioned.x + branchShift)
      })
      lowerLayout?.barlines.forEach((barline) => {
        if (barline.elementIndex === undefined) return
        const originalIndex = lowerIndexBySynthetic[barline.elementIndex]
        if (originalIndex === undefined) return
        const branchShift =
          leftBraceShift +
          (closesWithinLine &&
          closingBarOriginal !== undefined &&
          originalIndex >= closingBarOriginal
            ? 20
            : 0)
        const original = output.barlines.find((item) => item.elementIndex === originalIndex)
        if (original !== undefined) original.x = barline.x + branchShift
      })
      if (leftBraceShift > 0) {
        upperLayout?.elements.forEach((positioned) => {
          positioned.x += leftBraceShift
        })
        upperLayout?.barlines.forEach((barline) => {
          barline.x += leftBraceShift
        })
        upperLayout?.xByElement.forEach((position, index) => {
          upperLayout.xByElement.set(index, position + leftBraceShift)
        })
      }
      if (branch !== undefined) {
        endX = Math.max(endX, branch.endX + leftBraceShift + (closesWithinLine ? 20 : 0))
      }
      output.inlineLayers.push({
        element,
        elementIndex,
        x,
        ...(upperLayout === undefined ? {} : { layout: upperLayout }),
        ...(closingBarOriginal === undefined ? {} : { closingElementIndex: closingBarOriginal }),
        ...(hasLeftBrace ? { braceStartX: x - 15 } : {}),
        ...(closesWithinLine && closingBarBeforeShift !== undefined
          ? {
              braceEndX: closingBarBeforeShift + leftBraceShift,
              closesWithinLine: true,
              fullHeightRightBrace: previousElement?.kind === 'barline',
            }
          : {}),
      })
    })
    output.elements.sort((left, right) => left.elementIndex - right.elementIndex)
  })

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
    const scale = (maximumX - startX + FINAL_SYMBOL_WIDTH) / (endX - startX + UNDERLINED_NOTE_STEP)
    const compress = (x: number): number => startX + (x - startX) * scale
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
