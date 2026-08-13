import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireClientCoach } from '@/lib/client-access'
import { createLoginToken } from '@/lib/portal/tokens'
import { buildMagicLinkEmailHtml } from '@/lib/portal/email'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { getBaseUrl } from '@/lib/url'
import { toErrorResponse } from '@/lib/api-handler'

export const runtime = 'nodejs'

/** Coach-initiated Client Portal invite: mint a magic-link and email it to the
 *  client from the coach's Gmail. Tenant-gated via requireClientCoach. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)

    const { data: client } = await supabase
      .from('clients')
      .select('id, org_id, name, email')
      .eq('id', params.id)
      .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    if (!client.email) {
      return NextResponse.json({ error: 'This client has no email on file.' }, { status: 400 })
    }

    const raw = await createLoginToken(client.id, client.org_id)
    const link = `${getBaseUrl()}/portal/verify?token=${raw}`
    const firstName = (client.name || '').split(' ')[0] || 'there'

    const sent = await sendCoachHtmlEmail(coach, {
      to: client.email,
      cc: '',
      subject: 'Your coaching portal invitation',
      html: buildMagicLinkEmailHtml({ firstName, link, coachName: coach.name }),
    })
    if (!sent) return NextResponse.json({ error: 'Could not send the invite email.' }, { status: 502 })

    return NextResponse.json({ ok: true, sentTo: client.email })
  } catch (e) {
    return toErrorResponse(e)
  }
}
