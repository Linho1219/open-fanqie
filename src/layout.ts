import type {
  BarlineElement,
  InlineLayerElement,
  NoteElement,
  ScoreLine,
  SustainElement,
  VoiceGroup,
} from "./types";

export const PLAIN_NOTE_STEP = 37.5;
export const UNDERLINED_NOTE_STEP = 25;
export const BARLINE_GAP = 35;

type TimedElement = NoteElement | SustainElement;

interface AnalyzedItem {
  element: TimedElement;
  elementIndex: number;
  beat: number;
  localX: number;
}

interface AnalyzedBarline {
  element?: BarlineElement;
  elementIndex?: number;
  synthetic: boolean;
}

interface AnalyzedMeasure {
  beats: AnalyzedItem[][];
  barline: AnalyzedBarline;
}

interface AnalyzedLine {
  line: ScoreLine;
  measures: AnalyzedMeasure[];
  inlineLayers: Array<{ element: InlineLayerElement; elementIndex: number }>;
}

export interface PositionedElement {
  element: TimedElement | BarlineElement;
  elementIndex: number;
  measure: number;
  beat?: number;
  x: number;
}

export interface PositionedBarline {
  element?: BarlineElement;
  elementIndex?: number;
  measure: number;
  synthetic: boolean;
  x: number;
}

export interface PositionedInlineLayer {
  element: InlineLayerElement;
  elementIndex: number;
  x: number;
}

export interface LineLayout {
  line: ScoreLine;
  elements: PositionedElement[];
  barlines: PositionedBarline[];
  inlineLayers: PositionedInlineLayer[];
  xByElement: Map<number, number>;
}

export interface VoiceGroupLayout {
  lines: LineLayout[];
  endX: number;
}

function durationInQuarterNotes(element: TimedElement): number {
  if (element.kind === "sustain") return 1;
  const base = 4 / element.duration;
  let multiplier = 1;
  let fraction = 0.5;
  for (let dot = 0; dot < element.dots; dot += 1) {
    multiplier += fraction;
    fraction /= 2;
  }
  return base * multiplier;
}

function targetSpacing(element: TimedElement): number {
  return element.kind === "note" && element.duration > 4
    ? UNDERLINED_NOTE_STEP
    : PLAIN_NOTE_STEP;
}

function analyzeLine(line: ScoreLine): AnalyzedLine {
  const measures: AnalyzedMeasure[] = [];
  const inlineLayers: AnalyzedLine["inlineLayers"] = [];
  let beats: AnalyzedItem[][] = [];
  let beat = -1;
  let time = 0;
  let previousNaturalBeat: number | undefined;
  let nextBoundary: "join" | "split" | undefined;
  let endedWithBarline = false;

  const closeMeasure = (
    barline: AnalyzedBarline,
  ): void => {
    measures.push({ beats, barline });
    beats = [];
    beat = -1;
    time = 0;
    previousNaturalBeat = undefined;
    nextBoundary = undefined;
  };

  line.elements.forEach((element, elementIndex) => {
    if (element.kind === "beat-boundary") {
      nextBoundary = element.behavior;
      return;
    }
    if (element.kind === "inline-layer") {
      inlineLayers.push({ element, elementIndex });
      return;
    }
    if (element.kind === "barline") {
      closeMeasure({ element, elementIndex, synthetic: false });
      endedWithBarline = true;
      return;
    }

    endedWithBarline = false;
    const naturalBeat = Math.floor(time + 1e-9);
    const beginsBeat = beat < 0 ||
      nextBoundary === "split" ||
      (nextBoundary !== "join" &&
        previousNaturalBeat !== undefined &&
        naturalBeat !== previousNaturalBeat);
    if (beginsBeat) beat += 1;
    const currentBeat = Math.max(0, beat);
    while (beats.length <= currentBeat) beats.push([]);
    const items = beats[currentBeat];
    if (items === undefined) return;
    const previous = items[items.length - 1];
    const localX = previous === undefined ? 0 : previous.localX + targetSpacing(element);
    items.push({ element, elementIndex, beat: currentBeat, localX });
    previousNaturalBeat = naturalBeat;
    time += durationInQuarterNotes(element);
    nextBoundary = undefined;
  });

  if (!endedWithBarline || measures.length === 0) {
    closeMeasure({ synthetic: true });
  }

  return { line, measures, inlineLayers };
}

function beatLastX(measure: AnalyzedMeasure | undefined, beat: number): number | undefined {
  const items = measure?.beats[beat];
  return items?.[items.length - 1]?.localX;
}

/**
 * Lay out a voice group using the original renderer's two observed spacing units.
 * Voices share measure and beat starts, while their notes remain left-aligned
 * inside each beat.
 */
export function layoutVoiceGroup(group: VoiceGroup, startX: number): VoiceGroupLayout {
  const analyzed = group.voices.map(analyzeLine);
  const lineLayouts: LineLayout[] = analyzed.map(({ line }) => ({
    line,
    elements: [],
    barlines: [],
    inlineLayers: [],
    xByElement: new Map(),
  }));
  const measureCount = Math.max(0, ...analyzed.map(({ measures }) => measures.length));
  let measureStart = startX;
  let endX = startX;

  for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
    const beatCount = Math.max(
      0,
      ...analyzed.map(({ measures }) => measures[measureIndex]?.beats.length ?? 0),
    );
    const beatStarts: number[] = [];
    const beatLastPositions: number[] = [];
    let nextBeatStart = 0;

    for (let beatIndex = 0; beatIndex < beatCount; beatIndex += 1) {
      beatStarts.push(nextBeatStart);
      const last = Math.max(
        0,
        ...analyzed.map(({ measures }) =>
          beatLastX(measures[measureIndex], beatIndex) ?? 0
        ),
      );
      beatLastPositions.push(last);
      nextBeatStart += last + PLAIN_NOTE_STEP;
    }

    const lastBeat = beatCount - 1;
    const barRelativeX = beatCount === 0
      ? 0
      : (beatStarts[lastBeat] ?? 0) + (beatLastPositions[lastBeat] ?? 0) + BARLINE_GAP;
    const barX = measureStart + barRelativeX;

    analyzed.forEach((analysis, lineIndex) => {
      const output = lineLayouts[lineIndex];
      const measure = analysis.measures[measureIndex];
      if (output === undefined || measure === undefined) return;
      measure.beats.forEach((items, beatIndex) => {
        const beatStart = beatStarts[beatIndex] ?? 0;
        items.forEach((item) => {
          const x = measureStart + beatStart + item.localX;
          output.elements.push({
            element: item.element,
            elementIndex: item.elementIndex,
            measure: measureIndex,
            beat: beatIndex,
            x,
          });
          output.xByElement.set(item.elementIndex, x);
        });
      });
      const barline = measure.barline;
      output.barlines.push({
        measure: measureIndex,
        synthetic: barline.synthetic,
        x: barX,
        ...(barline.element === undefined ? {} : { element: barline.element }),
        ...(barline.elementIndex === undefined ? {} : { elementIndex: barline.elementIndex }),
      });
      if (barline.element !== undefined && barline.elementIndex !== undefined) {
        output.elements.push({
          element: barline.element,
          elementIndex: barline.elementIndex,
          measure: measureIndex,
          x: barX,
        });
        output.xByElement.set(barline.elementIndex, barX);
      }
    });

    const closures = analyzed
      .map(({ measures }) => measures[measureIndex]?.barline.element)
      .filter((barline): barline is BarlineElement => barline !== undefined);
    const zeroWidthHiddenBar = beatCount === 0 &&
      closures.length > 0 &&
      closures.every(({ type }) => type === "hidden");
    endX = barX;
    if (!zeroWidthHiddenBar) measureStart = barX + BARLINE_GAP;
  }

  analyzed.forEach((analysis, lineIndex) => {
    const output = lineLayouts[lineIndex];
    if (output === undefined) return;
    analysis.inlineLayers.forEach(({ element, elementIndex }) => {
      const next = output.elements
        .filter((positioned) => positioned.elementIndex > elementIndex)
        .sort((left, right) => left.elementIndex - right.elementIndex)[0];
      output.inlineLayers.push({
        element,
        elementIndex,
        x: next?.x ?? output.barlines[output.barlines.length - 1]?.x ?? startX,
      });
    });
    output.elements.sort((left, right) => left.elementIndex - right.elementIndex);
  });

  return { lines: lineLayouts, endX };
}
