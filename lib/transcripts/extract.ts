/**
 * Turn an uploaded transcript file — whatever format it arrived in — into the
 * plain markdown/text the ingest pipeline expects. Supported:
 *
 *   .md / .markdown / .txt / .text  — used as-is (UTF-8)
 *   .vtt                            — WebVTT captions (Zoom, Teams exports)
 *   .srt                            — SubRip captions
 *   .docx                           — Word (Plaud "export to Word", etc.)
 *   .pdf                            — PDF exports
 *
 * Caption formats are flattened to "Speaker: text" lines (cue ids, timestamps
 * and styling tags dropped) so the parser's speaker-separation detection and
 * the scoring metrics still work. Unknown extensions fail loud with the list
 * of supported formats — never a silent empty transcript.
 */

export const SUPPORTED_TRANSCRIPT_EXTENSIONS = [
  'md',
  'markdown',
  'txt',
  'text',
  'vtt',
  'srt',
  'docx',
  'pdf',
] as const

/** The <input accept=…> string for the upload UI — keep in sync with the list above. */
export const TRANSCRIPT_FILE_ACCEPT = '.md,.markdown,.txt,.text,.vtt,.srt,.docx,.pdf'

function extensionOf(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim())
  return m ? m[1].toLowerCase() : ''
}

function decodeText(buf: Buffer): string {
  // Strip a UTF-8 BOM; ingest canonicalizes line endings later.
  return buf.toString('utf-8').replace(/^﻿/, '')
}

const TIMESTAMP_LINE = /^\d{1,2}:\d{2}(:\d{2})?[.,]\d{3}\s+--?>\s+\d{1,2}:\d{2}(:\d{2})?[.,]\d{3}/

/**
 * Flatten WebVTT/SRT captions into speaker-separated lines. Consecutive cues
 * from the same speaker merge into one line so the result reads like a
 * transcript, not a caption stream.
 */
function captionsToTranscript(raw: string): string {
  const lines = decodeAndSplit(raw)
  const utterances: { speaker: string | null; text: string }[] = []

  for (let line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (/^WEBVTT/i.test(trimmed)) continue
    if (/^(NOTE|STYLE|REGION)\b/.test(trimmed)) continue
    if (/^\d+$/.test(trimmed)) continue // SRT sequence number / VTT numeric cue id
    if (TIMESTAMP_LINE.test(trimmed)) continue

    // <v Speaker Name>text</v> (VTT voice tag) or a leading "Name: text".
    let speaker: string | null = null
    let text = trimmed
    const voice = /^<v(?:\.[^\s>]*)?\s+([^>]+)>([\s\S]*)$/i.exec(trimmed)
    if (voice) {
      speaker = voice[1].trim()
      text = voice[2]
    } else {
      const named = /^([A-Za-z][\w.'\- ]{0,60}?):\s+(.*)$/.exec(trimmed)
      if (named) {
        speaker = named[1].trim()
        text = named[2]
      }
    }
    text = text
      .replace(/<[^>]+>/g, '') // remaining styling/voice tags
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) continue

    const last = utterances[utterances.length - 1]
    if (last && (speaker === null || last.speaker === speaker)) {
      // Continuation of the current utterance (captions split mid-sentence).
      last.text += ' ' + text
    } else {
      utterances.push({ speaker, text })
    }
  }

  return utterances
    .map((u) => (u.speaker ? `${u.speaker}: ${u.text}` : u.text))
    .join('\n\n')
}

function decodeAndSplit(raw: string): string[] {
  return raw.replace(/^﻿/, '').split(/\r\n|\r|\n/)
}

async function docxToText(buf: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer: buf })
  return result.value || ''
}

async function pdfToText(buf: Buffer): Promise<string> {
  const { extractText } = await import('unpdf')
  const { text } = await extractText(new Uint8Array(buf), { mergePages: true })
  return (Array.isArray(text) ? text.join('\n\n') : text) || ''
}

/**
 * Extract transcript text from an uploaded file. Throws a coach-readable
 * message on an unsupported extension or an unreadable/empty file.
 */
export async function extractTranscriptText(filename: string, buf: Buffer): Promise<string> {
  const ext = extensionOf(filename)
  let text: string

  switch (ext) {
    case 'md':
    case 'markdown':
    case 'txt':
    case 'text':
      text = decodeText(buf)
      break
    case 'vtt':
    case 'srt':
      text = captionsToTranscript(decodeText(buf))
      break
    case 'docx':
      try {
        text = await docxToText(buf)
      } catch {
        throw new Error(`Couldn't read "${filename}" — the Word file may be corrupted or not a .docx.`)
      }
      break
    case 'pdf':
      try {
        text = await pdfToText(buf)
      } catch {
        throw new Error(`Couldn't read "${filename}" — the PDF may be corrupted or password-protected.`)
      }
      break
    default:
      throw new Error(
        `"${filename}" isn't a supported format. Use ${SUPPORTED_TRANSCRIPT_EXTENSIONS.map((e) => '.' + e).join(', ')}.`
      )
  }

  if (!text.trim()) {
    throw new Error(`"${filename}" contains no readable text.`)
  }
  return text
}
