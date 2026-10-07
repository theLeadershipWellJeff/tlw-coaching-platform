import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/**
 * Only the public product/legal pages are crawlable. Every signed-in surface
 * redirects a logged-out crawler to a sign-in page (Search Console reported
 * these as "Page with redirect"), and token pages (/sign, /agenda,
 * /billing/authorize) must never be fetched by a crawler at all.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/join', '/privacy', '/terms'],
      disallow: [
        '/api/',
        '/auth/',
        '/portal',
        '/dashboard',
        '/clients',
        '/scorecard',
        '/practice',
        '/library',
        '/groups',
        '/templates',
        '/nudges',
        '/account',
        '/business-center',
        '/command-center',
        '/session/',
        '/popout/',
        '/sign/',
        '/agenda/',
        '/billing/',
        '/subscription',
        '/join/welcome',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
