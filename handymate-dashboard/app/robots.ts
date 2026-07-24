import { MetadataRoute } from 'next'
import { getAppBaseUrl } from '@/lib/site-url'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppBaseUrl()

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/api', '/portal', '/onboarding'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
