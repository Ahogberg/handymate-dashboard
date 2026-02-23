import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || ''

  // Storefront subdomain routing: {slug}.handymate.se → /site/{slug}
  const storefrontMatch = hostname.match(/^([a-z0-9-]+)\.handymate\.se$/)
  if (storefrontMatch) {
    const slug = storefrontMatch[1]
    // Skip known subdomains
    if (!['www', 'app', 'dashboard', 'api'].includes(slug)) {
      return NextResponse.rewrite(new URL(`/site/${slug}`, request.url))
    }
  }

  const response = NextResponse.next()

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()')

  // Allow widget and storefront pages to be embedded in iframes, block everything else
  const path = request.nextUrl.pathname
  if (!path.startsWith('/widget') && !path.startsWith('/site')) {
    response.headers.set('X-Frame-Options', 'DENY')
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
