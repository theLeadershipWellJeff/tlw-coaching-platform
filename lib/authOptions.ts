import GoogleProvider from 'next-auth/providers/google'
import { getSupabaseAdmin } from './supabase/server'
import { storeCoachRefreshToken } from './coach'

export const authOptions = {
  session: {
    strategy: 'jwt' as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            'openid',
            'email',
            'profile',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.compose',
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/drive.readonly',
          ].join(' '),
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    /**
     * Beta gate. When BETA_COACH_EMAILS is set (comma-separated), only those
     * addresses — plus anyone who already has a coaches row — may sign in;
     * everyone else sees NextAuth's AccessDenied page. Unset/empty = open
     * sign-up (the pre-beta behavior). Existing coaches are always allowed so
     * enabling the gate can never lock out someone already onboarded.
     */
    async signIn({ user }: any) {
      const allowlist = (process.env.BETA_COACH_EMAILS || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
      if (allowlist.length === 0) return true
      const email = (user?.email || '').toLowerCase()
      if (!email) return false
      if (allowlist.includes(email)) return true
      try {
        const supabase = getSupabaseAdmin()
        const { data, error } = await supabase
          .from('coaches')
          .select('id')
          .eq('email', email)
          .maybeSingle()
        if (data) return true
        // A read ERROR (not "no row") must fail OPEN — the gate promises an
        // already-onboarded coach can never be locked out, and a transient DB
        // blip must not break that. A genuine stranger just reaches an app that
        // is down anyway; tenant isolation is enforced separately server-side.
        if (error) {
          console.error('Allowlist coach lookup errored — failing open:', error)
          return true
        }
      } catch (e) {
        console.error('Allowlist coach lookup failed — failing open:', e)
        return true
      }
      return false
    },
    async jwt({ token, account }: any) {
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.expiresAt = account.expires_at
        return token
      }
      if (Date.now() < (token.expiresAt as number) * 1000 - 60000) {
        return token
      }
      try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            grant_type: 'refresh_token',
            refresh_token: token.refreshToken as string,
          }),
        })
        const tokens = await response.json()
        if (!response.ok) throw tokens
        return {
          ...token,
          accessToken: tokens.access_token,
          expiresAt: Math.floor(Date.now() / 1000 + tokens.expires_in),
        }
      } catch (error) {
        console.error('Token refresh error:', error)
        return { ...token, error: 'RefreshTokenError' }
      }
    },
    async session({ session, token }: any) {
      session.accessToken = token.accessToken
      session.refreshToken = token.refreshToken
      session.error = token.error
      return session
    },
  },

  events: {
    // Persist the coach's Google refresh token so the unattended transcript
    // webhook can read their calendar. Best-effort — never block sign-in on it.
    async signIn({ user, account }: any) {
      if (!user?.email) return
      try {
        const supabase = getSupabaseAdmin()
        await storeCoachRefreshToken(
          supabase,
          user.email,
          user.name || user.email,
          account?.refresh_token
        )
      } catch (e) {
        console.error('Failed to persist coach refresh token:', e)
      }
    },
  },
}
