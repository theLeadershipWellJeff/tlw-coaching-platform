import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import type { Database } from '@/lib/supabase/types'

// One saved session plan (migration 058).
//
//   GET    → the full row (the floating window / pop-out loads a saved plan)
//   PATCH  → partial update { notes?, title?, plan? } (notepad autosave;
//            Regenerate refreshes the stored brief)
//   DELETE → remove it (the Session plans card's ✕)
//
// Every query is scoped to BOTH the plan id and the tenant-gated client id, so
// another client's plan id 404s rather than revealing it exists.

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; planId: string } }
) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { data, error } = await supabase
      .from('session_plans')
      .select('id, title, plan, notes, created_at, updated_at')
      .eq('id', params.planId)
      .eq('client_id', params.id)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    return NextResponse.json({ plan: data })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; planId: string } }
) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const body = await req.json().catch(() => ({}))
    const patch: Database['public']['Tables']['session_plans']['Update'] = {
      updated_at: new Date().toISOString(),
    }
    if (typeof body.notes === 'string') patch.notes = body.notes
    if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim().slice(0, 200)
    if (body.plan && typeof body.plan === 'object' && !Array.isArray(body.plan)) {
      patch.plan = body.plan as Record<string, unknown>
    }

    const { data, error } = await supabase
      .from('session_plans')
      .update(patch)
      .eq('id', params.planId)
      .eq('client_id', params.id)
      .select('id, title, notes, created_at, updated_at')
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
    return NextResponse.json({ plan: data })
  } catch (e) {
    return toErrorResponse(e)
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; planId: string } }
) {
  try {
    const supabase = getSupabaseAdmin()
    await requireClientCoach(supabase, params.id)

    const { error } = await supabase
      .from('session_plans')
      .delete()
      .eq('id', params.planId)
      .eq('client_id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return toErrorResponse(e)
  }
}
