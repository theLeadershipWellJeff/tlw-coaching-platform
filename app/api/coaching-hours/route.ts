import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import { accessibleClientIds } from '@/lib/client-access'
import { billedHours } from '@/lib/billing'
import { loadCoachingHours, type HoursPeriod } from '@/lib/coaching-hours'

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const raw = new URL(req.url).searchParams.get('period') || 'week'
    const period: HoursPeriod = ['week', 'month', 'year', 'all'].includes(raw)
      ? (raw as HoursPeriod)
      : 'week'

    // Note-derived sessions + imported/historical entries (migration 049),
    // merged chronologically — see lib/coaching-hours.ts.
    const log = await loadCoachingHours(supabase, coach, period)
    return NextResponse.json(log)
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const body = await req.json()

    const { session_date, client_id, duration_minutes, title } = body
    if (!session_date || !client_id) {
      return NextResponse.json({ error: 'session_date and client_id are required' }, { status: 400 })
    }

    const ids = await accessibleClientIds(supabase, coach.id)
    if (!ids.includes(client_id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('notes')
      .insert({
        client_id,
        session_date,
        duration_minutes: Number.isFinite(duration_minutes) ? Math.round(duration_minutes) : 60,
        title: title || null,
        content: '',
      })
      .select('id, session_date, duration_minutes, title, client_id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: client } = await supabase.from('clients').select('name').eq('id', client_id).single()

    return NextResponse.json({
      session: {
        ...data,
        billed_hours: billedHours(data.duration_minutes ?? 60),
        client_name: client?.name || 'Unknown client',
        source: 'note',
        kind: 'session',
        paid: true,
      },
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}
