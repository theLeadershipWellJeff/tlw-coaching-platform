/**
 * The branded email signature — a single source of truth, appended server-side
 * at send time (never pasted into a draft body). Stored in `email_signatures`
 * (migration 017); this module resolves the active signature and carries a code
 * fallback so a send never goes out bare even if the table is empty.
 *
 * Email-safe by construction: table layout, inline styles, and a RASTER logo
 * (PNG). SVG is stripped by Gmail/Outlook/Apple Mail, so the logo MUST be a
 * hosted PNG (public/logo-email.png → https://theleadershipwell.online/logo-email.png).
 * Keep DEFAULT_SIGNATURE_HTML in sync with the seed in
 * supabase/migrations/017_email_signatures_communications.sql.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './supabase/types'

export const SIGNATURE_LOGO_URL = 'https://theleadershipwell.online/logo-email.png'

export const DEFAULT_SIGNATURE_HTML =
  `<table cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #e5e0d8;padding-top:16px;font-family:'DM Sans',Helvetica,Arial,sans-serif;">` +
  `<tr>` +
  `<td style="padding-bottom:10px;">` +
  `<img src="${SIGNATURE_LOGO_URL}" width="200" alt="theLeadershipWell" style="display:block;border:0;height:auto;" />` +
  `</td>` +
  `</tr>` +
  `<tr>` +
  `<td>` +
  `<div style="font-weight:700;font-size:14px;color:#111226;">Jeff Holmes</div>` +
  `<div style="font-size:12px;color:#8B8680;margin-top:1px;">Executive Coach &middot; theLeadershipWell</div>` +
  `<div style="font-size:12px;color:#8B8680;margin-top:4px;">` +
  `<a href="mailto:jeff@jeffkholmes.com" style="color:#0C1940;text-decoration:none;">jeff@jeffkholmes.com</a>` +
  `&nbsp;&middot;&nbsp;` +
  `<a href="https://www.theleadershipwell.com" style="color:#0C1940;text-decoration:none;">theleadershipwell.com</a>` +
  `</div>` +
  `<div style="font-size:12px;margin-top:4px;">` +
  `<a href="https://meetings-na2.hubspot.com/dr-jeff" style="color:#0C1940;text-decoration:none;font-weight:600;">Book a session &rarr;</a>` +
  `</div>` +
  `</td>` +
  `</tr>` +
  `</table>`

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * The structured fields a coach edits in Account → Email signature. The saved
 * row stores the RENDERED html (what sends append) prefixed with an HTML
 * comment carrying these fields as JSON, so the editor can round-trip them
 * without a schema change. Mail clients ignore the comment.
 */
export type SignatureFields = {
  name: string
  title: string // e.g. "Executive Coach · theLeadershipWell"
  email: string
  phone?: string
  website?: string // display + link, e.g. "theleadershipwell.com"
  bookingUrl?: string // "Book a session →" target; omitted = no booking line
}

const FIELDS_COMMENT_RE = /^<!--TLW_SIG_FIELDS:(.*?)-->/

/** Render the email-safe signature table from structured fields. Pure. */
export function buildSignatureHtmlFromFields(f: SignatureFields): string {
  const website = (f.website || '').trim()
  const websiteHref = website ? (website.startsWith('http') ? website : `https://${website}`) : ''
  const contactBits = [
    `<a href="mailto:${escapeHtml(f.email)}" style="color:#0C1940;text-decoration:none;">${escapeHtml(f.email)}</a>`,
    ...(f.phone?.trim() ? [escapeHtml(f.phone.trim())] : []),
    ...(website
      ? [`<a href="${escapeHtml(websiteHref)}" style="color:#0C1940;text-decoration:none;">${escapeHtml(website)}</a>`]
      : []),
  ]
  return (
    `<table cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:1px solid #e5e0d8;padding-top:16px;font-family:'DM Sans',Helvetica,Arial,sans-serif;">` +
    `<tr>` +
    `<td style="padding-bottom:10px;">` +
    `<img src="${SIGNATURE_LOGO_URL}" width="200" alt="theLeadershipWell" style="display:block;border:0;height:auto;" />` +
    `</td>` +
    `</tr>` +
    `<tr>` +
    `<td>` +
    `<div style="font-weight:700;font-size:14px;color:#111226;">${escapeHtml(f.name)}</div>` +
    `<div style="font-size:12px;color:#8B8680;margin-top:1px;">${escapeHtml(f.title)}</div>` +
    `<div style="font-size:12px;color:#8B8680;margin-top:4px;">${contactBits.join('&nbsp;&middot;&nbsp;')}</div>` +
    (f.bookingUrl?.trim()
      ? `<div style="font-size:12px;margin-top:4px;">` +
        `<a href="${escapeHtml(f.bookingUrl.trim())}" style="color:#0C1940;text-decoration:none;font-weight:600;">Book a session &rarr;</a>` +
        `</div>`
      : '') +
    `</td>` +
    `</tr>` +
    `</table>`
  )
}

/** The storable value: fields JSON in a leading comment + the rendered table. */
export function serializeSignature(f: SignatureFields): string {
  return `<!--TLW_SIG_FIELDS:${JSON.stringify(f)}-->` + buildSignatureHtmlFromFields(f)
}

/** Recover the editor fields from a stored signature; null for legacy/foreign HTML. */
export function parseSignatureFields(html: string): SignatureFields | null {
  const m = (html || '').match(FIELDS_COMMENT_RE)
  if (!m) return null
  try {
    const f = JSON.parse(m[1])
    if (f && typeof f.name === 'string' && typeof f.email === 'string') return f as SignatureFields
  } catch {
    /* fall through */
  }
  return null
}

/**
 * A generic, TLW-branded signature built from a coach's own name/email — what a
 * coach gets before they've saved a personal signature. Same email-safe table
 * shell as the branded default, no Jeff-specific details.
 */
export function buildGenericSignatureHtml(name: string, email: string): string {
  return buildSignatureHtmlFromFields({ name, title: 'Executive Coach · theLeadershipWell', email })
}

/**
 * Resolve the signature HTML to append for a coach: their own row wins, else a
 * generic signature built from their name/email, else the code constant. The
 * global (coach_id IS NULL) row is deliberately NOT used for coaches with an
 * identity — it carries Jeff's seeded signature, which must never appear under
 * another coach's email. Falls back safely on any read error — a transient DB
 * blip must not block a send or drop the brand.
 */
export async function getActiveSignatureHtml(
  supabase: SupabaseClient<Database>,
  coach: { id: string; name?: string | null; email?: string | null }
): Promise<string> {
  try {
    const { data } = await supabase
      .from('email_signatures')
      .select('coach_id, html')
      .eq('coach_id', coach.id)
      .maybeSingle()
    if (data?.html) return data.html
  } catch {
    // fall through
  }
  if (coach.name && coach.email) return buildGenericSignatureHtml(coach.name, coach.email)
  return DEFAULT_SIGNATURE_HTML
}
