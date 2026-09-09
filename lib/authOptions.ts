import GoogleProvider from 'next-auth/providers/google'
import { getSupabaseAdmin } from './supabase/server'
import { getCoachByEmail, storeCoachRefreshToken } from './coach'

export const authOptions = {
  // A denied sign-in (no coaches row) renders our own plain page instead of
  // NextAuth's default error screen.
  pages: { error: '/auth/error' },
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
     * SIGN-IN GATE (2026-09-09, security decision — see APP_STATE.md). The
     * `coaches` table is the allowlist: a Google account may sign in only when a
     * coaches row already exists for its email. Nothing is created here — a
     * coach is onboarded by a supervisor (Command Center → POST /api/coaches).
     * `BETA_COACH_EMAILS` no longer grants entry. A lookup ERROR fails CLOSED:
     * denying a real coach during a database outage costs a retry; admitting a
     * stranger costs the tenant boundary. Rejection lands on /auth/error
     * (pages.error below) as a plain "not authorized" page.
     */
    async signIn({ user }: any) {
      const email = (user?.email || '').trim().toLowerCase()
      if (!email) return false
      try {
        const coach = await getCoachByEmail(getSupabaseAdmin(), email)
        return !!coach
      } catch (e) {
        console.error('[auth] coach lookup failed — denying sign-in (fail closed):', e)
        return false
      }
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
    // Runs only for an admitted account (the callback above already required a
    // coaches row); it updates that row and never creates one.
    async signIn({ user, account }: any) {
      if (!user?.email) return
      try {
        const supabase = getSupabaseAdmin()
        await storeCoachRefreshToken(supabase, user.email, account?.refresh_token)
      } catch (e) {
        console.error('Failed to persist coach refresh token:', e)
      }
    },
  },
}
