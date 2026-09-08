/** Client-facing copy for the portal's document outcomes (upload + retry). */
import type { DocumentFailureReason } from '@/lib/documents/failure'
/**
 * What the client reads after an upload or a retry. A name mismatch says which
 * two names disagree and the two ways to resolve it (their own name on the
 * account is theirs to correct in Settings; a report that is not theirs is not
 * something Retry can fix); the rest name the next step plainly.
 */
export function portalOutcomeMessage(kind: string, reason: DocumentFailureReason | null, promoted: boolean): string {
  if (!reason) {
    if (promoted) return 'That file is a 360 feedback report, so it was read as your 360 and added to your report card.'
    return kind === 'assessment_360' ? 'Your report has been added.' : 'Your document has been added.'
  }
  if (reason.kind === 'name_mismatch') {
    return `The report is for "${reason.report_name}" but the name on your account is "${reason.account_name}", so it has not been added. If it is your report, correct your name in Settings and press Retry; if it is someone else's, remove it.`
  }
  if (reason.kind === 'unsupported') return 'We could not read this report layout automatically. Your file is saved and downloadable; support has been notified to review it.'
  return 'Your file is saved, but we could not read it. You can press Retry; support has been notified.'
}
