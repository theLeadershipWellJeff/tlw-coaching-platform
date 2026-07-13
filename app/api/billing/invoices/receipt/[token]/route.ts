/**
 * GET /api/billing/invoices/receipt/[token]
 *
 * PUBLIC — the token is the credential (same pattern as /api/actions/complete).
 * The "View & pay invoice" button in the client-facing cover + reminder emails
 * points here. On first open it stamps invoices.received_at (idempotent — never
 * overwritten), then redirects to the Stripe hosted payment page.
 *
 * The hosted URL is fetched live from Stripe (not stored) so it can never go
 * stale. If the Stripe invoice can't be resolved, a small branded fallback page
 * tells the client to check the Stripe email instead — receipt is still marked.
 *
 * Same caveat as action-completion links: an aggressive corporate link-scanner
 * may "open" the link and mark the invoice received.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { getStripe } from '@/lib/billing/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: { token: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const token = params.token?.trim()
  if (!token) return htmlPage('Invalid link', 'This invoice link is not valid.', 404)

  const supabase = getSupabaseAdmin()
  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('id, status, received_at, stripe_invoice_id')
    .eq('receipt_token', token)
    .maybeSingle()

  if (error || !invoice) {
    return htmlPage('Invoice not found', 'This invoice link is not valid or has been removed.', 404)
  }

  // Mark received on first open only — never overwrite the original timestamp.
  if (!(invoice as any).received_at) {
    await supabase
      .from('invoices')
      .update({ received_at: new Date().toISOString(), updated_at: new Date().toISOString() } as any)
      .eq('id', invoice.id)
      .is('received_at', null)
  }

  // Redirect to the live Stripe hosted invoice page.
  const stripeInvoiceId = (invoice as any).stripe_invoice_id as string | null
  if (stripeInvoiceId) {
    try {
      const stripeInv = await getStripe().invoices.retrieve(stripeInvoiceId)
      if (stripeInv.hosted_invoice_url) {
        return NextResponse.redirect(stripeInv.hosted_invoice_url, 302)
      }
    } catch {
      // fall through to the fallback page
    }
  }

  return htmlPage(
    'Invoice received',
    'Thanks — we’ve noted that you received this invoice. To view and pay it, please use the link in the Stripe invoice email.',
    200,
  )
}

// Minimal branded page for the no-redirect cases.
function htmlPage(title: string, message: string, status: number) {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${title} · theLeadershipWell</title></head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;padding:60px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:100%;">
        <tr><td style="background:#111226;padding:20px 32px;">
          <p style="margin:0;color:#ffffff;font-size:16px;letter-spacing:1px;">THE LEADERSHIP WELL</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px;color:#111226;font-size:20px;">${title}</h1>
          <p style="margin:0;color:#3d2b1f;font-size:15px;line-height:1.6;">${message}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
