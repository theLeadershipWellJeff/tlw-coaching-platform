import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { generateBandScale } from '@/lib/growth-areas/bands'

export const runtime = 'nodejs'

type Ctx = { params: { id: string } }

/**
 * Generate a 1–5 band scale for a growth area from its anchor phrases.
 * Returns the generated bands WITHOUT saving them — the client PATCHes the
 * area to persist (so the coach can review before committing).
 *
 * Body may override the anchor phrases if the coach is editing them in the
 * same flow before saving. If omitted, uses the stored values.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // For a brand-new area (id = 'new'), the client passes the anchor phrases
  // directly in the body since there is no DB row yet.
  let title: string
  let description: string
  let leastProficientWhen: string
  let mostProficientWhen: string

  const body = await req.json().catch(() => ({}))

  if (params.id === 'new') {
    title = String(body.title ?? '').trim()
    description = String(body.description ?? '').trim()
    leastProficientWhen = String(body.least_proficient_when ?? '').trim()
    mostProficientWhen = String(body.most_proficient_when ?? '').trim()
  } else {
    const { data: area, error: fetchErr } = await supabase
      .from('coach_growth_areas')
      .select('*')
      .eq('id', params.id)
      .eq('coach_id', coach.id)
      .single()

    if (fetchErr || !area) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Body fields override stored values (coach may be editing in the same flow).
    title = String(body.title ?? area.title).trim()
    description = String(body.description ?? area.description).trim()
    leastProficientWhen = String(body.least_proficient_when ?? area.least_proficient_when).trim()
    mostProficientWhen = String(body.most_proficient_when ?? area.most_proficient_when).trim()
  }

  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })
  if (!leastProficientWhen || !mostProficientWhen) {
    return NextResponse.json(
      { error: 'Both anchor phrases ("least proficient when" and "most proficient when") are required.' },
      { status: 400 }
    )
  }

  try {
    const bands = await generateBandScale(title, description, leastProficientWhen, mostProficientWhen)
    return NextResponse.json({ bands })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Band scale generation failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
