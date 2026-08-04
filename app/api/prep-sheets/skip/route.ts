import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { escapeHtml } from '@/lib/html'

export const runtime = 'nodejs'

// Branded confirmation page for the coach who tapped the one-click Skip link in
// their review email. Coach-facing (not client-facing), but the same interstitial
// pattern as the client action-complete page.
function page(title: string, message: string, status = 200): Response {
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;background:#F2F2F0;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#111226;">
  <div style="max-width:480px;margin:12vh auto 0;background:#fff;border-radius:16px;padding:40px 36px;text-align:center;box-shadow:0 10px 40px rgba(17,18,38,.08);">
    <h1 style="font-size:20px;font-weight:600;margin:0 0 10px;">${title}</h1>
    <p style="font-size:14px;color:#403832;line-height:1.6;margin:0;">${message}</p>
    <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8B8680;margin-top:28px;">theLeadershipWell</p>
  </div>
</body></html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=UTF-8' } })
}

// GET /api/prep-sheets/skip?token=<uuid> — skip a prep sheet from the review
// email. Public: the token is the single-use credential. Idempotent-ish: a token
// is invalidated on first use, so a re-tap reports it's already handled.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim()
  if (!token) return page('Link not recognized', 'This link is missing its code.', 400)

  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch {
    return page('Something went wrong', 'We couldn’t reach the server. Please try again in a moment.', 500)
  }

  const { data: sheet } = await supabase
    .from('prep_sheet_pipeline')
    .select('id, status, client_id')
    .eq('skip_token', token)
    .maybeSingle()

  if (!sheet) {
    // Token was already consumed (skip is single-use) or never existed.
    return page('Already handled', 'This prep sheet has already been skipped, sent, or refreshed. Nothing more to do.', 200)
  }

  const clientRes = await supabase.from('clients').select('name').eq('id', sheet.client_id).maybeSingle()
  const who = clientRes.data?.name ? escapeHtml(clientRes.data.name) : 'this client'

  if (sheet.status === 'sent') {
    return page('Already sent', `The prep sheet for ${who} has already gone out — it can’t be skipped now.`, 200)
  }
  if (sheet.status === 'skipped') {
    return page('Already skipped', `The prep sheet for ${who} is already skipped. Nothing more to do.`, 200)
  }

  // draft | approved | failed → skip and invalidate the token (single-use).
  const { error } = await supabase
    .from('prep_sheet_pipeline')
    .update({
      status: 'skipped',
      skip_reason: 'coach_choice',
      skipped_at: new Date().toISOString(),
      skip_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sheet.id)
    .eq('skip_token', token) // guard the race: only the first tap wins
  if (error) {
    return page('Something went wrong', 'We couldn’t skip that just now. Please try the link again in a moment.', 500)
  }

  return page('Skipped ✓', `The prep sheet for ${who} won’t be sent. You can always build one by hand from the client’s workspace.`)
}
