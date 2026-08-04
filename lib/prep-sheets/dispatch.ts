/**
 * Prep-sheet send core. The ONE money-adjacent path that puts a prep sheet in a
 * client's inbox — used by the manual "Send now" (Phase 3) and, in Phase 4, by
 * the scheduled dispatch / last-call cron branches.
 *
 * Claim-before-send discipline (mirrors billing + appointment reminders): the
 * row is flipped to 'sent' by an ATOMIC conditional update before any Gmail call,
 * so two concurrent ticks can never both send. On send failure the row goes to
 * 'failed' (surfaced in /prep) — never a silent retry into a double-send.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Coach, Database, PrepSheetPipeline } from '@/lib/supabase/types'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { logCommunication, htmlToPreview } from '@/lib/communications'

const PREP_SUBJECT_FALLBACK = 'Your Session Preparation - theLeadershipWell'

export type PrepDispatchResult = { ok: boolean; reason?: string }

/**
 * Send a prep sheet whose row is ALREADY claimed (status flipped to 'sent' by the
 * caller's atomic update). Writes the communications row on success and links it
 * back onto the sheet; on any failure flips the row to 'failed' with a reason.
 *
 * The body is a complete branded email (buildClientEmailHTML) — the coach's
 * sign-off + footer are already in it — so NO signature is appended here.
 *
 * Intentional side effect: logging to `communications` means the nudge spacing
 * rule (lib/nudges/send.ts) will suppress nudges to this client for the spacing
 * window afterward. That is correct — don't nudge a client a day or two before
 * their session, right after their prep sheet landed. Do not "fix" this.
 */
export async function sendClaimedPrepSheet(
  supabase: SupabaseClient<Database>,
  coach: Coach,
  sheet: PrepSheetPipeline
): Promise<PrepDispatchResult> {
  const now = new Date().toISOString()
  const markFailed = async (reason: string): Promise<PrepDispatchResult> => {
    await supabase
      .from('prep_sheet_pipeline')
      .update({ status: 'failed', error_detail: reason.slice(0, 500), sent_at: null, updated_at: now })
      .eq('id', sheet.id)
    return { ok: false, reason }
  }

  // Explicit columns — no key_info.
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, email')
    .eq('id', sheet.client_id)
    .maybeSingle()
  if (!client) return markFailed('Client not found.')
  if (!client.email) return markFailed('Client has no email address on file.')
  if (!sheet.body_html) return markFailed('This prep sheet has no content to send.')

  const subject = sheet.subject || PREP_SUBJECT_FALLBACK
  const cc = process.env.JEFF_CC_EMAIL || undefined

  const ok = await sendCoachHtmlEmail(coach, { to: client.email, cc, subject, html: sheet.body_html }).catch(
    () => false
  )
  if (!ok) return markFailed('Email failed to send. Check Gmail access and try again.')

  const comm = await logCommunication(supabase, {
    coach_id: coach.id,
    client_id: client.id,
    type: 'prep_sheet',
    direction: 'outbound',
    subject,
    preview: htmlToPreview(sheet.body_html),
    body_html: sheet.body_html,
    status: 'sent',
    appointment_id: sheet.appointment_id,
    sent_at: now,
  })

  await supabase
    .from('prep_sheet_pipeline')
    .update({ communication_id: comm?.id ?? null, updated_at: now })
    .eq('id', sheet.id)

  return { ok: true }
}

/**
 * Manual "Send now" — claim the row (from draft OR approved) then send. The claim
 * is an atomic conditional update so a double click / concurrent tick sends once.
 */
export async function dispatchPrepSheetNow(
  supabase: SupabaseClient<Database>,
  coach: Coach,
  sheetId: string
): Promise<PrepDispatchResult> {
  const now = new Date().toISOString()
  const { data: claimed } = await supabase
    .from('prep_sheet_pipeline')
    .update({ status: 'sent', sent_at: now, updated_at: now })
    .eq('id', sheetId)
    .eq('coach_id', coach.id)
    .in('status', ['draft', 'approved'])
    .is('sent_at', null)
    .select('*')
    .maybeSingle()
  if (!claimed) {
    return { ok: false, reason: 'This prep sheet can’t be sent right now — it may already be sent or skipped.' }
  }
  return sendClaimedPrepSheet(supabase, coach, claimed as PrepSheetPipeline)
}
