import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

/** Read the coach's per-competency improvement focus notes. */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({ focus: coach.competency_focus || {} })
}

/** Save the improvement note for one competency. Body: { competencyId, text }. */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const competencyId = Number(body.competencyId)
  if (!Number.isInteger(competencyId) || competencyId < 1 || competencyId > 8) {
    return NextResponse.json({ error: 'competencyId must be 1..8' }, { status: 400 })
  }
  const text = String(body.text ?? '').trim()

  const supabase = getSupabaseAdmin()
  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const focus: Record<string, string> = { ...(coach.competency_focus || {}) }
  if (text) focus[String(competencyId)] = text
  else delete focus[String(competencyId)]

  const { error } = await supabase.from('coaches').update({ competency_focus: focus }).eq('id', coach.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ focus })
}
