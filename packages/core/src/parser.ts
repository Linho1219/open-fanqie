import type {
  Accidental,
  BarlineElement,
  BarlineType,
  BeatBoundaryElement,
  Diagnostic,
  InlineLayerElement,
  LyricLine,
  LyricSyllable,
  Mark,
  Metadata,
  Meter,
  MusicElement,
  NoteElement,
  ScoreDocument,
  ScoreLine,
  ScorePage,
  SourceLocation,
  SustainElement,
  VoiceGroup,
} from './types'

const KNOWN_NOTE_COMMANDS = new Set([
  'zkh',
  'ykh',
  'ppp',
  'pp',
  'p',
  'mp',
  'mf',
  'f',
  'ff',
  'fff',
  'cresc',
  'dim',
  'sf',
  'fp',
  'sfp',
  'atempo',
  'rit',
  'yc',
  'ycy',
  'bc',
  'zy',
  'dy',
  'hx',
  'shy',
  'xhy',
  'sby',
  'xby',
  'cy',
  'tr',
])

const KNOWN_BARLINE_COMMANDS = new Set(['fine', 'dc', 'ds', 'ty', 'hs', 'sbf'])

interface ParseContext {
  diagnostics: Diagnostic[]
  line: number
  lineOffset: number
  columnOffset: number
}

interface OpenMark {
  type: Mark['type']
  start: number
  level: number
  sourceIndex: number
  caption?: string
  openEnd?: boolean
  continuationFromPrevious?: boolean
}

interface ParsedMusicLine {
  elements: MusicElement[]
  marks: Mark[]
  carriedCurvedMarks: OpenMark[]
}

function location(context: ParseContext, index: number, length = 1): SourceLocation {
  return {
    line: context.line,
    column: context.columnOffset + index + 1,
    offset: context.lineOffset + context.columnOffset + index,
    length,
  }
}

function report(
  context: ParseContext,
  code: string,
  message: string,
  index: number,
  length = 1,
  severity: Diagnostic['severity'] = 'warning',
): void {
  context.diagnostics.push({
    severity,
    code,
    message,
    source: location(context, index, length),
  })
}

function parseMeter(raw: string, parenthesized: boolean): Meter | undefined {
  const match = raw.match(/(\d+)\s*\/\s*(\d+)/)
  if (match === null) return undefined
  return {
    numerator: Number(match[1]),
    denominator: Number(match[2]),
    parenthesized,
  }
}

function isNoteDigit(
  value: string,
): value is '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' {
  return /^[0-9]$/.test(value)
}

function notePitch(value: string): NoteElement['pitch'] {
  if (value === '8') return 0
  return Number(value) as NoteElement['pitch']
}

function createNote(
  source: string,
  start: number,
  context: ParseContext,
  defaultDuration: number,
): { note: NoteElement; next: number } {
  const digit = source[start] ?? '0'
  let cursor = start + 1
  let octave = 0
  let duration = defaultDuration
  let dots = 0
  let accidental: Accidental | undefined

  while (cursor < source.length) {
    const modifier = source[cursor]
    if (modifier === "'") octave += 1
    else if (modifier === ',') octave -= 1
    else if (modifier === '/') duration *= 2
    else if (modifier === '.') dots += 1
    else if (modifier === '#') accidental = 'sharp'
    else if (modifier === '$') accidental = 'flat'
    else if (modifier === '=') accidental = 'natural'
    else break
    cursor += 1
  }

  const pitch = notePitch(digit)
  const note: NoteElement = {
    kind: 'note',
    pitch,
    sound: pitch === 0 ? 'rest' : pitch === 9 ? 'rhythm' : 'note',
    hidden: digit === '8',
    octave,
    duration,
    dots,
    ornaments: [],
    code: source.slice(start, cursor),
    source: location(context, start, cursor - start),
  }
  if (accidental !== undefined) note.accidental = accidental
  return { note, next: cursor }
}

function parseGraceNotes(
  source: string,
  context: ParseContext,
  sourceIndex: number,
): NoteElement[] {
  const notes: NoteElement[] = []
  let cursor = 0
  while (cursor < source.length) {
    const char = source[cursor]
    if (char !== undefined && isNoteDigit(char) && char !== '8') {
      const parsed = createNote(
        source,
        cursor,
        {
          ...context,
          columnOffset: context.columnOffset + sourceIndex,
        },
        8,
      )
      notes.push(parsed.note)
      cursor = parsed.next
    } else {
      if (char !== undefined && !/\s/.test(char)) {
        report(
          { ...context, columnOffset: context.columnOffset + sourceIndex },
          'unsupported-grace-token',
          `Unsupported grace-note token '${char}'.`,
          cursor,
        )
      }
      cursor += 1
    }
  }
  return notes
}

function lastAttachableIndex(elements: MusicElement[]): number | undefined {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index]
    if (element?.kind === 'note' || element?.kind === 'sustain' || element?.kind === 'barline') {
      return index
    }
  }
  return undefined
}

function lastTimedIndex(elements: MusicElement[]): number | undefined {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index]
    if (element?.kind === 'note' || element?.kind === 'sustain') return index
  }
  return undefined
}

function appendModifier(element: NoteElement, modifier: string): boolean {
  if (modifier === "'") element.octave += 1
  else if (modifier === ',') element.octave -= 1
  else if (modifier === '/') element.duration *= 2
  else if (modifier === '.') element.dots += 1
  else if (modifier === '#') element.accidental = 'sharp'
  else if (modifier === '$') element.accidental = 'flat'
  else if (modifier === '=') element.accidental = 'natural'
  else return false
  element.code += modifier
  element.source.length += 1
  return true
}

function parseBarline(
  source: string,
  index: number,
  context: ParseContext,
): { barline: BarlineElement; next: number } | undefined {
  const candidates: Array<[string, BarlineType]> = [
    [':|:', 'repeat-both'],
    ['||/', 'double'],
    ['|:', 'repeat-start'],
    [':|', 'repeat-end'],
    ['||', 'end'],
    ['|/', 'hidden'],
    ['|*', 'invisible'],
    ['|', 'normal'],
  ]
  const found = candidates.find(([code]) => source.startsWith(code, index))
  if (found === undefined) return undefined
  const [code, type] = found
  return {
    barline: {
      kind: 'barline',
      type,
      ornaments: [],
      code,
      source: location(context, index, code.length),
    },
    next: index + code.length,
  }
}

function closeMark(
  open: OpenMark,
  end: number,
  sourceIndex: number,
  context: ParseContext,
  elements: MusicElement[],
): Mark {
  const mark: Mark = {
    type: open.type,
    start: open.start,
    end,
    level: open.level,
    source: location(context, open.sourceIndex, sourceIndex - open.sourceIndex + 1),
  }
  if (open.caption !== undefined) mark.caption = open.caption
  if (open.openEnd !== undefined) mark.openEnd = open.openEnd
  if (open.continuationFromPrevious !== undefined) {
    mark.continuationFromPrevious = open.continuationFromPrevious
  }
  if (mark.type === 'tuplet') {
    const count = elements
      .slice(open.start, end + 1)
      .filter((element) => element.kind === 'note').length
    mark.caption = String(count)
  }
  return mark
}

function parseMusicLine(
  source: string,
  context: ParseContext,
  carriedCurvedMarks: OpenMark[] = [],
  allowContinuation = false,
): ParsedMusicLine {
  const elements: MusicElement[] = []
  const marks: Mark[] = []
  const curvedMarks: OpenMark[] = []
  const queuedCurvedMarks: OpenMark[] = []
  const pendingCurvedMarks: OpenMark[] = []
  const dynamicMarks: OpenMark[] = []
  const voltaMarks: OpenMark[] = []
  const pendingCurvedCodes: string[] = []
  let cursor = 0
  let attachedCarriedMarks = false

  const activatePendingCurvedMarks = (): void => {
    curvedMarks.push(...pendingCurvedMarks.splice(0))
  }

  const attachQueuedCurvedMarks = (elementIndex: number): void => {
    queuedCurvedMarks.forEach((mark) => {
      mark.start = elementIndex
    })
    pendingCurvedMarks.push(...queuedCurvedMarks.splice(0))
  }

  const attachCarriedCurvedMarks = (elementIndex: number): void => {
    if (attachedCarriedMarks) return
    carriedCurvedMarks.forEach((mark) => {
      curvedMarks.push({
        ...mark,
        start: elementIndex,
        sourceIndex: 0,
        continuationFromPrevious: true,
      })
    })
    attachedCarriedMarks = true
  }

  while (cursor < source.length) {
    const char = source[cursor]
    if (char === undefined) break
    if (/\s/.test(char)) {
      cursor += 1
      continue
    }

    if (isNoteDigit(char)) {
      activatePendingCurvedMarks()
      const parsed = createNote(source, cursor, context, 4)
      if (pendingCurvedCodes.length > 0) {
        const insertion = pendingCurvedCodes.splice(0).join('')
        parsed.note.code = `${parsed.note.code.slice(0, 1)}${insertion}${parsed.note.code.slice(1)}`
      }
      elements.push(parsed.note)
      attachCarriedCurvedMarks(elements.length - 1)
      attachQueuedCurvedMarks(elements.length - 1)
      cursor = parsed.next
      continue
    }

    if (char === '-') {
      activatePendingCurvedMarks()
      const sustain: SustainElement = {
        kind: 'sustain',
        duration: 4,
        ornaments: [],
        code: '-',
        source: location(context, cursor),
      }
      if (pendingCurvedCodes.length > 0) sustain.code += pendingCurvedCodes.splice(0).join('')
      elements.push(sustain)
      attachCarriedCurvedMarks(elements.length - 1)
      attachQueuedCurvedMarks(elements.length - 1)
      cursor += 1
      continue
    }

    if (char === '|' || char === ':') {
      activatePendingCurvedMarks()
      const parsed = parseBarline(source, cursor, context)
      if (parsed === undefined) {
        report(context, 'invalid-barline', `Invalid barline starting with '${char}'.`, cursor)
        cursor += 1
      } else {
        elements.push(parsed.barline)
        cursor = parsed.next
      }
      continue
    }

    if (char === '~' || char === '^') {
      const attachIndex = lastAttachableIndex(elements)
      const attachable = attachIndex === undefined ? undefined : elements[attachIndex]
      if (
        attachable?.kind === 'note' ||
        attachable?.kind === 'sustain' ||
        attachable?.kind === 'barline'
      ) {
        attachable.code += char
      }
      const boundary: BeatBoundaryElement = {
        kind: 'beat-boundary',
        behavior: char === '~' ? 'join' : 'split',
        code: char,
        source: location(context, cursor),
      }
      elements.push(boundary)
      cursor += 1
      continue
    }

    if (char === '(') {
      activatePendingCurvedMarks()
      const tuplet = source[cursor + 1] === 'y'
      let next = cursor + (tuplet ? 2 : 1)
      while (source[next] === '+') next += 1
      const previousIndex = lastTimedIndex(elements)
      const previous = previousIndex === undefined ? undefined : elements[previousIndex]
      const code = tuplet ? '(ys' : '('
      let contentIndex = next
      while (/\s/.test(source[contentIndex] ?? '')) contentIndex += 1
      const startsAtPrevious =
        !tuplet &&
        source[contentIndex] === '-' &&
        (previous?.kind === 'note' || previous?.kind === 'sustain')
      if (startsAtPrevious) previous.code += code
      else pendingCurvedCodes.push(code)
      const open: OpenMark = {
        type: tuplet ? 'tuplet' : 'slur',
        start: startsAtPrevious && previousIndex !== undefined ? previousIndex : elements.length,
        level: next - cursor - (tuplet ? 2 : 1),
        sourceIndex: cursor,
      }
      if (startsAtPrevious) curvedMarks.push(open)
      else queuedCurvedMarks.push(open)
      cursor = next
      continue
    }

    if (char === ')') {
      const open = curvedMarks.pop() ?? pendingCurvedMarks.pop()
      const end = lastTimedIndex(elements)
      if (end !== undefined) {
        const attachable = elements[end]
        if (attachable?.kind === 'note' || attachable?.kind === 'sustain') attachable.code += ')'
      }
      if (open === undefined || end === undefined) {
        if (!allowContinuation) {
          report(context, 'unmatched-mark-end', "Unmatched ')' mark terminator.", cursor)
        }
      } else if (open.start !== end || open.continuationFromPrevious === true) {
        marks.push(closeMark(open, end, cursor, context, elements))
      }
      cursor += 1
      continue
    }

    if (char === '<' || char === '>') {
      let next = cursor + 1
      while (source[next] === '+') next += 1
      const previousIndex = lastAttachableIndex(elements)
      dynamicMarks.push({
        type: char === '<' ? 'crescendo' : 'decrescendo',
        start: previousIndex ?? elements.length,
        level: next - cursor - 1,
        sourceIndex: cursor,
      })
      cursor = next
      continue
    }

    if (char === '!') {
      const open = dynamicMarks.pop()
      const end = lastAttachableIndex(elements)
      if (open === undefined || end === undefined) {
        report(context, 'unmatched-dynamic-end', "Unmatched '!' dynamic terminator.", cursor)
      } else {
        const attachable = elements[end]
        if (
          attachable?.kind === 'note' ||
          attachable?.kind === 'sustain' ||
          attachable?.kind === 'barline'
        ) {
          attachable.code += '!'
        }
        marks.push(closeMark(open, end, cursor, context, elements))
      }
      cursor += 1
      continue
    }

    if (char === '[') {
      const attachIndex = lastAttachableIndex(elements)
      const attachable = attachIndex === undefined ? undefined : elements[attachIndex]
      if (attachable?.kind === 'note') {
        const end = source.indexOf(']', cursor + 1)
        if (end < 0) {
          report(context, 'unclosed-grace', "Grace-note block is missing ']'.", cursor)
          cursor += 1
          continue
        }
        const isAfter = source[cursor + 1] === 'h'
        const contentStart = cursor + (isAfter ? 2 : 1)
        const grace = parseGraceNotes(source.slice(contentStart, end), context, contentStart)
        if (isAfter) attachable.graceAfter = grace
        else attachable.graceBefore = grace
        cursor = end + 1
        continue
      }

      if (attachable?.kind === 'barline') {
        let next = cursor + 1
        let openEnd = false
        if (source[next] === '/') {
          openEnd = true
          next += 1
        }
        const levelStart = next
        while (source[next] === '+') next += 1
        const level = next - levelStart
        while (/\s/.test(source[next] ?? '')) next += 1
        let caption: string | undefined
        if (source[next] === '"') {
          const quoteEnd = source.indexOf('"', next + 1)
          if (quoteEnd < 0) {
            report(
              context,
              'unclosed-volta-caption',
              'Volta caption is missing a closing quote.',
              next,
            )
          } else {
            caption = source.slice(next + 1, quoteEnd)
            next = quoteEnd + 1
          }
        }
        const open: OpenMark = {
          type: 'volta',
          start: attachIndex ?? 0,
          level,
          sourceIndex: cursor,
          openEnd,
        }
        if (caption !== undefined) open.caption = caption
        attachable.code += `[${openEnd ? '/' : ''}${'+'.repeat(level)}${caption === undefined ? '' : `'${caption}'`}`
        voltaMarks.push(open)
        cursor = next
        continue
      }

      report(context, 'invalid-bracket', "'[' must follow a note or barline.", cursor)
      cursor += 1
      continue
    }

    if (char === ']') {
      const open = voltaMarks.pop()
      const end = lastAttachableIndex(elements)
      if (open === undefined || end === undefined) {
        report(context, 'unmatched-volta-end', "Unmatched ']' volta terminator.", cursor)
      } else {
        if (source[cursor + 1] === '/') open.openEnd = true
        const attachable = elements[end]
        if (attachable?.kind === 'barline') {
          attachable.code += `]${source[cursor + 1] === '/' ? '/' : ''}`
        }
        marks.push(closeMark(open, end, cursor, context, elements))
      }
      cursor += source[cursor + 1] === '/' ? 2 : 1
      continue
    }

    if (char === '{') {
      const end = source.indexOf('}', cursor + 1)
      if (end < 0) {
        report(context, 'unclosed-inline-layer', "Inline voice block is missing '}'.", cursor)
        cursor += 1
        continue
      }
      const inner = source.slice(cursor + 1, end)
      const layerMatch = inner.match(/^\s*(?:(bz|dsb)\b|\|)/)
      if (layerMatch === null) {
        report(
          context,
          'invalid-inline-layer',
          "Inline block must start with 'bz', 'dsb', or the '|' voice shorthand.",
          cursor,
          end - cursor + 1,
        )
        cursor = end + 1
        continue
      }
      const role = layerMatch[1] === 'bz' ? 'accompaniment' : 'voice'
      const musicStart = (layerMatch.index ?? 0) + layerMatch[0].length
      const parsed = parseMusicLine(inner.slice(musicStart), {
        ...context,
        columnOffset: context.columnOffset + cursor + 1 + musicStart,
      })
      const layer: InlineLayerElement = {
        kind: 'inline-layer',
        role,
        elements: parsed.elements,
        marks: parsed.marks,
        code: source.slice(cursor, end + 1),
        source: location(context, cursor, end - cursor + 1),
      }
      elements.push(layer)
      cursor = end + 1
      continue
    }

    if (char === '&') {
      const commandMatch = source.slice(cursor).match(/^&(?:a\s+tempo|[a-z]+)(\+*)/)
      if (commandMatch === null) {
        report(context, 'invalid-command', "Invalid '&' command.", cursor)
        cursor += 1
        continue
      }
      const rawName = commandMatch[0].slice(1).replace(/\++$/, '')
      const name = rawName.replace(/\s+/g, '')
      const pluses = commandMatch[1]?.length ?? 0
      const attachIndex = lastAttachableIndex(elements)
      const attachable = attachIndex === undefined ? undefined : elements[attachIndex]
      const known =
        attachable?.kind === 'barline'
          ? KNOWN_BARLINE_COMMANDS.has(name)
          : KNOWN_NOTE_COMMANDS.has(name)
      if (
        attachable?.kind === 'note' ||
        attachable?.kind === 'sustain' ||
        attachable?.kind === 'barline'
      ) {
        attachable.ornaments.push({ name, level: pluses })
        attachable.code += commandMatch[0]
        if (!known) {
          report(
            context,
            'unknown-command',
            `Unknown command '&${rawName}'.`,
            cursor,
            commandMatch[0].length,
          )
        }
      } else {
        report(
          context,
          'orphan-command',
          `Command '&${rawName}' has no preceding note or barline.`,
          cursor,
          commandMatch[0].length,
        )
      }
      cursor += commandMatch[0].length
      continue
    }

    if (char === '"') {
      const end = source.indexOf('"', cursor + 1)
      if (end < 0) {
        report(context, 'unclosed-annotation', 'Annotation is missing a closing quote.', cursor)
        cursor += 1
        continue
      }
      const value = source.slice(cursor + 1, end)
      const attachIndex = lastAttachableIndex(elements)
      const attachable = attachIndex === undefined ? undefined : elements[attachIndex]
      if (attachable?.kind === 'note') {
        attachable.annotation = value
      } else if (attachable?.kind === 'barline') {
        const meter = parseMeter(value, false)
        if (value.trimStart().startsWith('p:') && meter !== undefined) {
          attachable.temporaryMeter = meter
        } else {
          attachable.annotation = value
        }
      } else {
        report(
          context,
          'orphan-annotation',
          'Annotation must follow a note or barline.',
          cursor,
          end - cursor + 1,
        )
      }
      cursor = end + 1
      continue
    }

    const attachIndex = lastAttachableIndex(elements)
    const attachable = attachIndex === undefined ? undefined : elements[attachIndex]
    if (attachable?.kind === 'note' && appendModifier(attachable, char)) {
      cursor += 1
      continue
    }

    if (!isCjkCharacter(char)) {
      report(context, 'unsupported-token', `Unsupported music token '${char}'.`, cursor)
    }
    cursor += 1
  }

  activatePendingCurvedMarks()
  for (const open of queuedCurvedMarks) {
    report(context, 'unclosed-mark', `Unclosed '${open.type}' mark.`, open.sourceIndex)
  }
  const carriedOutput: OpenMark[] = []
  const lineEnd = lastTimedIndex(elements)
  if (allowContinuation && lineEnd !== undefined) {
    curvedMarks.forEach((open) => {
      const mark = closeMark(open, lineEnd, source.length, context, elements)
      mark.continuationToNext = true
      marks.push(mark)
      carriedOutput.push({
        type: open.type,
        start: 0,
        level: open.level,
        sourceIndex: open.sourceIndex,
        ...(open.caption === undefined ? {} : { caption: open.caption }),
        ...(open.openEnd === undefined ? {} : { openEnd: open.openEnd }),
      })
    })
  } else {
    for (const open of curvedMarks) {
      report(context, 'unclosed-mark', `Unclosed '${open.type}' mark.`, open.sourceIndex)
    }
  }
  for (const open of dynamicMarks) {
    report(context, 'unclosed-dynamic', `Unclosed '${open.type}' mark.`, open.sourceIndex)
  }
  for (const open of voltaMarks) {
    report(context, 'unclosed-volta', 'Unclosed volta mark.', open.sourceIndex)
  }

  return { elements, marks, carriedCurvedMarks: carriedOutput }
}

function isCjkCharacter(char: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}0-9]/u.test(char)
}

function isPunctuation(char: string): boolean {
  return /[，。！？；：,.!?;:]/.test(char)
}

function parseLyrics(source: string, context: ParseContext): LyricLine {
  const syllables: LyricSyllable[] = []
  let annotation: string | undefined
  let joinNext = false
  let cursor = 0

  const push = (text: string, start: number, end: number): void => {
    if (joinNext && syllables.length > 0) {
      const previous = syllables[syllables.length - 1]
      if (previous !== undefined) {
        previous.text += text
        const previousStart = previous.source.offset - context.lineOffset - context.columnOffset
        previous.source.length = end - previousStart
      }
      joinNext = false
      return
    }
    syllables.push({
      text,
      source: location(context, start, end - start),
    })
    joinNext = false
  }

  while (cursor < source.length) {
    const char = source[cursor]
    if (char === undefined) break
    if (/\s/.test(char) || char === '/') {
      cursor += 1
      continue
    }
    if (char === '~') {
      joinNext = true
      cursor += 1
      continue
    }
    if (char === '@') {
      push('', cursor, cursor + 1)
      cursor += 1
      continue
    }
    if (char === '"') {
      const end = source.indexOf('"', cursor + 1)
      if (end < 0) {
        report(
          context,
          'unclosed-lyric-annotation',
          'Lyric annotation is missing a closing quote.',
          cursor,
        )
        cursor += 1
      } else {
        const value = source.slice(cursor + 1, end).replaceAll('_', ' ')
        if (syllables.length === 0 && annotation === undefined) annotation = value
        else push(value, cursor, end + 1)
        cursor = end + 1
      }
      continue
    }
    if (isCjkCharacter(char)) {
      push(char, cursor, cursor + 1)
      cursor += 1
      continue
    }
    if (isPunctuation(char)) {
      if (joinNext) {
        push(char, cursor, cursor + 1)
        cursor += 1
        continue
      }
      const previous = syllables[syllables.length - 1]
      if (previous === undefined) push(char, cursor, cursor + 1)
      else {
        previous.trailingPunctuation = `${previous.trailingPunctuation ?? ''}${char}`
        previous.source.length =
          cursor + 1 - (previous.source.offset - context.lineOffset - context.columnOffset)
      }
      cursor += 1
      continue
    }

    const start = cursor
    while (cursor < source.length) {
      const value = source[cursor]
      if (
        value === undefined ||
        /\s/.test(value) ||
        value === '/' ||
        value === '@' ||
        value === '~' ||
        value === '"' ||
        isCjkCharacter(value) ||
        isPunctuation(value)
      )
        break
      cursor += 1
    }
    push(source.slice(start, cursor), start, cursor)
  }

  const lyric: LyricLine = {
    syllables,
    source: location(context, 0, source.length),
  }
  if (annotation !== undefined) lyric.annotation = annotation
  return lyric
}

function metadataLineLocation(line: number, lineOffset: number, length: number): SourceLocation {
  return { line, column: 1, offset: lineOffset, length }
}

function parseMetadata(
  metadata: Metadata,
  prefix: string,
  value: string,
  context: ParseContext,
): boolean {
  if (prefix === 'V') {
    if (metadata.version !== undefined) {
      report(
        context,
        'duplicate-version',
        'The version header may only appear once.',
        0,
        value.length,
      )
    }
    metadata.version = value
    return true
  }
  if (prefix === 'B') {
    metadata.titles.push(value)
    return true
  }
  if (prefix === 'Z') {
    metadata.authors.push(value)
    return true
  }
  if (prefix === 'D') {
    if (!/^[A-G][#$]?$/.test(value)) {
      report(context, 'invalid-mode', `Invalid mode '${value}'.`, 0, value.length, 'error')
    } else {
      metadata.mode = value
    }
    return true
  }
  if (prefix === 'P') {
    const matches = [...value.matchAll(/(\()?\s*(\d+)\s*\/\s*(\d+)\s*(\))?/g)]
    if (matches.length === 0) {
      report(context, 'invalid-meter', `Invalid meter '${value}'.`, 0, value.length, 'error')
    } else {
      for (const match of matches) {
        metadata.meters.push({
          numerator: Number(match[2]),
          denominator: Number(match[3]),
          parenthesized: match[1] === '(' && match[4] === ')',
        })
      }
    }
    return true
  }
  if (prefix === 'J') {
    metadata.tempos.push(/^\d+(?:\.\d+)?$/.test(value) ? Number(value) : value)
    return true
  }
  if (prefix === 'Y') {
    metadata.instruments.push(
      ...value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    )
    return true
  }
  if (prefix === 'S') {
    metadata.remarks.push(value)
    return true
  }
  return false
}

/** Parse a Fanqie v1 score into a source-located document tree. */
export function parse(input: string): ScoreDocument {
  const source = input.replaceAll('&hh&', '\n').replace(/\r\n?/g, '\n')
  const diagnostics: Diagnostic[] = []
  const metadata: Metadata = {
    titles: [],
    authors: [],
    meters: [],
    tempos: [],
    instruments: [],
    remarks: [],
  }
  const pages: ScorePage[] = [{ index: 0, groups: [] }]
  let page = pages[0] as ScorePage
  let currentGroup: VoiceGroup | undefined
  const continuationsByVoice = new Map<number, OpenMark[]>()
  const continuationLinesByVoice = new Map<number, ScoreLine>()
  let previousMusicVoice: number | undefined
  let lineOffset = 0

  const discardContinuations = (): void => {
    continuationLinesByVoice.forEach((scoreLine) => {
      scoreLine.marks = scoreLine.marks.filter(
        ({ continuationToNext }) => continuationToNext !== true,
      )
    })
    continuationLinesByVoice.clear()
    continuationsByVoice.clear()
  }

  const reportDanglingContinuations = (line: number, offset: number): void => {
    continuationsByVoice.forEach((marks) => {
      marks.forEach((mark) => {
        diagnostics.push({
          severity: 'warning',
          code: 'unclosed-mark',
          message: `Unclosed '${mark.type}' mark.`,
          source: metadataLineLocation(line, offset, 0),
        })
      })
    })
  }

  const lines = source.split('\n')
  lines.forEach((rawLine, lineIndex) => {
    const lineNumber = lineIndex + 1
    const trimmed = rawLine.trim()
    if (trimmed === '' || rawLine.trimStart().startsWith('#')) {
      lineOffset += rawLine.length + 1
      return
    }
    if (trimmed === '[fenye]') {
      page = { index: pages.length, groups: [] }
      pages.push(page)
      currentGroup = undefined
      lineOffset += rawLine.length + 1
      return
    }

    const prefixMatch = rawLine.match(/^\s*([A-Z])(\d*)(?:"([^"]+)")?\s*:/)
    if (prefixMatch === null) {
      diagnostics.push({
        severity: 'error',
        code: 'missing-prefix',
        message: 'Every non-comment line must start with a header, Q, or C prefix.',
        source: metadataLineLocation(lineNumber, lineOffset, rawLine.length),
      })
      lineOffset += rawLine.length + 1
      return
    }

    const prefix = prefixMatch[1] ?? ''
    const numberText = prefixMatch[2] ?? ''
    const caption = prefixMatch[3]
    const valueStart = prefixMatch[0].length
    const rawValue = rawLine.slice(valueStart)
    const leadingWhitespace = rawValue.length - rawValue.trimStart().length
    const value = rawValue.trim()
    const valueColumn = valueStart + leadingWhitespace
    const context: ParseContext = {
      diagnostics,
      line: lineNumber,
      lineOffset,
      columnOffset: valueColumn,
    }

    if (
      numberText === '' &&
      caption === undefined &&
      parseMetadata(metadata, prefix, value, context)
    ) {
      lineOffset += rawLine.length + 1
      return
    }

    if (prefix === 'Q') {
      const voice = numberText === '' ? 1 : Number(numberText)
      if (previousMusicVoice !== undefined && previousMusicVoice !== voice) {
        discardContinuations()
      }
      if (voice <= 1 || currentGroup === undefined) {
        currentGroup = { index: page.groups.length, voices: [] }
        page.groups.push(currentGroup)
      }
      if (currentGroup.voices.some((line) => line.voice === voice)) {
        report(
          context,
          'duplicate-voice',
          `Voice ${voice} already exists in this group.`,
          0,
          value.length,
        )
      }
      const parsed = parseMusicLine(value, context, continuationsByVoice.get(voice) ?? [], true)
      const scoreLine: ScoreLine = {
        voice,
        elements: parsed.elements,
        marks: parsed.marks,
        lyrics: [],
        raw: value,
        source: location(context, 0, value.length),
      }
      if (caption !== undefined) scoreLine.caption = caption
      currentGroup.voices.push(scoreLine)
      if (parsed.carriedCurvedMarks.length === 0) {
        continuationsByVoice.delete(voice)
        continuationLinesByVoice.delete(voice)
      } else {
        continuationsByVoice.set(voice, parsed.carriedCurvedMarks)
        continuationLinesByVoice.set(voice, scoreLine)
      }
      previousMusicVoice = voice
      lineOffset += rawLine.length + 1
      return
    }

    if (prefix === 'C') {
      const candidates = currentGroup?.voices ?? []
      const scoreLine = candidates[candidates.length - 1]
      if (scoreLine === undefined) {
        report(
          context,
          'orphan-lyrics',
          'Lyrics must follow a matching Q line.',
          0,
          value.length,
          'error',
        )
      } else {
        scoreLine.lyrics.push(parseLyrics(value, context))
      }
      lineOffset += rawLine.length + 1
      return
    }

    report(context, 'unknown-prefix', `Unknown prefix '${prefix}'.`, 0, value.length)
    lineOffset += rawLine.length + 1
  })

  reportDanglingContinuations(lines.length, source.length)
  discardContinuations()

  return { source, metadata, pages, diagnostics }
}
