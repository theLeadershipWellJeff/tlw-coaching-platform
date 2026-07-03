import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import { accessibleClientIds } from '@/lib/client-access'
import { billedHours } from '@/lib/billing'

function periodStart(period: string): string {
  const now = new Date()
  if (period === 'year') {
    return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
  }
  if (period === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  }
  // week: Monday of the current week
  const day = now.getDay() // 0=Sun
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(now)
  mon.setDate(now.getDate() + diff)
  return mon.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const period = new URL(req.url).searchParams.get('period') || 'week'

    const ids = await accessibleClientIds(supabase, coach.id)
    if (ids.length === 0) {
      return NextResponse.json({ total_minutes: 0, total_hours: 0, sessions: [] })
    }

    const start = periodStart(period)
    const { data: notes, error } = await supabase
      .from('notes')
      .select('id, session_date, duration_minutes, title, client_id')
      .in('client_id', ids)
      .gte('session_date', start)
      .order('session_date', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Fetch client names
    const clientIds = Array.from(new Set((notes || []).map((n) => n.client_id)))
    const { data: clients } = clientIds.length
      ? await supabase.from('clients').select('id, name').in('id', clientIds)
      : { data: [] }
    const nameMap: Record<string, string> = {}
    for (const c of clients || []) nameMap[c.id] = c.name

    const sessions = (notes || []).map((n) => ({
      id: n.id,
      session_date: n.session_date,
      duration_minutes: n.duration_minutes ?? 60,
      billed_hours: billedHours(n.duration_minutes ?? 60),
      title: n.title,
      client_id: n.client_id,
      client_name: nameMap[n.client_id] || 'Unknown client',
    }))

    const total_minutes = sessions.reduce((s, n) => s + n.duration_minutes, 0)
    const total_hours = Math.round((total_minutes / 60) * 10) / 10

    return NextResponse.json({ total_minutes, total_hours, sessions })
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
      },
    })
  } catch (e) {
    return toErrorResponse(e)
  }
}
