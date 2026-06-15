import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { sendScorecardEmail } from '@/lib/scorecard-email'
import type { SessionReportJson } from '@/lib/scoring/types'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Email this scored report on demand. The coach can send it to themselves or to
 * another address. (Supervisor delivery will be added once supervisor contact
 * info is stored on the coach.)
 * Body: { recipient: 'self' | 'other', email?: string }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const recipient =
    body.recipient === 'other' || body.recipient === 'supervisor' ? body.recipient : 'self'

  let to: string
  if (recipient === 'other') {
    to = String(body.email || '').trim()
    if (!EMAIL_RE.test(to)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }
  } else if (recipient === 'supervisor') {
    to = (coach.supervisor_email || '').trim()
    if (!to) {
      return NextResponse.json(
        { error: 'No supervisor email on file — add one on the Account page.' },
        { status: 400 }
      )
    }
  } else {
    to = (coach.email || '').trim()
    if (!to) return NextResponse.json({ error: 'Your account has no email address.' }, { status: 400 })
  }

  const { data: row, error } = await supabase
    .from('session_reports')
    .select('report')
    .eq('id', params.id)
    .eq('coach_id', coach.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    await sendScorecardEmail(coach, row.report as SessionReportJson, { to })
    return NextResponse.json({ sent: true, to })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not send the email.' }, { status: 502 })
  }
}
