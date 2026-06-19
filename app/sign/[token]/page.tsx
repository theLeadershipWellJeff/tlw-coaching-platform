import { getSupabaseAdmin } from '@/lib/supabase/server'
import { SigningForm } from './SigningForm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PUBLIC magic-link signing page — no authentication. The token is the credential.
// Token validation + document load happen server-side here (the brief's
// GET /api/agreements/sign/[token] is folded into this server component).

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', background: '#F2F2F0', padding: '32px 16px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          {/* PNG logo (never SVG) */}
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
      <p style={{ fontSize: 14, color: '#8B8680' }}>{message}</p>
    </Shell>
  )
}

export default async function SignPage({ params }: { params: { token: string } }) {
  // Validate the token shape before hitting the DB.
  if (!/^[0-9a-f-]{36}$/i.test(params.token)) {
    return <Notice title="This link is not valid" message="Please contact your coach for a new link." />
  }

  const supabase = getSupabaseAdmin()
  const { data: agreement } = await supabase
    .from('agreements')
    .select('id, title, body_html, status, signed_at, signing_token_expires_at, client_name')
    .eq('sign_token', params.token)
    .maybeSingle()

  if (!agreement) {
    return <Notice title="This link is not valid" message="Please contact your coach for a new link." />
  }
  if (agreement.status === 'active' || agreement.signed_at) {
    return <Notice title="Already signed" message="You've already signed this agreement. Thank you." />
  }
  if (agreement.signing_token_expires_at && new Date(agreement.signing_token_expires_at) < new Date()) {
    return <Notice title="This link has expired" message="Please contact your coach to request a new one." />
  }

  return (
    <Shell>
      <div style={{ textAlign: 'center', marginBottom: 22 }}>
        <h1 style={{ fontFamily: "'Cormorant Garamond',Georgia,serif", fontSize: 28, color: '#111226', margin: '0 0 6px' }}>
          Coaching Agreement
        </h1>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#8B8680', margin: 0 }}>
          Please read this agreement carefully before signing.
        </p>
      </div>

      {/* The agreement document (server-rendered snapshot). */}
      <div dangerouslySetInnerHTML={{ __html: agreement.body_html || '' }} />

      <SigningForm token={params.token} clientName={agreement.client_name || ''} />
    </Shell>
  )
}
