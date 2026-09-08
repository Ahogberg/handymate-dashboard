import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { checkPublicRateLimitDb } from '@/lib/rate-limit-db'
import { generateQuoteFromInput } from '@/lib/ai-quote-generator'
import { describeBranches, resolveBusinessBranch } from '@/lib/branch'
import { buildWorkSample } from '@/lib/onboarding/work-sample'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Bounded onboarding demonstration; never creates a quote, customer or message. */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Logga in för att förbereda ditt arbetsprov.' }, { status: 401 })
  const user = await getCurrentUser(request, business.business_id)
  if (!user || !isOwnerOrAdmin(user) || business._impersonation) return NextResponse.json({ error: 'Arbetsprovet kräver ägarens eller administratörens inloggning.' }, { status: 403 })
  const body: unknown = await request.json().catch(() => null)
  const source = body && typeof body === 'object' && 'source' in body && typeof body.source === 'string' ? body.source.trim() : ''
  if (source.length < 8 || source.length > 4000) return NextResponse.json({ error: 'Beskriv jobbet med 8–4 000 tecken.' }, { status: 400 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'Arbetsprovet är inte tillgängligt just nu. Du kan fortsätta och behålla förfrågan.' }, { status: 503 })
  // Separate, fail-closed demo allowance. No change to subscription or paid fuel gates.
  const companyLimit = await checkPublicRateLimitDb(`work-sample:${business.business_id}`, { maxRequests: 3, windowMs: 30 * 86400000 })
  if (!companyLimit.allowed) return NextResponse.json({ error: 'Arbetsprovets tre försök är använda eller kan inte verifieras. Ditt sparade underlag finns kvar.' }, { status: 429 })
  const globalLimit = await checkPublicRateLimitDb('work-sample:global', { maxRequests: 200, windowMs: 86400000 })
  if (!globalLimit.allowed) return NextResponse.json({ error: 'Arbetsprovet är tillfälligt upptaget. Försök senare eller fortsätt med din förfrågan.' }, { status: 429 })
  try {
    const quote = await generateQuoteFromInput({ businessId: business.business_id,
      branch: describeBranches(resolveBusinessBranch(business)), hourlyRate: null,
      textDescription: source, priceList: [], templates: [] })
    return NextResponse.json({ sample: buildWorkSample(source, quote) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[work-sample] Generation failed', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ error: 'Underlaget kunde inte färdigställas. Din text finns kvar; försök igen eller fortsätt.' }, { status: 503 })
  }
}
