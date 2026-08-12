import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'

export type HistoryItem =
  | { kind: 'note'; id: string; title: string | null; session_date: string | null; created_at: string }
  | { kind: 'communication'; id: string; type: string; subject: string | null; preview: string | null; status: string; sent_at: string }
  | { kind: 'nudge'; id: string; nudge_type: string; subject: string | null; sent_at: string }
  | { kind: 'report'; id: string; overall_score: number | null; band: string | null; session_date: string | null; created_at: string }

// Unified client history timeline — merges notes, emails, nudges, and scored
// session reports into a single reverse-chronological feed for the workspace.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const [notesRes, commsRes, nudgesRes, reportsRes] = await Promise.all([
      supabase
        .from('notes')
        .select('id, title, session_date, created_at')
        .eq('client_id', params.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('communications')
        .select('id, type, direction, subject, preview, status, sent_at')
        .eq('client_id', params.id)
        .order('sent_at', { ascending: false })
        .limit(50),
      supabase
        .from('nudges')
        .select('id, type, draft_subject, sent_at')
        .eq('client_id', params.id)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(50),
      supabase
        .from('session_reports')
        .select('id, overall_score, band, session_date, created_at')
        .eq('client_id', params.id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    const notes: HistoryItem[] = (notesRes.data || []).map((n) => ({
      kind: 'note',
      id: n.id,
      title: n.title,
      session_date: n.session_date,
      created_at: n.created_at,
    }))

    const comms: HistoryItem[] = (commsRes.data || []).map((c) => ({
      kind: 'communication',
      id: c.id,
      type: c.type,
      subject: c.subject,
      preview: c.preview,
      status: c.status,
      sent_at: c.sent_at,
    }))

    const nudges: HistoryItem[] = (nudgesRes.data || []).map((n) => ({
      kind: 'nudge',
      id: n.id,
      nudge_type: n.type,
      subject: n.draft_subject,
      sent_at: n.sent_at ?? '',
    }))

    const reports: HistoryItem[] = (reportsRes.data || []).map((r) => ({
      kind: 'report',
      id: r.id,
      overall_score: r.overall_score,
      band: r.band,
      session_date: r.session_date,
      created_at: r.created_at,
    }))

    // Merge and sort by timestamp descending
    const all = [...notes, ...comms, ...nudges, ...reports]
    all.sort((a, b) => {
      const tA = a.kind === 'communication' || a.kind === 'nudge' ? a.sent_at : a.created_at
      const tB = b.kind === 'communication' || b.kind === 'nudge' ? b.sent_at : b.created_at
      return new Date(tB).getTime() - new Date(tA).getTime()
    })

    return NextResponse.json({ history: all })
  } catch (e) {
    return toErrorResponse(e)
  }
}
