import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import { accessibleClientIds } from '@/lib/client-access'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    const body = await req.json()

    const ids = await accessibleClientIds(supabase, coach.id)
    const { data: note } = await supabase
      .from('notes')
      .select('id, client_id')
      .eq('id', params.id)
      .single()

    if (!note || !ids.includes(note.client_id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const updates: {
      duration_minutes?: number
      session_date?: string
      title?: string | null
    } = {}
    if (Number.isFinite(body.duration_minutes)) {
      updates.duration_minutes = Math.round(body.duration_minutes)
    }
    if (body.session_date) updates.session_date = body.session_date
    if (body.title !== undefined) updates.title = body.title || null

    const { error } = await supabase.from('notes').update(updates).eq('id', params.id)
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

    const ids = await accessibleClientIds(supabase, coach.id)
    const { data: note } = await supabase
      .from('notes')
      .select('id, client_id')
      .eq('id', params.id)
      .single()

    if (!note || !ids.includes(note.client_id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { error } = await supabase.from('notes').delete().eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}
