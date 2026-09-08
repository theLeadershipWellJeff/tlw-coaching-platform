/**
 * Support notice for a client document the pipeline could not use — the
 * portal tells the client "support has been notified", and this is what makes
 * that true. Best-effort: a mail failure never changes the upload's outcome.
 * Goes to SUPPORT_NOTIFY_EMAIL (else DEFAULT_COACH_EMAIL) over the
 * transactional transport; with neither configured it logs and returns.
 * Never includes the document's contents.
 */
import { isTransactionalEmailConfigured, sendTransactionalEmail } from '@/lib/email/transactional'
import type { ClientDocument } from '@/lib/supabase/types'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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
  if (!inbox || !isTransactionalEmailConfigured()) {
    console.warn(`document ${document.id} ${document.extraction_status} for client ${client.id} — no support notice sent (transactional email not configured)`)
    return { notified: false }
  }
  const who = `${esc(client.name || 'a portal client')}${client.email ? ` (${esc(client.email)})` : ''}`
  const detail = document.extraction_error ? esc(document.extraction_error) : 'no detail recorded'
  try {
    const r = await sendTransactionalEmail({
      to: inbox,
      subject: `[Portal documents] ${document.extraction_status === 'unsupported' ? 'Unsupported report layout' : 'Document could not be read'} — ${esc(client.name || client.id)}`,
      replyTo: client.email || undefined,
      html:
        `<p><strong>${who}</strong> ${opts.action === 'retry' ? 'retried' : 'added'} a document in the portal (${opts.by === 'coach' ? 'coach action' : 'self-service'}) and it could not be used.</p>` +
        `<ul><li>Document: ${esc(document.title || document.kind)} (${esc(document.kind)})</li>` +
        `<li>Status: ${esc(document.extraction_status)}</li>` +
        `<li>Detail: ${detail}</li>` +
        `<li>Document id: ${esc(document.id)} · Client id: ${esc(client.id)}</li></ul>` +
        `<p>Review it in the Command Center → Client Portal → Portal users → this client → Documents on file (accept name and retry, retry, or remove).</p>`,
    })
    if (!r.ok) console.warn('document failure notice not sent:', r.error)
    return { notified: r.ok }
  } catch (e) {
    console.warn('document failure notice not sent:', e instanceof Error ? e.message : e)
    return { notified: false }
  }
}
