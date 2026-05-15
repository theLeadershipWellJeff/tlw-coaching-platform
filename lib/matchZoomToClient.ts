// lib/matchZoomToClient.ts
// Given a client name and their upcoming session time, find matching Zoom
// AI Companion summaries by aligning Zoom meeting times with Google Calendar.

import {
  listRecentSummaries,
  getMeetingSummaryDetail,
  type ZoomSummaryListItem,
  type ZoomSummaryDetail,
} from './zoom'

const TIME_WINDOW_MS = 15 * 60 * 1000 // ±15 minutes

/**
 * Find Zoom meeting summaries that match a specific client's past sessions.
 *
 * Matching strategy (Zoom topics are useless — all say "Personal Meeting Room"):
 * 1. Pull all Zoom summaries from the last 90 days
 * 2. Accept an array of known session times for this client (from Google Calendar history or CA notes)
 * 3. Match Zoom meetings whose start time falls within ±15 min of a known session time
 * 4. Fetch full detail for each match (up to maxResults)
 */
export async function matchZoomSummariesForClient(
  knownSessionTimes: string[], // ISO date strings of this client's past sessions
  maxResults: number = 5,
): Promise<ZoomSummaryDetail[]> {
  if (knownSessionTimes.length === 0) return []

  const summaries = await listRecentSummaries(90)
  if (summaries.length === 0) return []

  const knownTimestamps = knownSessionTimes.map(t => new Date(t).getTime())

  // Find summaries whose start time aligns with a known session time
  const matched = summaries.filter(s => {
    const zoomStart = new Date(s.meeting_start_time).getTime()
    return knownTimestamps.some(
      known => Math.abs(zoomStart - known) <= TIME_WINDOW_MS
    )
  })

  // Sort by most recent first
  matched.sort(
    (a, b) =>
      new Date(b.meeting_start_time).getTime() -
      new Date(a.meeting_start_time).getTime()
  )

  // Fetch full details for each match (capped)
  const toFetch = matched.slice(0, maxResults)
  const details: ZoomSummaryDetail[] = []

  for (const item of toFetch) {
    try {
      const detail = await getMeetingSummaryDetail(item.meeting_uuid)
      details.push(detail)
    } catch (e) {
      console.error(`Failed to fetch Zoom detail for ${item.meeting_uuid}:`, e)
    }
  }

  return details
}
