import type { NoteElement } from './types'

export const GRACE_NOTE_WIDTH = 7
export const GRACE_ACCIDENTAL_NOTE_WIDTH = 12
export const GRACE_ACCIDENTAL_INSET = 5

export interface GraceMetrics {
  positions: number[]
  width: number
}

export function graceNoteWidth(note: NoteElement): number {
  return note.accidental === undefined ? GRACE_NOTE_WIDTH : GRACE_ACCIDENTAL_NOTE_WIDTH
}

/** Positions grace-note digits within their shared horizontal reservation. */
export function graceMetrics(notes: readonly NoteElement[]): GraceMetrics {
  let cursor = 0
  const positions = notes.map((note) => {
    const width = graceNoteWidth(note)
    const noteX = cursor + (note.accidental === undefined ? 0 : GRACE_ACCIDENTAL_INSET)
    cursor += width
    return noteX
  })
  return { positions, width: cursor }
}

export function graceWidth(notes: readonly NoteElement[] | undefined): number {
  return notes === undefined ? 0 : graceMetrics(notes).width
}
