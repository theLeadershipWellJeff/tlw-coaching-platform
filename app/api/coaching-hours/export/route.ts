import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import { loadCoachingHours, type HoursPeriod } from '@/lib/coaching-hours'
import { buildCoachingHoursPdf } from '@/lib/coaching-hours-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PERIOD_LABEL: Record<HoursPeriod, string> = {
  week: 'This week',
  month: 'This month',
  year: `This year`,
  all: 'All time (complete record)',
}

/**
 * Download the coaching hours log as a PDF — the re-certification document.
 * Same merged data as GET /api/coaching-hours (note-derived sessions +
 * imported historical entries), rendered by lib/coaching-hours-pdf.ts.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const raw = new URL(req.url).searchParams.get('period') || 'all'
    const period: HoursPeriod = ['week', 'month', 'year', 'all'].includes(raw)
      ? (raw as HoursPeriod)
      : 'all'

    const log = await loadCoachingHours(supabase, coach, period)
    const pdf = await buildCoachingHoursPdf({
      coachName: coach.name,
      coachEmail: coach.email,
      periodLabel: PERIOD_LABEL[period],
      log,
    })

    const filename = `coaching-hours-${period}-${new Date().toISOString().slice(0, 10)}.pdf`
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}
