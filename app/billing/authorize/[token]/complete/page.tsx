import { getSupabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Stripe Checkout return_url. The card attach + status flip happen on the
// setup_intent.succeeded webhook (which may land a beat after this redirect), so
// this page shows a warm success state regardless — the card is being confirmed.

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', background: '#F2F2F0', padding: '32px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
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

export default async function AuthorizeCompletePage({ params }: { params: { token: string } }) {
  let cardLine = ''
  if (/^[0-9a-f-]{36}$/i.test(params.token)) {
    const supabase = getSupabaseAdmin()
    const { data: account } = await supabase
      .from('billing_accounts')
      .select('payment_method_brand, payment_method_last4, payment_method_status')
      .eq('authorization_token', params.token)
      .maybeSingle()
    const brand = (account as any)?.payment_method_brand
    const last4 = (account as any)?.payment_method_last4
    if ((account as any)?.payment_method_status === 'active' && brand && last4) {
      cardLine = ` Your ${brand} ending ${last4} is now on file.`
    }
  }

  return (
    <Shell>
      <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
      <h1 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 28, color: '#111226', margin: '0 0 10px' }}>
        Thank you — you&apos;re all set
      </h1>
      <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, color: '#403832', lineHeight: 1.6, margin: 0 }}>
        Your card has been stored securely and future coaching fees will be paid automatically as they
        come due.{cardLine} You&apos;ll receive a receipt each time a payment is made. You can close this page.
      </p>
    </Shell>
  )
}
