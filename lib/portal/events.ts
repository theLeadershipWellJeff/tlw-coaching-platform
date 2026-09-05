/**
 * Outcomes instrumentation for the Client Portal (migration 059,
 * `portal_events`). Separate from `portal_access_log`, which is an audit /
 * rate-limit counter that may be pruned — this is the durable record behind the
 * outcomes story (first login, report viewed, chat started, goal created,
 * comparison viewed, talk-to-a-coach clicked, …). Capture from day one; it
 * cannot be retrofitted.
 *
 * Best-effort: never throws, so a logging hiccup can't take down the action.
 */
import { getSupabaseAdmin } from '@/lib/supabase/server'

export type PortalEventType =
  | 'first_login'
  | 'report_viewed'
  | 'document_downloaded'
  | 'document_uploaded'
  | 'document_visibility_changed'
  | 'comparison_viewed'
  | 'chat_started'
  | 'chat_message'
  | 'goal_created'
  | 'metric_defined'
  | 'action_created'
  | 'action_completed'
  | 'talk_to_coach_clicked'
  | 'progress_self_rating'
  | 'support_ticket_opened'

export async function logPortalEvent(
  clientId: string,
  eventType: PortalEventType,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    const { data: client } = await supabase.from('clients').select('org_id').eq('id', clientId).maybeSingle()
    await supabase.from('portal_events').insert({
      client_id: clientId,
      org_id: client?.org_id,
      event_type: eventType,
      metadata,
    })
  } catch (e) {
    console.error('portal event log failed:', e)
  }
}
