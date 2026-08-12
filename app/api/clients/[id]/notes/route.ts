import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { withOrgClaim } from '@/lib/supabase/pg'
import { tenantClaimsFromCoach } from '@/lib/tenant'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import type { Note } from '@/lib/supabase/types'

// List a client's notes (most recent session first). Authorize on the admin
// client (identity + coach_clients gate), then read through an org-scoped
// Postgres transaction so RLS enforces the tenant boundary at the database
// (Phase 1 §5.3, Option A).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const coach = await requireClientCoach(getSupabaseAdmin(), params.id)
    const notes = await withOrgClaim(
      tenantClaimsFromCoach(coach),
      (sql) => sql<Note[]>`
        select * from notes
        where client_id = ${params.id}
        order by session_date desc, created_at desc
      `
    )
    return NextResponse.json({ notes })
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
