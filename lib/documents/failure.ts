/**
 * Why a client document is not usable, in a shape the portal can show a client
 * without leaking the raw extraction error. Dependency-free so the spike
 * verifier can load it without the storage/extraction stack. A name mismatch
 * carries both names so the client can see what to correct (their own name on the account, or the wrong
 * file); everything else is "failed" or "unsupported" with no detail.
 */
export type DocumentFailureReason =
  | { kind: 'name_mismatch'; report_name: string; account_name: string }
  | { kind: 'unsupported' }
  | { kind: 'failed' }

export function describeFailure(doc: { extraction_status: string; extraction_error: string | null }): DocumentFailureReason | null {
  if (doc.extraction_status === 'unsupported') return { kind: 'unsupported' }
  if (doc.extraction_status !== 'failed') return null
  const m = /^name_mismatch: the report is for "([^"]*)"; this client record is "([^"]*)"/.exec(doc.extraction_error || '')
  if (m) return { kind: 'name_mismatch', report_name: m[1], account_name: m[2] }
  return { kind: 'failed' }
}
