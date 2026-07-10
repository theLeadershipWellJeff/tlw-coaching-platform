/**
 * Send one approved nudge. Reuses the existing rails end to end:
 *  - the coach's Gmail (lib/gmail.ts#sendCoachHtmlEmail — works unattended via the
 *    stored refresh token, so the cron can send too),
 *  - the locked signature, appended server-side (lib/signature.ts),
 *  - the communications log (type = 'reminder'), linked back onto the nudge.
 *
 * Enforces the spacing rule (§3.4) as a hard guard: if the client received any
 * outbound communication within the coach's spacing window, the send is refused
 * with a reason (the cron skips silently; the manual path surfaces it). Restraint
 * is a guarantee, not a best-effort.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Coach, Database, Nudge } from '@/lib/supabase/types'
import { sendCoachHtmlEmail, type EmailAttachment } from '@/lib/gmail'
import { PDF_BUCKET } from '@/lib/library-storage'
import { getActiveSignatureHtml } from '@/lib/signature'
import { logCommunication, htmlToPreview } from '@/lib/communications'
import { nudgeBodyToHtml } from './email'
import { normalizeNudgeSettings } from './settings'

export type SendNudgeResult = { ok: boolean; reason?: string }

export async function sendNudge(
  supabase: SupabaseClient<Database>,
  coach: Coach,
  nudge: Nudge
): Promise<SendNudgeResult> {
  if (nudge.status === 'sent') return { ok: true }
  if (!nudge.draft_body || !nudge.draft_body.trim()) {
    return { ok: false, reason: 'This nudge has no body to send.' }
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, email')
    .eq('id', nudge.client_id)
    .maybeSingle()
  if (!client) return { ok: false, reason: 'Client not found.' }
  if (!client.email) return { ok: false, reason: 'Client has no email address.' }

  // Spacing guard (§3.4) — never stack on top of a recent touch.
  const settings = normalizeNudgeSettings(coach.nudge_settings)
  const since = new Date(Date.now() - settings.nudge_spacing_days * 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await supabase
    .from('communications')
    .select('id')
    .eq('client_id', nudge.client_id)
    .eq('direction', 'outbound')
    .gte('sent_at', since)
    .limit(1)
  if (recent && recent.length) {
    return {
      ok: false,
      reason: `Spacing: ${client.name.split(/\s+/)[0]} was contacted within the last ${settings.nudge_spacing_days} days. Reschedule and try again.`,
    }
  }

  // Framework PDF attachment (migration 035). Fail-loud: if the coach attached
  // a PDF, the nudge never quietly sends without it — a broken attachment
  // refuses the send with a reason (the coach can detach it and retry).
  const attachments: EmailAttachment[] = []
  if (nudge.pdf_resource_id) {
    const { data: pdf } = await supabase
      .from('pdf_resources')
      .select('name, storage_path')
      .eq('id', nudge.pdf_resource_id)
      .eq('coach_id', coach.id)
      .maybeSingle()
    if (!pdf) {
      return { ok: false, reason: 'The attached PDF is no longer in your Library. Remove the attachment and try again.' }
    }
    const { data: blob, error: dlErr } = await supabase.storage.from(PDF_BUCKET).download(pdf.storage_path)
    if (dlErr || !blob) {
      return { ok: false, reason: 'Could not read the attached PDF from storage. Remove the attachment and try again.' }
    }
    attachments.push({
      filename: pdf.name.toLowerCase().endsWith('.pdf') ? pdf.name : `${pdf.name}.pdf`,
      contentType: 'application/pdf',
      content: Buffer.from(await blob.arrayBuffer()),
    })
  }

  const subject = nudge.draft_subject?.trim() || 'A quick note'
  const bodyHtml = nudgeBodyToHtml(nudge.draft_body)
  const signature = await getActiveSignatureHtml(supabase, coach.id)
  const html = bodyHtml + signature

  const ok = await sendCoachHtmlEmail(coach, { to: client.email, subject, html, attachments }).catch(() => false)

  // Log every attempt — success or failure — so a send is never silently dropped.
  const comm = await logCommunication(supabase, {
    coach_id: coach.id,
    client_id: nudge.client_id,
    type: 'reminder',
    direction: 'outbound',
    subject,
    preview: htmlToPreview(bodyHtml),
    body_html: html,
    status: ok ? 'sent' : 'failed',
    error_detail: ok ? null : 'Gmail send failed',
  })

  if (!ok) return { ok: false, reason: 'Email failed to send. Check Gmail access and try again.' }

  await supabase
    .from('nudges')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      communication_id: comm?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', nudge.id)

  return { ok: true }
}
