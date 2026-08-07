import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { launchGateForPath } from '@/lib/launch-visibility'

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

  // ── Lanseringsgrind ───────────────────────────────────────────────
  //
  // Att dölja menylänken räcker inte: en sparad URL, en gammal bokmärkning eller
  // en knapp som missats någon annanstans tar kunden rakt in i en halvfärdig vy
  // utan väg tillbaka. Grinden ligger här för att den är ren sökvägslogik —
  // ingen databas, ingen session, en regel som täcker alla ingångar samtidigt.
  //
  // Detta är INTE auth. Auth sker per route via getAuthenticatedBusiness();
  // middleware blockerar fortfarande ingen inloggning.
  if (launchGateForPath(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
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
