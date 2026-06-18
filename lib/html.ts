/**
 * HTML escaping for any DB- or model-derived string we drop into an HTML
 * response or email body. Coach-authored note/action/agreement text and
 * Claude-generated prep content are all interpolated into HTML elsewhere; run
 * them through this first so a stray `<`, `>`, `&`, or quote can't break the
 * markup (or inject script into a confirmation page rendered to a signed-out
 * client). Cheap, and correct by default.
 */
export function escapeHtml(value: unknown): string {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
