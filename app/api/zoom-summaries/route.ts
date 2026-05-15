// app/api/zoom-summaries/route.ts
// Fetches Zoom AI Companion summaries matched to a specific client.
// GET /api/zoom-summaries?clientName=...&sessionTimes=ISO,ISO,ISO

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { matchZoomSummariesForClient } from '@/lib/matchZoomToClient'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const sessionTimes = searchParams.get('sessionTimes')

  if (!sessionTimes) {
    return NextResponse.json({ error: 'sessionTimes required (comma-separated ISO dates)' }, { status: 400 })
  }

  const times = sessionTimes.split(',').map(t => t.trim()).filter(Boolean)

  try {
    const summaries = await matchZoomSummariesForClient(times, 5)

    return NextResponse.json({
      matched: summaries.length,
      summaries: summaries.map(s => ({
        meeting_uuid: s.meeting_uuid,
        meeting_start_time: s.meeting_start_time,
        meeting_end_time: s.meeting_end_time,
        summary_title: s.summary_title,
        summary_overview: s.summary_overview,
        summary_details: s.summary_details,
        next_steps: s.next_steps,
      })),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Zoom summaries error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
