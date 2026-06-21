import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireCoach, toErrorResponse } from '@/lib/api-handler'
import { accessibleClientIds } from '@/lib/client-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The coach's "favorite" timezones for the picker — learned from the zones they
 * actually use. The coach's own timezone leads, followed by the timezones already
 * assigned to their clients, most-used first. So the more people the coach
 * schedules in a zone, the higher it sits. Capped to a short list.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireCoach(supabase)

    const ids = await accessibleClientIds(supabase, coach.id)
    const counts = new Map<string, number>()
    if (ids.length > 0) {
      const { data } = await supabase.from('clients').select('timezone').in('id', ids)
      for (const row of data || []) {
        const tz = row.timezone
        if (tz) counts.set(tz, (counts.get(tz) || 0) + 1)
      }
    }

    const byUse = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tz]) => tz)

    // Coach's own zone first (a very common pick), then client zones by use.
    const favorites: string[] = []
    for (const tz of [coach.timezone, ...byUse]) {
      if (tz && !favorites.includes(tz)) favorites.push(tz)
    }

    return NextResponse.json({ favorites: favorites.slice(0, 8) })
  } catch (e) {
    return toErrorResponse(e)
  }
}
