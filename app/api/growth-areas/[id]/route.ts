import { NextRequest, NextResponse } from 'next/server'
import type { GrowthAreaBand } from '@/lib/supabase/types'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

type Ctx = { params: { id: string } }

/** Fetch one growth area (coach-scoped). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('coach_growth_areas')
    .select('*')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ area: data })
}

/**
 * Update a growth area. Increments definition_version when any substantive
 * field changes (title, description, anchors, band_scale). Status changes
 * (archive/restore) do not bump the version.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: existing, error: fetchErr } = await supabase
    .from('coach_growth_areas')
    .select('*')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .single()

  if (fetchErr || !existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))

  type AreaUpdate = {
    updated_at?: string
    title?: string
    description?: string
    least_proficient_when?: string
    most_proficient_when?: string
    band_scale?: GrowthAreaBand[]
    status?: 'active' | 'archived'
    definition_version?: number
  }
  const updates: AreaUpdate = { updated_at: new Date().toISOString() }

  // Substantive fields that bump the definition_version on change.
  let substantiveChanged = false
  const substantive = ['title', 'description', 'least_proficient_when', 'most_proficient_when'] as const
  for (const field of substantive) {
    if (field in body) {
      const val = String(body[field] ?? '').trim()
      if (val !== (existing[field] ?? '')) substantiveChanged = true
      updates[field] = val
    }
  }

  if ('band_scale' in body && Array.isArray(body.band_scale)) {
    // Check if band_scale content changed (coarse JSON comparison).
    if (JSON.stringify(body.band_scale) !== JSON.stringify(existing.band_scale)) {
      substantiveChanged = true
    }
    updates.band_scale = body.band_scale as GrowthAreaBand[]
  }

  if ('status' in body && ['active', 'archived'].includes(body.status)) {
    updates.status = body.status
  }

  if (substantiveChanged) {
    updates.definition_version = (existing.definition_version ?? 1) + 1
  }

  const { data, error } = await supabase
    .from('coach_growth_areas')
    .update(updates)
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ area: data })
}

/** Soft-delete: archive the growth area (never hard-delete — assessments reference it). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('coach_growth_areas')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('coach_id', coach.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
