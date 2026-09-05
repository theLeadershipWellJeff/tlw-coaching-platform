/**
 * Assessment-360 extraction entry point: PDF bytes → validated structured data.
 *
 * Pure (no database, no storage) so it can run against a fixture report from a
 * script. The pipeline (lib/documents/pipeline.ts) wraps it with persistence.
 *
 * Outcome shape mirrors client_documents.extraction_status:
 *  - complete    — structured_data is safe to surface;
 *  - unsupported — the layout is not one the parser is calibrated for;
 *  - failed      — parse error, cross-check disagreement, or validation error.
 */
import { readPage, type PageData } from '../geometry'
import { fingerprintAssessment360 } from './fingerprint'
import { ParseError, parseAssessment360 } from './parse'
import { computeDevelopmentCandidates, type TargetWeights } from './targets'
import type { Assessment360Data } from './types'
import { validateAssessment360 } from './validate'

export type ExtractionOutcome =
  | {
      status: 'complete'
      data: Assessment360Data
      extractedText: string
      formatVersion: string
      warnings: string[]
      /** Present for the caller's own assertions only — MUST NOT be persisted. */
      raterNames: string[]
    }
  | { status: 'unsupported'; formatVersion: string; error: string }
  | { status: 'failed'; formatVersion: string; error: string; section?: string }

export async function readAllPages(pdfBytes: Uint8Array): Promise<PageData[]> {
  const { getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(pdfBytes)
  const pages: PageData[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    pages.push(await readPage(page, i))
  }
  return pages
}

export async function extractAssessment360(
  pdfBytes: Uint8Array,
  opts: { weights?: TargetWeights } = {}
): Promise<ExtractionOutcome> {
  let pages: PageData[]
  try {
    pages = await readAllPages(pdfBytes)
  } catch (e) {
    return { status: 'failed', formatVersion: 'unknown', error: `Could not read the PDF: ${e instanceof Error ? e.message : String(e)}` }
  }
  const fp = fingerprintAssessment360(pages)
  if (!fp.supported) {
    return {
      status: 'unsupported',
      formatVersion: fp.version,
      error: `Unrecognised report layout — missing: ${fp.missing.join('; ')}.`,
    }
  }
  try {
    const parsed = parseAssessment360(pages, { formatVersion: fp.version })
    const data: Assessment360Data = {
      ...parsed.data,
      development_candidates: computeDevelopmentCandidates(parsed.data.competency_rankings, parsed.data.importance, opts.weights),
    }
    const v = validateAssessment360(data, parsed.raterNames, parsed.extractedText)
    if (!v.ok) return { status: 'failed', formatVersion: fp.version, error: v.errors.join(' | ') }
    return {
      status: 'complete',
      data,
      extractedText: parsed.extractedText,
      formatVersion: fp.version,
      warnings: [...v.warnings, ...parsed.notes],
      raterNames: parsed.raterNames,
    }
  } catch (e) {
    if (e instanceof ParseError) return { status: 'failed', formatVersion: fp.version, error: e.message, section: e.section }
    return { status: 'failed', formatVersion: fp.version, error: e instanceof Error ? e.message : String(e) }
  }
}

export type { Assessment360Data } from './types'
export { namesMatch } from './validate'
export { compareAssessments } from './compare'
