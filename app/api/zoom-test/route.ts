// app/api/zoom-test/route.ts
// Test endpoint: verifies Zoom OAuth + list + detail-fetch all work.
// GET /api/zoom-test (requires authenticated session)

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { listRecentSummaries, getMeetingSummaryDetail } from '@/lib/zoom';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summaries = await listRecentSummaries(90);

    let firstDetail = null;
    let detailError = null;
    if (summaries.length > 0) {
      try {
        firstDetail = await getMeetingSummaryDetail(summaries[0].meeting_uuid);
      } catch (e) {
        detailError = e instanceof Error ? e.message : 'unknown';
      }
    }

    return NextResponse.json({
      ok: true,
      list_count: summaries.length,
      list_sample: summaries.slice(0, 3).map(s => ({
        topic: s.meeting_topic,
        start: s.meeting_start_time,
        host: s.meeting_host_email,
      })),
      detail_test: firstDetail ? {
        topic: firstDetail.meeting_topic,
        start: firstDetail.meeting_start_time,
        summary_title: firstDetail.summary_title,
        summary_overview: firstDetail.summary_overview?.substring(0, 400),
        next_steps_count: firstDetail.next_steps?.length || 0,
        next_steps_sample: firstDetail.next_steps?.slice(0, 5),
        sections_count: firstDetail.summary_details?.length || 0,
        sections_sample: firstDetail.summary_details?.slice(0, 3).map(d => ({
          label: d.label,
          summary: d.summary?.substring(0, 250),
        })),
      } : null,
      detail_error: detailError,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
