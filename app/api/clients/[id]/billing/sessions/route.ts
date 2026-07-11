import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { coachCanAccessClient } from '@/lib/client-access'
import { getEngagementProgress } from '@/lib/billing/engagement-progress'

export const runtime = 'nodejs'

type Params = { params: { id: string } }

// The client's engagement type + sessions progress (workspace name card and
// Billing block). Shared math with the roster cards — see
// lib/billing/engagement-progress.ts for the per-mode semantics (a
// subscription's bar is sessions received this calendar year vs. sessions
// per year; a fixed engagement's is all-time sessions vs. the engagement's
// session count).
export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canAccess = await coachCanAccessClient(supabase, coach.id, params.id)
  if (!canAccess) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const progress = await getEngagementProgress(supabase, coach.id, [params.id])
  const entry = progress[params.id]

  return NextResponse.json({
    sessions: entry
      ? [
          {
            engagementId: entry.engagementId,
            billingMode: entry.mode,
            label: entry.label,
            sessionsUsed: entry.used,
            // Null when no session count is set — show the label + count, no bar.
            sessionCount: entry.total,
          },
        ]
      : [],
  })
}
