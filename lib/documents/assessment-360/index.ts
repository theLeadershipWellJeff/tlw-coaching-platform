/**
 * Assessment-360 extraction entry point: PDF bytes → validated structured data.
 *
 * Pure (no database, no storage) so it can run against a fixture report from a
 * script. The pipeline (lib/documents/pipeline.ts) wraps it with persistence.
 *
 * Outcome shape mirrors client_documents.extraction_status:
 *  - complete    — structured_data is safe to surface;
 *  - unsupported — the layout is not one the parser is calibrated for (the
 *                  initial and the follow-up Extraordinary Leader reports are);
 *  - failed      — parse error, cross-check disagreement, or validation error.
 */
import { readPage, type PageData } from '../geometry'
import { fingerprintAssessment360 } from './fingerprint'
import { ParseError, parseAssessment360, type CalibrationRecord } from './parse'
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
      /** Per-chart text-vs-geometry residuals (validation harness). */
      calibration: CalibrationRecord[]
      /** Present for the caller's own assertions only — MUST NOT be persisted. */
      raterNames: string[]
    }
  | { status: 'unsupported'; formatVersion: string; error: string }
  | { status: 'failed'; formatVersion: string; error: string; section?: string }

export async function readAllPages(pdfBytes: Uint8Array): Promise<PageData[]> {
  const { getDocumentProxy } = await import('unpdf')
  // pdf.js transfers (detaches) the buffer it is given, so a caller that runs
  // detect + extract on the same bytes would find them gone on the second
  // call ("Cannot transfer object of unsupported type"). Work on a copy.
  const pdf = await getDocumentProxy(new Uint8Array(pdfBytes))
  const pages: PageData[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    pages.push(await readPage(page, i))
  }
  return pages
}

/**
 * Cheap layout check without parsing: is this PDF a 360 report the parser
 * supports? Used by the pipeline to recognise a 360 that a client filed as an
 * "other document" — the file, not the picker, decides how it is read.
 */
export async function detectAssessment360(pdfBytes: Uint8Array): Promise<{ supported: boolean; version: string }> {
  try {
    const pages = await readAllPages(pdfBytes)
    const fp = fingerprintAssessment360(pages)
    return { supported: fp.supported, version: fp.version }
  } catch {
    return { supported: false, version: 'unknown' }
  }
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
    const parsed = parseAssessment360(pages, { formatVersion: fp.version, followUp: fp.followUp })
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
      calibration: parsed.calibration,
    }
  } catch (e) {
    if (e instanceof ParseError) return { status: 'failed', formatVersion: fp.version, error: e.message, section: e.section }
    return { status: 'failed', formatVersion: fp.version, error: e instanceof Error ? e.message : String(e) }
  }
}

export type { Assessment360Data } from './types'
export { namesMatch } from './validate'
export { compareAssessments } from './compare'
