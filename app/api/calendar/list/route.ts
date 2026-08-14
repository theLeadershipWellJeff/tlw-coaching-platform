import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse, ApiError } from '@/lib/api-handler'
import { coachCalendarId } from '@/lib/calendar'

export const runtime = 'nodejs'

/**
 * The signed-in coach's Google calendar list, for the Account → Calendar picker.
 * Uses the stored refresh token (same unattended pattern as every calendar
 * read); covered by the already-granted calendar scopes — no re-consent.
 * Only calendars the coach can WRITE to are offered (booking a session inserts
 * an event), plus whichever calendar is currently selected.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)
    if (!coach.google_refresh_token) {
      throw new ApiError(409, 'No Google access on file — sign out and back in to grant calendar access.')
    }

    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: coach.google_refresh_token })
    const calendar = google.calendar({ version: 'v3', auth })

    const res = await calendar.calendarList.list({ maxResults: 250 })
    const selected = coachCalendarId(coach)
    const calendars = (res.data.items || [])
      .filter((c) => c.id && (c.accessRole === 'owner' || c.accessRole === 'writer' || c.id === selected))
      .map((c) => ({
        id: c.id as string,
        summary: c.summary || c.id,
        primary: !!c.primary,
        accessRole: c.accessRole || null,
      }))
      // Primary first, then alphabetical — the common case stays on top.
      .sort((a, b) => Number(b.primary) - Number(a.primary) || a.summary!.localeCompare(b.summary!))

    return NextResponse.json({ calendars, selected })
  } catch (e) {
    return toErrorResponse(e)
  }
}
