/**
 * Support notice for a client document the pipeline could not use — the
 * portal tells the client "support has been notified", and this is what makes
 * that true. Best-effort: a mail failure never changes the upload's outcome.
 * Goes to SUPPORT_NOTIFY_EMAIL (else DEFAULT_COACH_EMAIL) over the
 * transactional transport (Resend); when Resend is unconfigured or refuses,
 * it falls back to the house coach's Gmail — the same rule lib/portal/send.ts
 * uses — so the client-facing "support has been notified" stays true without
 * Resend. With no path at all it logs and returns notified:false.
 * Never includes the document's contents.
 */
import { isTransactionalEmailConfigured, sendTransactionalEmail } from '@/lib/email/transactional'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import type { ClientDocument, Coach } from '@/lib/supabase/types'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The house coach (DEFAULT_COACH_EMAIL), else the earliest supervisor — whoever can send from Gmail. */
async function houseGmailSender(): Promise<Coach | null> {
  try {
    const supabase = getSupabaseAdmin()
    const email = (process.env.DEFAULT_COACH_EMAIL || '').trim().toLowerCase()
    if (email) {
      const { data } = await supabase.from('coaches').select('*').eq('email', email).maybeSingle()
      if (data?.google_refresh_token) return data as Coach
    }
    const { data: sup } = await supabase
      .from('coaches')
      .select('*')
      .eq('role', 'supervisor')
      .not('google_refresh_token', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1)
    return (sup?.[0] as Coach | undefined) ?? null
  } catch {
    return null
  }
}

export async function notifyDocumentFailure(opts: {
  client: { id: string; name: string | null; email: string | null }
  document: Pick<ClientDocument, 'id' | 'kind' | 'title' | 'extraction_status' | 'extraction_error'>
  /** 'upload' | 'retry' — which action produced this outcome. */
  action: 'upload' | 'retry'
  /** Who did it: the client in the portal, or a coach. */
  by: 'client' | 'coach'
}): Promise<{ notified: boolean }> {
  const { client, document } = opts
  if (document.extraction_status !== 'failed' && document.extraction_status !== 'unsupported') return { notified: false }
  const inbox = process.env.SUPPORT_NOTIFY_EMAIL || process.env.DEFAULT_COACH_EMAIL
  if (!inbox) {
    console.warn(`document ${document.id} ${document.extraction_status} for client ${client.id} — no support notice sent (no SUPPORT_NOTIFY_EMAIL / DEFAULT_COACH_EMAIL)`)
    return { notified: false }
  }
  const who = `${esc(client.name || 'a portal client')}${client.email ? ` (${esc(client.email)})` : ''}`
  const detail = document.extraction_error ? esc(document.extraction_error) : 'no detail recorded'
  const subject = `[Portal documents] ${document.extraction_status === 'unsupported' ? 'Unsupported report layout' : 'Document could not be read'} — ${client.name || client.id}`
  const html =
    `<p><strong>${who}</strong> ${opts.action === 'retry' ? 'retried' : 'added'} a document in the portal (${opts.by === 'coach' ? 'coach action' : 'self-service'}) and it could not be used.</p>` +
    `<ul><li>Document: ${esc(document.title || document.kind)} (${esc(document.kind)})</li>` +
    `<li>Status: ${esc(document.extraction_status)}</li>` +
    `<li>Detail: ${detail}</li>` +
    `<li>Document id: ${esc(document.id)} · Client id: ${esc(client.id)}</li></ul>` +
    `<p>Review it in the Command Center → Client Portal → Portal users → this client → Documents on file (accept name and retry, retry, or remove).</p>`

  let resendError: string | null = null
  if (isTransactionalEmailConfigured()) {
    try {
      const r = await sendTransactionalEmail({ to: inbox, subject, replyTo: client.email || undefined, html })
      if (r.ok) return { notified: true }
      resendError = r.error || 'send failed'
    } catch (e) {
      resendError = e instanceof Error ? e.message : String(e)
    }
  }

  // Gmail fallback: Resend unconfigured or refused.
  const sender = await houseGmailSender()
  if (!sender) {
    console.warn(`document ${document.id} ${document.extraction_status} for client ${client.id} — no support notice sent (${resendError ? `Resend failed: ${resendError}; ` : 'Resend not configured; '}no house coach with Gmail access)`)
    return { notified: false }
  }
  try {
    const ok = await sendCoachHtmlEmail(sender, { to: inbox, cc: '', subject, html })
    if (!ok) console.warn('document failure notice not sent: Gmail send failed')
    else if (resendError) console.warn(`document failure notice sent via Gmail because Resend failed: ${resendError}`)
    return { notified: ok }
  } catch (e) {
    console.warn('document failure notice not sent:', e instanceof Error ? e.message : e)
    return { notified: false }
  }
}
