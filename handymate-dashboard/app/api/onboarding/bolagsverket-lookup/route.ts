import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { checkRateLimitDb } from '@/lib/rate-limit-db'
import { extractClientIp } from '@/lib/onboarding/website-scrape'
import { checkOrgNumber } from '@/lib/karin/org-number'
import { lookupCompany } from '@/lib/bolagsverket/client'

export const dynamic = 'force-dynamic'

/**
 * POST /api/onboarding/bolagsverket-lookup
 *
 * Org.nr flyttat till FÖRSTA frågan i Step2Business (2026-08-15, se
 * tasks/todo.md) — slår upp företagsnamn/adress/bolagsform hos
 * Bolagsverket innan resten av onboardingen visas. Samma mönster som
 * app/api/onboarding/scrape-website/route.ts: ingen hård auth-spärr
 * (frågan ställs innan kontot finns), rate-limitad per business/IP,
 * degraderar ALLTID snällt — routen returnerar aldrig 500. Org.nr-fältet
 * går fortfarande att fylla i manuellt om uppslaget misslyckas.
 */

function buildBolagsverketRateLimitKey(ip: string, businessId: string | null): string {
  return businessId ? `bolagsverket:business:${businessId}` : `bolagsverket:${ip}`
}

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request).catch(() => null)

    const ip = extractClientIp(
      request.headers.get('x-forwarded-for'),
      request.headers.get('x-real-ip'),
    )
    const rateLimitKey = buildBolagsverketRateLimitKey(ip, business?.business_id ?? null)
    const rateLimit = await checkRateLimitDb(rateLimitKey, {
      maxRequests: 5,
      windowMs: 60 * 60 * 1000, // 1 timme
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { ok: false, reason: 'Du har provat lite för många gånger — vänta en stund och försök igen.' },
        { status: 429 },
      )
    }

    const body = await request.json().catch(() => null)
    const rawOrgNumber = body?.orgNumber
    if (!rawOrgNumber || typeof rawOrgNumber !== 'string') {
      return NextResponse.json({ ok: false, reason: 'Inget organisationsnummer angavs' })
    }

    const orgCheck = checkOrgNumber(rawOrgNumber)
    if (!orgCheck.valid) {
      return NextResponse.json({ ok: false, reason: orgCheck.error || 'Organisationsnumret ser inte giltigt ut' })
    }

    const result = await lookupCompany(rawOrgNumber)
    if (!result.ok) {
      const REASON_TEXT: Record<string, string> = {
        not_configured: 'Uppslag mot Bolagsverket är inte aktiverat än',
        not_found: 'Hittade inget företag med det organisationsnumret',
        invalid_response: 'Kunde inte tolka svaret från Bolagsverket',
        request_failed: 'Kunde inte nå Bolagsverket just nu',
        rate_limited: 'Bolagsverket svarade att vi frågar för ofta — försök igen om en liten stund',
      }
      return NextResponse.json({ ok: false, reason: REASON_TEXT[result.reason] || 'Kunde inte slå upp företaget' })
    }

    return NextResponse.json({ ok: true, data: result.data })
  } catch (error: unknown) {
    // Samma "aldrig fastna"-princip som scrape-website — ett fel i uppslaget
    // ska aldrig blockera onboarding, bara falla tillbaka till manuell ifyllning.
    console.error('[bolagsverket-lookup] oväntat fel:', error)
    return NextResponse.json({ ok: false, reason: 'Något gick fel — fyll i manuellt istället' })
  }
}
