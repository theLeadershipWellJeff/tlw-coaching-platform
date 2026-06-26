import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

const MAX_ACTIVE = 5

/** List all growth areas for the signed-in coach (active first, then archived). */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('coach_growth_areas')
    .select('*')
    .eq('coach_id', coach.id)
    .order('status', { ascending: true }) // 'active' sorts before 'archived'
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ areas: data ?? [] })
}

/** Create a new growth area. Enforces the 5-active cap. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Enforce the 5-active cap before inserting.
  const { count, error: countErr } = await supabase
    .from('coach_growth_areas')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coach.id)
    .eq('status', 'active')
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })
  if ((count ?? 0) >= MAX_ACTIVE) {
    return NextResponse.json(
      { error: `You can have at most ${MAX_ACTIVE} active growth areas. Archive one to add another.` },
      { status: 422 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const title = String(body.title ?? '').trim()
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('coach_growth_areas')
    .insert({
      coach_id: coach.id,
      title,
      description: String(body.description ?? '').trim(),
      least_proficient_when: String(body.least_proficient_when ?? '').trim(),
      most_proficient_when: String(body.most_proficient_when ?? '').trim(),
      band_scale: Array.isArray(body.band_scale) ? body.band_scale : [],
      status: 'active',
      definition_version: 1,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ area: data }, { status: 201 })
}
