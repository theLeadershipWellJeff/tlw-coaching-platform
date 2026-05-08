// app/api/zoom-test/route.ts
// Test endpoint to verify Zoom OAuth + Summary API access.
// GET /api/zoom-test (requires authenticated session)

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { listRecentSummaries } from '@/lib/zoom';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summaries = await listRecentSummaries(90);

    return NextResponse.json({
      ok: true,
      count: summaries.length,
      sample: summaries.slice(0, 3).map(s => ({
        topic: s.meeting_topic,
        start: s.meeting_start_time,
        host: s.meeting_host_email,
        title: s.summary_title,
        overview: s.summary_overview?.substring(0, 200),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
