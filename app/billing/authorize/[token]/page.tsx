import { getSupabaseAdmin } from '@/lib/supabase/server'
import { AUTHORIZATION_TEXT, logAuthorizationEvent } from '@/lib/billing/payment-methods'
import { AddCardButton } from './AddCardButton'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PUBLIC authorization page — no authentication. The token is the credential
// (same pattern as app/sign/[token] and app/agenda/[token]).

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', background: '#F2F2F0', padding: '32px 16px' }}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-email.png" width={170} alt="theLeadershipWell" style={{ display: 'inline-block', height: 'auto' }} />
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: '40px 44px', boxShadow: '0 10px 40px rgba(17,18,38,.06)' }}>
          {children}
        </div>
      </div>
    </main>
  )
}

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <Shell>
      <h1 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 28, color: '#111226', margin: '0 0 10px' }}>{title}</h1>
      <p style={{ fontSize: 14, color: '#8B8680', fontFamily: "'DM Sans',sans-serif" }}>{message}</p>
    </Shell>
  )
}

export default async function AuthorizePage({ params }: { params: { token: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.token)) {
    return <Notice title="This link is not valid" message="Please contact your coach for a new link." />
  }

  const supabase = getSupabaseAdmin()
  const { data: account } = await supabase
    .from('billing_accounts')
    .select('id, coach_id, name, payment_method_status, payment_method_brand, payment_method_last4')
    .eq('authorization_token', params.token)
    .maybeSingle()

  if (!account) {
    return <Notice title="This link is not valid" message="Please contact your coach for a new link." />
  }
  if ((account as any).payment_method_status === 'active') {
    const brand = (account as any).payment_method_brand
    const last4 = (account as any).payment_method_last4
    return (
      <Notice
        title="You're all set"
        message={`A card${brand && last4 ? ` (${brand} ending ${last4})` : ''} is already on file. There's nothing more to do — thank you.`}
      />
    )
  }

  // Log the page view (best-effort audit).
  await logAuthorizationEvent(supabase, {
    billingAccountId: (account as any).id,
    coachId: (account as any).coach_id,
    event: 'page_viewed',
  })

  return (
    <Shell>
      <h1 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 30, color: '#111226', margin: '0 0 8px' }}>
        Set up automatic payments
      </h1>
      <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, color: '#403832', lineHeight: 1.6, margin: '0 0 20px' }}>
        Store a card securely so your coaching fees are paid automatically as they come due — on the
        terms set out in your signed coaching agreement. No more paying each invoice by hand.
      </p>

      <div style={{ background: '#F7F5F1', borderRadius: 12, padding: '18px 20px', margin: '0 0 8px' }}>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#5b544d', lineHeight: 1.6, margin: 0 }}>
          {AUTHORIZATION_TEXT}
        </p>
      </div>
      <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: '#8B8680', lineHeight: 1.6, margin: '12px 0 0' }}>
        Your card details are entered on Stripe's secure, PCI-compliant page. theLeadershipWell never
        sees or stores your full card number. You can remove your card at any time by contacting your coach.
      </p>

      <AddCardButton token={params.token} />
    </Shell>
  )
}
