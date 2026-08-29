import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { createLoginToken, recentLoginTokenCount, MAX_LINKS_PER_HOUR } from '@/lib/portal/tokens'
import { resolveClientCoach } from '@/lib/portal/coach'
import { buildMagicLinkEmailHtml } from '@/lib/portal/email'
import { sendPortalEmail } from '@/lib/transactional-email'
import { getBaseUrl } from '@/lib/url'
import { logPortalAccess } from '@/lib/portal/access'

export const runtime = 'nodejs'

/**
 * Request a Client Portal magic link. ALWAYS returns a generic { ok: true } —
 * never revealing whether the email belongs to a client (anti-enumeration).
 * Rate-limited to MAX_LINKS_PER_HOUR per client. Sends from the client's coach's
 * Gmail (unattended).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const generic = NextResponse.json({ ok: true })
  if (!email || !email.includes('@')) return generic

  try {
    const supabase = getSupabaseAdmin()
    const { data: client } = await supabase
      .from('clients')
      .select('id, org_id, name, email')
      .ilike('email', email)
      .maybeSingle()
    if (!client || !client.email) return generic

    if ((await recentLoginTokenCount(client.id)) >= MAX_LINKS_PER_HOUR) return generic

    const coach = await resolveClientCoach(client.id)
    if (!coach) return generic

    const raw = await createLoginToken(client.id, client.org_id)
    const link = `${getBaseUrl()}/portal/verify?token=${raw}`
    const firstName = (client.name || '').split(' ')[0] || 'there'

    await logPortalAccess(client.id, 'login_request')

    await sendPortalEmail(coach, {
      to: client.email,
      subject: 'Your sign-in link',
      html: buildMagicLinkEmailHtml({ firstName, link, coachName: coach.name }),
    })
  } catch (e) {
    // Swallow — the response is generic either way; never leak failure detail.
    console.error('portal login request failed:', e)
  }

  return generic
}
