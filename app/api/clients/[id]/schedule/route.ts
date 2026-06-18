import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getSessionCoach } from '@/lib/coach'
import { zonedWallClockToUtc, createCoachingEvent } from '@/lib/calendar'

export const runtime = 'nodejs'

/**
 * Schedule the next coaching session — creates a Google Calendar event on the
 * coach's primary calendar and emails the invite to the client.
 *
 * Body: { date: 'YYYY-MM-DD', time: 'HH:MM', duration?: number, noteId?: string }
 * The picked wall-clock time is interpreted in the coach's timezone. Uses the
 * live session access token (the coach is in the UI), so it needs the writable
 * calendar.events scope — granted at sign-in.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const date = String(body.date || '').trim()
  const time = String(body.time || '').trim()
  const duration = Number(body.duration)
  const minutes = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 55

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'Pick a date and time for the session.' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, email')
    .eq('id', params.id)
    .maybeSingle()
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const coach = await getSessionCoach(supabase)
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 401 })

  const start = zonedWallClockToUtc(date, time, coach.timezone)
  if (!start) return NextResponse.json({ error: 'Could not read the date and time.' }, { status: 400 })
  const end = new Date(start.getTime() + minutes * 60_000)

  try {
    const event = await createCoachingEvent({
      accessToken: session.accessToken as string,
      summary: `${client.name} · Coaching Session`,
      description: 'Coaching session with Jeff Holmes · theLeadershipWell',
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      timeZone: coach.timezone,
      attendeeEmail: client.email,
    })

    // Link the created event back to the note this was scheduled from, if any.
    if (typeof body.noteId === 'string' && body.noteId) {
      await supabase
        .from('notes')
        .update({ calendar_event_id: event.id })
        .eq('id', body.noteId)
        .eq('client_id', params.id)
    }

    return NextResponse.json({
      eventId: event.id,
      htmlLink: event.htmlLink,
      start: start.toISOString(),
    })
  } catch (e: any) {
    const status = e?.code || e?.response?.status
    const msg = String(e?.message || '')
    if (status === 403 || status === 401 || /insufficient|scope|permission/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            'Google needs calendar access. Sign out and back in to grant it, then try scheduling again.',
        },
        { status: 403 }
      )
    }
    return NextResponse.json({ error: msg || 'Could not create the event.' }, { status: 502 })
  }
}
