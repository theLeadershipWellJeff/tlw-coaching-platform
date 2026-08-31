import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { AGENDA_PROMPTS, type AgendaItem } from '@/lib/agenda'
import { escapeHtml } from '@/lib/html'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { resolveClientCoach } from '@/lib/portal/coach'
import { logCommunication } from '@/lib/communications'
import { getBaseUrl } from '@/lib/url'

export const runtime = 'nodejs'

/**
 * Notify the coach that a client filled in (or updated) their session agenda.
 * Best-effort — a Gmail hiccup never fails the client's submission — and sent
 * unattended via the coach's stored refresh token (same pattern as the
 * agreement-sign and portal-contact notifications). Also logged to
 * `communications` as an inbound row so it shows on the Recent Communication
 * card even if the email is missed.
 */
async function notifyCoachOfAgenda(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  reqRow: { coach_id: string | null; client_id: string },
  items: AgendaItem[],
  isUpdate: boolean
): Promise<void> {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', reqRow.client_id)
      .maybeSingle()
    const clientName = client?.name || 'Your client'

    let coach = null
    if (reqRow.coach_id) {
      const { data } = await supabase.from('coaches').select('*').eq('id', reqRow.coach_id).maybeSingle()
      coach = data
    }
    // Older agenda_requests rows can carry a null coach_id — fall back to the
    // client's primary linked coach.
    if (!coach) coach = await resolveClientCoach(reqRow.client_id)
    if (!coach?.email) return

    const subject = isUpdate
      ? `${clientName} updated the agenda for your next session`
      : `${clientName} set the agenda for your next session`
    const answersHtml = items
      .map(
        (it) => `
      <div style="margin:0 0 16px;">
        <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8B8680;margin:0 0 4px;">${escapeHtml(it.q)}</p>
        <p style="font-size:14px;color:#403832;line-height:1.6;margin:0;">${escapeHtml(it.a).replace(/\n/g, '<br/>')}</p>
      </div>`
      )
      .join('')
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;background:#DDD9D3;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#111226;">
  <div style="max-width:520px;margin:6vh auto 0;background:#fff;border-radius:16px;padding:36px 32px;box-shadow:0 10px 40px rgba(17,18,38,.08);">
    <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8B8680;margin:0 0 14px;">theLeadershipWell</p>
    <h1 style="font-size:19px;font-weight:600;margin:0 0 16px;">${escapeHtml(clientName)} ${isUpdate ? 'updated' : 'filled in'} their session agenda</h1>
    ${answersHtml}
    <p style="margin:22px 0 0;">
      <a href="${getBaseUrl()}/clients/${reqRow.client_id}" style="display:inline-block;background:#0C1940;color:#F2F2F0;text-decoration:none;font-size:13px;font-weight:600;padding:11px 24px;border-radius:8px;">Open their workspace &rarr;</a>
    </p>
  </div>
  <div style="height:6vh;"></div>
</body></html>`

    const sent = await sendCoachHtmlEmail(coach, { to: coach.email, cc: '', subject, html })

    await logCommunication(supabase, {
      coach_id: coach.id,
      client_id: reqRow.client_id,
      type: 'email',
      direction: 'inbound',
      subject,
      preview: items.map((it) => it.a).join(' · ').slice(0, 140),
      status: sent ? 'sent' : 'failed',
    })
  } catch (e) {
    console.error('[agenda] coach notification failed', e)
  }
}

// Public (token = credential): load an agenda request so the client can fill it.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const { data: reqRow } = await supabase
    .from('agenda_requests')
    .select('client_id, status, items')
    .eq('token', params.token)
    .maybeSingle()
  if (!reqRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: client } = await supabase.from('clients').select('name').eq('id', reqRow.client_id).maybeSingle()
  const firstName = (client?.name || '').split(' ')[0] || 'there'

  return NextResponse.json({
    clientFirstName: firstName,
    status: reqRow.status,
    prompts: AGENDA_PROMPTS,
    items: reqRow.items || [],
  })
}

// Public: submit the client's agenda answers. Body: { answers: string[] }
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const { data: reqRow } = await supabase
    .from('agenda_requests')
    .select('id, coach_id, client_id, status')
    .eq('token', params.token)
    .maybeSingle()
  if (!reqRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const answers: string[] = Array.isArray(body.answers) ? body.answers : []
  const items = AGENDA_PROMPTS.map((q, i) => ({ q, a: String(answers[i] || '').trim() })).filter((x) => x.a)
  if (items.length === 0) return NextResponse.json({ error: 'Please answer at least one prompt.' }, { status: 400 })

  const { error } = await supabase
    .from('agenda_requests')
    .update({ items, status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', reqRow.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Tell the coach the answers came in — best-effort, never blocks the client.
  await notifyCoachOfAgenda(supabase, reqRow, items, reqRow.status === 'submitted')

  return NextResponse.json({ ok: true })
}
