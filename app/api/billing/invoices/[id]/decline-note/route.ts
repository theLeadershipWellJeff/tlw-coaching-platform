/**
 * POST /api/billing/invoices/[id]/decline-note
 *
 * "Send note to client" on a failed charge (Phase 4). The coach reviews the
 * drafted note in the UI and posts { subject, body }; a default is used if
 * omitted. Sends via the coach's Gmail and logs to communications.
 *
 * GET returns the default draft so the UI can prefill the editor.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getBillingActor } from '@/lib/billing/access'
import { sendCoachHtmlEmail } from '@/lib/gmail'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function defaultDraft(accountName: string): { subject: string; body: string } {
  return {
    subject: 'A quick note about your recent payment',
    body:
      `Hi ${accountName},\n\n` +
      `We tried to process your coaching payment on the card we have on file, but it didn't go through. ` +
      `This usually just means the card needs updating.\n\n` +
      `When you have a moment, could you reply to let me know a good time to update it, or use the ` +
      `payment link in your invoice email? No rush — I just wanted to flag it so nothing slips.\n\n` +
      `Warmly,\nDr. Jeff Holmes`,
  }
}

async function loadInvoice(supabase: ReturnType<typeof getSupabaseAdmin>, coachId: string, id: string) {
  const { data } = await supabase
    .from('invoices')
    .select('id, billing_accounts ( name, billing_email, billing_cc )')
    .eq('id', id)
    .eq('coach_id', coachId)
    .maybeSingle()
  return data as any
}

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const actor = await getBillingActor(supabase)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const invoice = await loadInvoice(supabase, actor.coach.id, params.id)
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ draft: defaultDraft(invoice.billing_accounts?.name ?? 'there') })
}

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const actor = await getBillingActor(supabase)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.canWrite) return NextResponse.json({ error: 'Read-only role' }, { status: 403 })

  const invoice = await loadInvoice(supabase, actor.coach.id, params.id)
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const account = invoice.billing_accounts
  if (!account?.billing_email) return NextResponse.json({ error: 'This account has no billing email.' }, { status: 422 })

  const body = await req.json().catch(() => ({})) as { subject?: string; body?: string }
  const draft = defaultDraft(account.name ?? 'there')
  const subject = (body.subject ?? draft.subject).trim()
  const text = (body.body ?? draft.body).trim()

  const html = `<div style="font-family:Georgia,serif;color:#3d2b1f;font-size:15px;line-height:1.6;">${text
    .split('\n')
    .map((line) => (line.trim() ? `<p style="margin:0 0 12px;">${escapeHtml(line)}</p>` : ''))
    .join('')}</div>`

  const sent = await sendCoachHtmlEmail(actor.coach as any, {
    to: account.billing_email,
    cc: account.billing_cc ?? undefined,
    subject,
    html,
  }).catch(() => false)

  await supabase
    .from('communications')
    .insert({ coach_id: actor.coach.id, client_id: null, type: 'email', direction: 'outbound', subject, status: sent ? 'sent' : 'failed' })
    .then(() => {}, () => {})

  if (!sent) return NextResponse.json({ ok: false, error: 'Could not send the note.' }, { status: 502 })
  return NextResponse.json({ ok: true })
}
