import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { normalizePlacements } from '@/lib/dashboard/validate'
import { DEFAULT_BUSINESS_CENTER_LAYOUT } from '@/lib/dashboard/defaultBusinessCenterLayout'

export const runtime = 'nodejs'

const SURFACE = 'business-center' as const

export async function GET() {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('dashboard_layouts')
    .select('blocks')
    .eq('coach_id', coach.id)
    .eq('surface', SURFACE)
    .maybeSingle()

  const blocks = data ? normalizePlacements(data.blocks, SURFACE) : DEFAULT_BUSINESS_CENTER_LAYOUT
  return NextResponse.json({ blocks })
}

export async function PUT(req: NextRequest) {
  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const blocks = normalizePlacements(body?.blocks, SURFACE)

  const { error } = await supabase.from('dashboard_layouts').upsert(
    { coach_id: coach.id, surface: SURFACE, blocks, updated_at: new Date().toISOString() },
    { onConflict: 'coach_id,surface' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ blocks })
}
