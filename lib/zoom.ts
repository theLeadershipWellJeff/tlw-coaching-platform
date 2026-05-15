// lib/zoom.ts
// Server-to-Server OAuth client for Zoom API.
// Fetches AI Companion meeting summaries (list + detail).

interface ZoomTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface ZoomSummaryListItem {
  meeting_uuid: string;
  meeting_id: number;
  meeting_topic: string;
  meeting_start_time: string;
  meeting_end_time: string;
  meeting_host_email: string;
}

export interface ZoomSummaryDetail {
  meeting_uuid: string;
  meeting_id: number;
  meeting_topic: string;
  meeting_start_time: string;
  meeting_end_time: string;
  meeting_host_email: string;
  summary_title?: string;
  summary_overview?: string;
  summary_details?: Array<{ label: string; summary: string }>;
  next_steps?: string[];
}

interface ZoomSummaryListResponse {
  next_page_token?: string;
  page_size: number;
  total_records: number;
  summaries: ZoomSummaryListItem[];
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getZoomAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error(
      'Zoom credentials missing. Check ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET in Vercel env vars.'
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'account_credentials',
      account_id: accountId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoom OAuth failed: ${response.status} ${errorText}`);
  }

  const data: ZoomTokenResponse = await response.json();

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

/**
 * List AI Companion meeting summaries from the past N days.
 * Returns lightweight metadata only (no summary content).
 */
export async function listRecentSummaries(daysBack: number = 90): Promise<ZoomSummaryListItem[]> {
  const token = await getZoomAccessToken();

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - daysBack);
  const from = fromDate.toISOString().split('T')[0];

  const url = new URL('https://api.zoom.us/v2/meetings/meeting_summaries');
  url.searchParams.set('from', from);
  url.searchParams.set('page_size', '100');

  const response = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoom API listSummaries failed: ${response.status} ${errorText}`);
  }

  const data: ZoomSummaryListResponse = await response.json();
  return data.summaries || [];
}

/**
 * Fetch the full AI Companion summary for a specific meeting.
 * Includes title, overview, structured sections, and next steps.
 *
 * Note: Zoom meeting_uuid values that contain '/' or start with '/'
 * must be double URL-encoded per Zoom API docs.
 */
export async function getMeetingSummaryDetail(meetingUUID: string): Promise<ZoomSummaryDetail> {
  const token = await getZoomAccessToken();

  let encodedUUID = encodeURIComponent(meetingUUID);
  if (meetingUUID.startsWith('/') || meetingUUID.includes('//')) {
    encodedUUID = encodeURIComponent(encodedUUID);
  }

  const url = `https://api.zoom.us/v2/meetings/${encodedUUID}/meeting_summary`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zoom API getSummaryDetail failed: ${response.status} ${errorText}`);
  }

  return await response.json();
}
