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
  `<td style="padding-right:14px;vertical-align:middle;">` +
  `<img src="${SIGNATURE_LOGO_URL}" width="40" height="40" alt="theLeadershipWell" style="display:block;border:0;" />` +
  `</td>` +
  `<td style="vertical-align:middle;">` +
  `<div style="font-weight:700;font-size:14px;color:#111226;">Jeff Holmes</div>` +
  `<div style="font-size:12px;color:#8B8680;margin-top:1px;">Executive Coach &middot; theLeadershipWell</div>` +
  `<div style="font-size:12px;color:#8B8680;margin-top:4px;">` +
  `<a href="mailto:jeff@jeffkholmes.com" style="color:#0C1940;text-decoration:none;">jeff@jeffkholmes.com</a>` +
  `&nbsp;&middot;&nbsp;` +
  `<a href="https://www.theleadershipwell.com" style="color:#0C1940;text-decoration:none;">theleadershipwell.com</a>` +
  `</div>` +
  `</td>` +
  `</tr>` +
  `</table>`

/**
 * Resolve the signature HTML to append for `coachId`: the coach's own row wins,
 * else the global default (coach_id IS NULL), else the code constant. Falls back
 * to the constant on any read error — a transient DB blip must not block a send
 * or drop the brand.
 */
export async function getActiveSignatureHtml(
  supabase: SupabaseClient<Database>,
  coachId: string
): Promise<string> {
  try {
    const { data } = await supabase
      .from('email_signatures')
      .select('coach_id, html')
      .or(`coach_id.eq.${coachId},coach_id.is.null`)
    if (data && data.length) {
      const own = data.find((r) => r.coach_id === coachId)
      const chosen = own ?? data.find((r) => r.coach_id === null) ?? data[0]
      if (chosen?.html) return chosen.html
    }
  } catch {
    // fall through to the constant
  }
  return DEFAULT_SIGNATURE_HTML
}
