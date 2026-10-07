/**
 * "Your 360 report is ready" — sent by hand from the Command Center (the
 * per-user page's "Tell them it's ready" button), never by the cron.
 *
 * The first invitation already says the report is inside, so this is for
 * someone who is invited (usually already active) when a report lands — a
 * reassessment, or a report that was held for a name check. Someone never
 * invited gets the invitation instead; this refuses and says so.
 *
 * One email per report: claimed in the `portal_reminders` ledger as
 * kind 'report_ready', period_key 'report-<documentId>' BEFORE sending (the
 * unique index makes a double-click send once). A failed send releases the
 * claim so it can be tried again. The link is a 14-day 'reminder_login', so
 * it never counts as an invitation.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { AdminError } from '@/lib/admin/debrief'
import { loadPortalStates } from '@/lib/admin/portal-status'
import { getBaseUrl } from '@/lib/url'
import { isPortalAccessBlocked } from './archive'
import { resolveClientCoach } from './coach'
import { buildReminderEmailHtml } from './email'
import { logPortalEvent } from './events'
import { REMINDER_SUBJECTS } from './reminders'
import { deliverPortalEmail, type PortalSendResult } from './send'
import { INVITE_LINK_TTL_MS, MAX_LINKS_PER_HOUR, createLoginToken, recentLoginTokenCount } from './tokens'

export async function sendReportReadyEmail(
  supabase: SupabaseClient<Database>,
  clientId: string
): Promise<PortalSendResult & { sentTo: string; documentId: string }> {
  const { data: client } = await supabase
    .from('clients')
    .select('id, org_id, name, email, client_type, portal_features, portal_access_expires_at')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) throw new AdminError(404, 'Client not found.')
  if (isPortalAccessBlocked(client)) throw new AdminError(409, 'This person is archived or their access window has ended. Restore or extend it first.')
  if (!client.email) throw new AdminError(400, 'This client has no email on file.')

  const { data: doc } = await supabase
    .from('client_documents')
    .select('id')
    .eq('client_id', clientId)
    .eq('kind', 'assessment_360')
    .eq('extraction_status', 'complete')
    .order('assessment_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!doc) throw new AdminError(409, 'No completed 360 report is on file for this person yet.')

  const state = (await loadPortalStates(supabase, [clientId]))[clientId]
  if (!state?.invitedAt && !state?.lastSeenAt) {
    throw new AdminError(409, 'They have not been invited yet. Send the invitation instead: it already tells them their report is inside.')
  }
  if ((await recentLoginTokenCount(clientId)) >= MAX_LINKS_PER_HOUR) {
    throw new AdminError(429, 'Too many sign-in links sent to this person in the last hour.')
  }

  const periodKey = `report-${doc.id}`
  const { data: claim, error: claimErr } = await supabase
    .from('portal_reminders')
    .insert({ client_id: clientId, org_id: client.org_id, kind: 'report_ready', period_key: periodKey, via: null, error: 'pending' } as never)
    .select('id')
    .maybeSingle()
  if (claimErr || !claim) {
    const { data: prior } = await supabase
      .from('portal_reminders')
      .select('sent_at')
      .eq('client_id', clientId)
      .eq('kind', 'report_ready')
      .eq('period_key', periodKey)
      .maybeSingle()
    if (prior) {
      const when = new Date(prior.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      throw new AdminError(409, `They were already told this report is ready (${when}).`)
    }
    throw new AdminError(500, `Could not record the send${claimErr ? `: ${claimErr.message}` : ''}.`)
  }
  const release = () => supabase.from('portal_reminders').delete().eq('id', claim.id)

  try {
    const coach = await resolveClientCoach(clientId)
    const raw = await createLoginToken(clientId, client.org_id, { ttlMs: INVITE_LINK_TTL_MS, purpose: 'reminder_login' })
    const base = getBaseUrl()
    const html = buildReminderEmailHtml({
      firstName: (client.name || '').split(' ')[0] || 'there',
      kind: 'report_ready',
      link: `${base}/portal/verify?token=${raw}`,
      settingsLink: `${base}/portal/settings`,
      // A participant's house-coach link is structural; the firm signs off.
      coachName: coach && client.client_type !== 'portal' ? coach.name : null,
    })
    const r = await deliverPortalEmail({
      client: { id: clientId, name: client.name, email: client.email },
      coach,
      subject: REMINDER_SUBJECTS.report_ready,
      html,
      type: 'reminder',
      preview: 'Portal · your 360 report is ready',
    })
    if (!r.ok) {
      await release()
      return { ...r, sentTo: client.email, documentId: doc.id }
    }
    await supabase.from('portal_reminders').update({ via: r.via, error: r.warning ?? null } as never).eq('id', claim.id)
    await logPortalEvent(clientId, 'reminder_sent', { kind: 'report_ready', period_key: periodKey, via: r.via })
    return { ...r, sentTo: client.email, documentId: doc.id }
  } catch (e) {
    await release()
    throw e
  }
}
