import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { normalizePlacements } from '@/lib/dashboard/validate'
import { DEFAULT_DASHBOARD_LAYOUT } from '@/lib/dashboard/defaultLayout'

export const runtime = 'nodejs'

const SURFACE = 'dashboard'

/**
 * The signed-in coach's dashboard layout. No stored row → the default layout
 * (we don't persist the default until the coach actually customizes). Stored
 * blocks are normalized so a removed/renamed card or stale size can never reach
 * the renderer.
 */
export async function GET() {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('dashboard_layouts')
    .select('blocks')
    .eq('coach_id', coach.id)
    .eq('surface', SURFACE)
    .maybeSingle()

  const blocks = data ? normalizePlacements(data.blocks) : DEFAULT_DASHBOARD_LAYOUT
  return NextResponse.json({ blocks })
}

/**
 * Save the coach's layout (last-write-wins). The posted blocks are normalized
 * before persisting, and we echo the normalized result so the client stays in
 * sync with exactly what was stored.
 */
export async function PUT(req: NextRequest) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const blocks = normalizePlacements(body?.blocks)

  const { error } = await supabase.from('dashboard_layouts').upsert(
    {
      coach_id: coach.id,
      surface: SURFACE,
      blocks,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'coach_id,surface' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ blocks })
}
