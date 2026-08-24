import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { requireSupervisor, toErrorResponse } from '@/lib/api-handler'
import {
  getOrCreateCoachStripeCustomer,
  createCoachSubscriptionCheckout,
} from '@/lib/billing/stripe'
import { getBaseUrl } from '@/lib/url'
import { sendCoachHtmlEmail } from '@/lib/gmail'
import { logAdminAction } from '@/lib/admin/audit'

export const runtime = 'nodejs'

/**
 * POST /api/coaches/[id]/billing/checkout — mint a Stripe hosted Checkout link
 * that starts this coach's platform subscription (price = STRIPE_COACH_PRICE_ID).
 *
 * Always returns the checkout URL for copy/paste; body `{ email: true }` also
 * emails it to the coach from the acting supervisor's Gmail. The plan flips to
 * 'paying' when the checkout.session.completed webhook lands — never here.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getSupabaseAdmin()
  let actor
  try {
    actor = await requireSupervisor(supabase)
  } catch (e) {
    return toErrorResponse(e)
  }

  const body = await req.json().catch(() => ({}))
  const emailIt = body?.email === true

  const { data: coach } = await supabase
    .from('coaches')
    .select('id, name, email, stripe_customer_id, stripe_subscription_id, subscription_status')
    .eq('id', params.id)
    .maybeSingle()
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 })

  if (
    (coach as any).stripe_subscription_id &&
    ['active', 'trialing', 'past_due'].includes((coach as any).subscription_status ?? '')
  ) {
    return NextResponse.json(
      { error: 'This coach already has a live subscription — manage it from the Stripe billing portal.' },
      { status: 409 }
    )
  }

  try {
    const customerId = await getOrCreateCoachStripeCustomer({
      stripeCustomerId: (coach as any).stripe_customer_id ?? null,
      coachId: coach.id,
      name: coach.name,
      email: coach.email,
    })
    if (customerId !== (coach as any).stripe_customer_id) {
      await supabase
        .from('coaches')
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() } as any)
        .eq('id', coach.id)
    }

    const base = getBaseUrl()
    const session = await createCoachSubscriptionCheckout({
      customerId,
      coachId: coach.id,
      successUrl: `${base}/business-center/coaches?billing=success`,
      cancelUrl: `${base}/business-center/coaches?billing=cancelled`,
    })
    if (!session.url) throw new Error('Stripe returned no checkout URL')

    let emailed = false
    if (emailIt && actor.google_refresh_token) {
      const firstName = (coach.name || '').split(' ')[0] || 'there'
      emailed = await sendCoachHtmlEmail(actor, {
        to: coach.email,
        cc: '',
        subject: 'Set up your theLeadershipWell subscription',
        html: `
<div style="font-family:Georgia,'Times New Roman',serif;color:#111226;line-height:1.55;max-width:520px;">
  <p style="margin:0 0 16px;">Hi ${firstName},</p>
  <p style="margin:0 0 16px;">Here is your link to set up billing for your theLeadershipWell coaching platform account. Payment is handled securely by Stripe.</p>
  <p style="margin:0 0 20px;"><a href="${session.url}" style="display:inline-block;background:#1a1f5e;color:#ffffff;padding:10px 22px;border-radius:6px;text-decoration:none;font-family:sans-serif;font-size:14px;">Set up billing</a></p>
  <p style="margin:0 0 16px;font-size:13px;color:#8a7f78;">The link expires after 24 hours — if it does, just ask and we'll send a fresh one.</p>
</div>`,
      })
    }

    await logAdminAction(supabase, {
      actorCoachId: actor.id,
      action: 'billing_checkout_link',
      targetCoachId: coach.id,
      detail: { emailed },
    })

    return NextResponse.json({ url: session.url, emailed })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Stripe checkout failed' }, { status: 500 })
  }
}
