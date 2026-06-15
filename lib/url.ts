/**
 * Absolute base URL for links that live outside the app (e.g. a click-to-log
 * action link emailed to a client, who isn't signed in). Prefers NEXTAUTH_URL
 * (set to the production domain), then Vercel's deployment URL, then localhost.
 */
export function getBaseUrl(): string {
  const explicit = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}
