import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, getSupabaseForClaims } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { tenantClaimsFromCoach } from '@/lib/tenant'

// List a client's notes (most recent session first).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Authorize on the admin client (identity + coach_clients gate), then read
    // the data through the org-scoped JWT client so RLS backstops the tenant
    // boundary at the database (Phase 1 §5.3).
    const admin = getSupabaseAdmin()
    const coach = await requireClientCoach(admin, params.id)
    const db = getSupabaseForClaims(tenantClaimsFromCoach(coach))

    const { data, error } = await db
      .from('notes')
      .select('*')
      .eq('client_id', params.id)
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ notes: data })
  } catch (e) {
    return toErrorResponse(e)
  }
}

// Create a note for a client.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const body = await req.json().catch(() => ({}))

    const { data, error } = await supabase
      .from('notes')
      .insert({
        client_id: params.id,
        title: body.title?.trim() || null,
        content: typeof body.content === 'string' ? body.content : '',
        session_date: body.session_date || undefined,
        duration_minutes: Number.isFinite(body.duration_minutes) ? Math.round(body.duration_minutes) : 60,
        calendar_event_id: body.calendar_event_id?.trim() || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ note: data }, { status: 201 })
  } catch (e) {
    return toErrorResponse(e)
  }
}
