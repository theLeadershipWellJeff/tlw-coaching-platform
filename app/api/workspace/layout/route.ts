/**
 * Coach-global client workspace layout.
 *
 * Stores one row per coach in `dashboard_layouts` with `surface='client_workspace'`.
 * clientId never appears here — the layout is identical across all clients; only
 * the data each block renders is per-client. GET returns the stored layout (or the
 * default); PUT normalizes, persists, and echoes the result.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { WORKSPACE_BLOCK_META } from '@/lib/dashboard/workspaceBlocks'
import { DEFAULT_WORKSPACE_LAYOUT } from '@/lib/dashboard/defaultWorkspaceLayout'
import type { CardPlacement, CardSize } from '@/lib/dashboard/types'

export const runtime = 'nodejs'

const SURFACE = 'client_workspace'

function normalizeWorkspacePlacements(raw: unknown): CardPlacement[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: CardPlacement[] = []

  const items = [...raw].sort((a, b) => {
    const ao = typeof (a as any)?.order === 'number' ? (a as any).order : 0
    const bo = typeof (b as any)?.order === 'number' ? (b as any).order : 0
    return ao - bo
  })

  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const blockId = String((item as any).blockId ?? '')
    const meta = WORKSPACE_BLOCK_META[blockId]
    if (!meta) continue
    if (seen.has(blockId)) continue

    let size = (item as any).size as CardSize
    if (!meta.supportedSizes.includes(size)) size = meta.defaultSize

    seen.add(blockId)
    out.push({ blockId, size, order: out.length })
  }
  return out
}

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

  const blocks = data ? normalizeWorkspacePlacements(data.blocks) : DEFAULT_WORKSPACE_LAYOUT
  return NextResponse.json({ blocks })
}

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
  const blocks = normalizeWorkspacePlacements(body?.blocks)

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
