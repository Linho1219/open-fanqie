import type { Mark, MusicElement, NoteElement, SustainElement } from './types'

export type TimedElement = NoteElement | SustainElement

export function isTimedElement(element: MusicElement): element is TimedElement {
  return element.kind === 'note' || element.kind === 'sustain'
}

export function durationInQuarterNotes(element: TimedElement): number {
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

export function tupletScale(mark: Mark): number | undefined {
  if (mark.type !== 'tuplet') return undefined
  const count = Number(mark.caption)
  if (!Number.isInteger(count) || count < 2) return undefined
  return 2 ** Math.floor(Math.log2(count - 1)) / count
}

export function legacyPlaybackTime(element: TimedElement, mark?: Mark): number {
  const scale = mark === undefined ? 1 : (tupletScale(mark) ?? 1)
  return Number((durationInQuarterNotes(element) * scale).toFixed(2))
}
