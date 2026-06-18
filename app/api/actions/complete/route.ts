import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { escapeHtml } from '@/lib/html'

export const runtime = 'nodejs'

// Branded confirmation page returned to the (signed-out) client who tapped a
// checkbox link in their email.
function page(title: string, message: string, status = 200): Response {
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;background:#DDD9D3;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#111226;">
  <div style="max-width:480px;margin:12vh auto 0;background:#fff;border-radius:16px;padding:40px 36px;text-align:center;box-shadow:0 10px 40px rgba(17,18,38,.08);">
    <svg width="44" height="44" viewBox="0 0 100 100" fill="none" style="margin-bottom:18px;">
      <polyline points="62,10 10,10 10,90 90,90 90,46" stroke="#0C1940" stroke-width="7" fill="none" stroke-linecap="square"/>
      <line x1="76" y1="16" x2="76" y2="40" stroke="#E8650A" stroke-width="7" stroke-linecap="round"/>
      <line x1="64" y1="28" x2="88" y2="28" stroke="#E8650A" stroke-width="7" stroke-linecap="round"/>
    </svg>
    <h1 style="font-size:20px;font-weight:600;margin:0 0 10px;">${title}</h1>
    <p style="font-size:14px;color:#403832;line-height:1.6;margin:0;">${message}</p>
    <p style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8B8680;margin-top:28px;">theLeadershipWell</p>
  </div>
</body></html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=UTF-8' } })
}

// GET /api/actions/complete?token=<uuid> — mark an action done (idempotent).
// Public: the token is the credential, so the client need not be signed in.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')?.trim()
  if (!token) return page('Link not recognized', 'This link is missing its code. Please use the checkbox in your email.', 400)

  let supabase: ReturnType<typeof getSupabaseAdmin>
  try {
    supabase = getSupabaseAdmin()
  } catch {
    return page('Something went wrong', 'We couldn’t reach the server. Please try again in a moment.', 500)
  }

  const { data: action } = await supabase
    .from('actions')
    .select('id, description, status')
    .eq('complete_token', token)
    .maybeSingle()

  if (!action) {
    return page('Link not recognized', 'This action couldn’t be found. It may have been removed.', 404)
  }

  if (action.status !== 'done') {
    const { error } = await supabase
      .from('actions')
      .update({ status: 'done', completed_at: new Date().toISOString(), completed_via: 'email' })
      .eq('id', action.id)
    if (error) {
      console.error('[actions/complete] failed to mark action done', { actionId: action.id, error: error.message })
      return page('Something went wrong', 'We couldn’t log that just now. Please try the link again in a moment.', 500)
    }
  }

  // action.description is coach-authored — escape before it enters the HTML page.
  const desc = action.description ? `“${escapeHtml(action.description)}”` : 'your action'
  return page(
    'Marked complete ✓',
    `Nice work — we’ve logged ${desc} as done. Your coach will see it.`
  )
}
