import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'

// Saved session plans (migration 058) — the "Plan next session" window's
// Save button and the workspace "Session plans" card.
//
//   GET  /api/clients/[id]/plans   → list this client's saved plans (newest first)
//   POST /api/clients/[id]/plans   → save one { plan, notes?, title? }
//
// The GET is defensive: a deploy landing before migration 058 returns an empty
// list flagged `unavailable`, so the card explains itself instead of erroring.

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { data, error } = await supabase
      .from('session_plans')
      .select('id, title, notes, created_at, updated_at')
      .eq('client_id', params.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return NextResponse.json({ plans: [], unavailable: true })
    return NextResponse.json({ plans: data ?? [] })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)

    const body = await req.json().catch(() => ({}))
    const plan = body?.plan
    if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
      return NextResponse.json({ error: 'Missing plan content' }, { status: 400 })
    }
    const notes = typeof body.notes === 'string' ? body.notes : ''

    let title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : ''
    if (!title) {
      const tz = coach.timezone || process.env.DEFAULT_TIMEZONE || 'America/Chicago'
      let day: string
      try {
        day = new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: tz,
        })
      } catch {
        day = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      }
      title = `Session plan · ${day}`
    }

    const { data, error } = await supabase
      .from('session_plans')
      .insert({
        coach_id: coach.id,
        client_id: params.id,
        title,
        plan: plan as Record<string, unknown>,
        notes,
      })
      .select('id, title, notes, created_at, updated_at')
      .single()

    if (error) {
      const missing = error.code === '42P01' || /session_plans/.test(error.message)
      return NextResponse.json(
        {
          error: missing
            ? 'Saving plans needs migration 058_session_plans applied in Supabase.'
            : `Could not save the plan: ${error.message}`,
        },
        { status: 500 }
      )
    }
    return NextResponse.json({ plan: data })
  } catch (e) {
    return toErrorResponse(e)
  }
}
