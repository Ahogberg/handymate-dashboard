import { NextRequest, NextResponse } from 'next/server'
import { checkPublicRateLimitDb, hashClientIp } from '@/lib/rate-limit-db'
import { rapporteraTillSentry } from '@/lib/observability/sentry'

export const dynamic = 'force-dynamic'

/**
 * POST /api/foretagsskannern/spar — anonym, publik räknare för Företagsskannern
 * (pass 1a, tasks/plan-foretagsskannern.md, Del 4).
 *
 * INGA personuppgifter, inget filinnehåll: bara { steg, kunder, fakturor }.
 * Skriver ingen databasrad (kräver business_id, som en anonym besökare aldrig
 * har) — rapporteras i stället som en Sentry-breadcrumb (console.info + nivå
 * 'info') så Andreas kan se volymen utan en ny tabell i det här passet.
 *
 * Fail-closed IP-tak (samma mönster som app/api/storefront/contact/route.ts):
 * 30 anrop/timme per IP. Honeypot-fältet `_hp` — om det är ifyllt svarar vi
 * framgång utan att skriva något, så en bot inte får feedback.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { steg, kunder, fakturor, _hp } = body

    if (_hp) {
      return NextResponse.json({ success: true })
    }

    if (steg !== 'skannad' && steg !== 'konto') {
      return NextResponse.json({ error: 'Ogiltigt steg' }, { status: 400 })
    }
    const kunderAntal = Number.isFinite(kunder) ? Math.max(0, Math.round(Number(kunder))) : 0
    const fakturorAntal = Number.isFinite(fakturor) ? Math.max(0, Math.round(Number(fakturor))) : 0

    const rateCheck = await checkPublicRateLimitDb(`foretagsskannern-spar:ip:${hashClientIp(request)}`, {
      maxRequests: 30,
      windowMs: 60 * 60 * 1000,
    })
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'För många förfrågningar. Försök igen om en stund.' },
        { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((rateCheck.resetAt - Date.now()) / 1000))) } },
      )
    }

    console.info('[foretagsskannern] spar', { steg, kunder: kunderAntal, fakturor: fakturorAntal })
    rapporteraTillSentry({
      meddelande: `foretagsskannern:${steg}`,
      niva: 'info',
      tags: { yta: 'foretagsskannern', steg },
      extra: { kunder: kunderAntal, fakturor: fakturorAntal },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Okänt fel'
    console.error('[foretagsskannern/spar] Oväntat fel:', message)
    return NextResponse.json({ error: 'Kunde inte spara.' }, { status: 500 })
  }
}
