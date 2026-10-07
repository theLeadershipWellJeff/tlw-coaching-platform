import type { MetadataRoute } from 'next'
import { SITE_URL, PUBLIC_PAGES } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    changeFrequency: 'monthly',
    priority: path === '/' ? 1 : path === '/join' ? 0.8 : 0.3,
  }))
}
