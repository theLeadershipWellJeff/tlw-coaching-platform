/**
 * The public, canonical origin. Search engines are told this is the one
 * address for every public page (canonical tags, sitemap, robots), so the
 * Vercel preview URL, www, and query-string variants all fold into it.
 * Deliberately a constant, not getBaseUrl(): that resolves to the deployment
 * URL on previews, which must never be declared canonical.
 */
export const SITE_URL = 'https://theleadershipwell.online'

/** The pages meant to be found in search. Everything else is the app. */
export const PUBLIC_PAGES = ['/', '/join', '/privacy', '/terms'] as const
