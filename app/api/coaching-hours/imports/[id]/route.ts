import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'

/**
 * Edit / delete an imported coaching-hours entry (coaching_hours_entries,
 * migration 049). Mirrors /api/coaching-hours/[id], which handles the
 * note-backed rows — the widget picks the endpoint off each row's `source`.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const body = await req.json()

    const { data: entry } = await supabase
      .from('coaching_hours_entries')
      .select('id')
      .eq('id', params.id)
      .eq('coach_id', coach.id)
      .maybeSingle()
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const updates: {
      duration_minutes?: number
      session_date?: string
      client_label?: string
      title?: string | null
      paid?: boolean
    } = {}
    if (Number.isFinite(body.duration_minutes) && body.duration_minutes > 0) {
      updates.duration_minutes = Math.round(body.duration_minutes)
    }
    if (typeof body.session_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.session_date)) {
      updates.session_date = body.session_date
    }
    if (typeof body.client_label === 'string' && body.client_label.trim()) {
      updates.client_label = body.client_label.trim().slice(0, 200)
    }
    if (body.title !== undefined) updates.title = body.title ? String(body.title).slice(0, 300) : null
    if (typeof body.paid === 'boolean') updates.paid = body.paid

    const { error } = await supabase
      .from('coaching_hours_entries')
      .update(updates)
      .eq('id', params.id)
      .eq('coach_id', coach.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)

    const { error, count } = await supabase
      .from('coaching_hours_entries')
      .delete({ count: 'exact' })
      .eq('id', params.id)
      .eq('coach_id', coach.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!count) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}
