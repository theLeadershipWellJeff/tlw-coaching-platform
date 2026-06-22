import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { zonedWallClockToUtc } from '@/lib/calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Midnight Monday of the current week, in the coach's timezone, as an instant. */
function weekStartIso(tz: string): string {
  const now = new Date()
  const parts: Record<string, string> = {}
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)) {
    parts[p.type] = p.value
  }
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
  const base = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day))
  base.setUTCDate(base.getUTCDate() - ((wd + 6) % 7)) // back to Monday
  const ymd = `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(
    base.getUTCDate()
  ).padStart(2, '0')}`
  return zonedWallClockToUtc(ymd, '00:00', tz)?.toISOString() ?? base.toISOString()
}

/**
 * Emails Sent lego — the coach's outbound communications log across ALL their
 * clients (the per-client view lives on the workspace card). Read-only: rows
 * deep-link out to Gmail. Surfaces the communications log only — never key_info.
 */
export async function GET() {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tz = coach.timezone || process.env.DEFAULT_TIMEZONE || 'America/Los_Angeles'

  // Recent sends (newest first) + a this-week count for the compact size.
  const [{ data: comms }, { count: weekCount }] = await Promise.all([
    supabase
      .from('communications')
      .select('id, client_id, type, subject, preview, status, gmail_message_id, sent_at')
      .eq('coach_id', coach.id)
      .eq('direction', 'outbound')
      .order('sent_at', { ascending: false })
      .limit(50),
    supabase
      .from('communications')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', coach.id)
      .eq('direction', 'outbound')
      .gte('sent_at', weekStartIso(tz)),
  ])

  const rows = comms || []
  const seen: Record<string, true> = {}
  const ids: string[] = []
  for (const r of rows) {
    if (r.client_id && !seen[r.client_id]) {
      seen[r.client_id] = true
      ids.push(r.client_id)
    }
  }
  const { data: clients } = ids.length
    ? await supabase.from('clients').select('id, name').in('id', ids)
    : { data: [] as { id: string; name: string }[] }
  const nameById: Record<string, string> = {}
  for (const c of clients || []) nameById[c.id] = c.name

  const items = rows.map((r) => ({
    id: r.id,
    clientName: (r.client_id && nameById[r.client_id]) || '—',
    type: r.type,
    subject: r.subject,
    preview: r.preview,
    status: r.status,
    gmailMessageId: r.gmail_message_id,
    sentAt: r.sent_at,
  }))

  return NextResponse.json({ weekCount: weekCount || 0, items })
}
