import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse, requireCoach } from '@/lib/api-handler'

export const dynamic = 'force-dynamic'

export type AccomplishedActor = 'coach' | 'system'

export interface AccomplishedItem {
  id: string
  type: string
  actor: AccomplishedActor
  label: string
  client_name: string | null
  timestamp: string
}

// Dashboard "Accomplished Today" — everything that happened today (coach + system).
// The caller filters by actor on the client side for the toggle.
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)

    // "Today" = last 24 hours (simpler than timezone-aware midnight; covers all use cases)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const items: AccomplishedItem[] = []

    // ── Emails sent (coach) ─────────────────────────────────────────────────
    const { data: emails } = await supabase
      .from('communications')
      .select('id, client_id, subject, sent_at, type')
      .eq('coach_id', coach.id)
      .eq('direction', 'outbound')
      .eq('type', 'email')
      .eq('status', 'sent')
      .gte('sent_at', since)
      .order('sent_at', { ascending: false })
      .limit(50)

    // ── Reminders sent (system) ─────────────────────────────────────────────
    const { data: reminderComms } = await supabase
      .from('communications')
      .select('id, client_id, subject, sent_at')
      .eq('coach_id', coach.id)
      .eq('direction', 'outbound')
      .eq('type', 'reminder')
      .eq('status', 'sent')
      .gte('sent_at', since)
      .order('sent_at', { ascending: false })
      .limit(50)

    // ── Nudges sent ─────────────────────────────────────────────────────────
    const { data: nudges } = await supabase
      .from('nudges')
      .select('id, client_id, type, draft_subject, sent_at, scheduled_for')
      .eq('coach_id', coach.id)
      .eq('status', 'sent')
      .gte('sent_at', since)
      .order('sent_at', { ascending: false })
      .limit(50)

    // ── Transcripts ingested (system) ───────────────────────────────────────
    const { data: transcripts } = await supabase
      .from('transcripts')
      .select('id, client_id, client_initials, filename, title, created_at')
      .eq('coach_id', coach.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)

    // ── Session reports scored (system) ─────────────────────────────────────
    const { data: reports } = await supabase
      .from('session_reports')
      .select('id, client_id, created_at')
      .eq('coach_id', coach.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)

    // Collect all client ids to resolve names in one query
    const allClientIds = Array.from(
      new Set([
        ...(emails || []).map((e) => e.client_id).filter(Boolean),
        ...(reminderComms || []).map((r) => r.client_id).filter(Boolean),
        ...(nudges || []).map((n) => n.client_id).filter(Boolean),
        ...(transcripts || []).map((t) => t.client_id).filter(Boolean),
        ...(reports || []).map((r) => r.client_id).filter(Boolean),
      ]),
    ) as string[]

    const nameMap = new Map<string, string>()
    if (allClientIds.length) {
      const { data: clients } = await supabase.from('clients').select('id, name').in('id', allClientIds)
      for (const c of clients || []) nameMap.set(c.id, c.name)
    }

    const clientName = (id: string | null | undefined, fallback?: string | null) =>
      id ? (nameMap.get(id) || fallback || null) : null

    for (const e of emails || []) {
      items.push({
        id: `email-${e.id}`,
        type: 'email_sent',
        actor: 'coach',
        label: e.subject ? `Sent email: "${e.subject}"` : 'Sent email',
        client_name: clientName(e.client_id),
        timestamp: e.sent_at,
      })
    }

    for (const r of reminderComms || []) {
      items.push({
        id: `reminder-${r.id}`,
        type: 'reminder_sent',
        actor: 'system',
        label: 'Sent appointment reminder',
        client_name: clientName(r.client_id),
        timestamp: r.sent_at,
      })
    }

    const NUDGE_TYPE_LABEL: Record<string, string> = {
      action_checkin: 'action check-in nudge',
      insight: 'insight nudge',
      framework: 'framework nudge',
      reengagement: 're-engagement nudge',
    }

    for (const n of nudges || []) {
      if (!n.sent_at) continue
      // Scheduled nudges (cron-sent) = system; immediate coach sends = coach
      const actor: AccomplishedActor = n.scheduled_for ? 'system' : 'coach'
      const typeLabel = NUDGE_TYPE_LABEL[n.type] || 'nudge'
      items.push({
        id: `nudge-${n.id}`,
        type: 'nudge_sent',
        actor,
        label: n.scheduled_for ? `Sent scheduled ${typeLabel}` : `Sent ${typeLabel}`,
        client_name: clientName(n.client_id),
        timestamp: n.sent_at,
      })
    }

    for (const t of transcripts || []) {
      const name = t.title || t.filename || 'transcript'
      items.push({
        id: `transcript-${t.id}`,
        type: 'transcript_ingested',
        actor: 'system',
        label: `Pulled in transcript: "${name}"`,
        client_name: clientName(t.client_id, t.client_initials),
        timestamp: t.created_at,
      })
    }

    for (const r of reports || []) {
      items.push({
        id: `report-${r.id}`,
        type: 'report_scored',
        actor: 'system',
        label: 'Scored session',
        client_name: clientName(r.client_id),
        timestamp: r.created_at,
      })
    }

    // Sort all items newest-first
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json({ items })
  } catch (e) {
    return toErrorResponse(e)
  }
}
