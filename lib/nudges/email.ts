/**
 * Nudge email body. A nudge should read like a personal note from the coach — not
 * a branded template — so it threads naturally in the client's inbox. We render
 * the coach-approved plain-text body as simple paragraphs; the branded, locked
 * signature is appended SEPARATELY at send time (lib/signature.ts), never here.
 */

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Plain-text body → email-safe HTML paragraphs (blank lines split paragraphs). */
export function nudgeBodyToHtml(body: string): string {
  const paras = (body || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1f2937;font-family:'DM Sans',Helvetica,Arial,sans-serif;">${esc(
          p
        ).replace(/\n/g, '<br/>')}</p>`
    )
    .join('')
  return `<div style="max-width:560px;">${paras}</div>`
}
