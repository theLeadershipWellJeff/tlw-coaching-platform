import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The signed-in coach's profile (the bits the app lets them see/edit).
export async function GET() {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    coach: {
      name: coach.name,
      email: coach.email,
      role: coach.role,
      timezone: coach.timezone,
      supervisor_email: coach.supervisor_email,
    },
  })
}

/**
 * Update the coach's editable profile. Currently just the supervisor email.
 * Body: { supervisorEmail: string | null }  ("" clears it)
 */
export async function PATCH(req: NextRequest) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  if (!('supervisorEmail' in body)) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }

  const raw = String(body.supervisorEmail ?? '').trim()
  let supervisor_email: string | null
  if (raw === '') {
    supervisor_email = null
  } else if (EMAIL_RE.test(raw)) {
    supervisor_email = raw.toLowerCase()
  } else {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('coaches')
    .update({ supervisor_email })
    .eq('id', coach.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ supervisor_email })
}
