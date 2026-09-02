import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'

export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/cron/phone-provision-retry
 *
 * Självläkning av det tystaste grundarberoendet i onboardingen: 46elks-numret.
 *
 * Numret köps på två ställen — i steg 3 (reservationen) och av Stripe-webhooken
 * efter betalningen. Misslyckas BÅDA (46elks nere, slut på nummer i området,
 * krediten slut) står kunden utan AI-nummer och ingenting försöker igen. Det
 * upptäcks först när någon undrar varför telefonen är tyst, och åtgärden är
 * att en grundare kör provisioneringen manuellt.
 *
 * Svepet kör om purchaseAndAssignNumber (idempotent: returnerar befintligt
 * nummer om assigned_phone_number redan är satt) för konton som slutfört
 * onboardingen men saknar nummer. Efter tre dagars misslyckanden larmas
 * driften — då är det inte längre en tillfällig störning.
 *
 * Att svepet KÖPER ett nummer (en verklig 46elks-kostnad) är samma sak som
 * Stripe-webhooken redan gör för varje genomförd onboarding-checkout: alla
 * betalande konton ska ha ett AI-nummer. Svepet lägger alltså inte till en
 * ny kostnadskälla, det gör bara om ett köp som skulle ha skett.
 *
 * SCHEMAT: "42 6 * * *" i vercel.json — en gång per dag, före morgonbriefen,
 * ingen kollision med befintliga rader.
 */

/** Efter så här många dagar utan nummer är det inte längre en tillfällig störning */
const LARM_EFTER_DAGAR = 3

const DYGN_MS = 86_400_000

interface Kandidat {
  business_id: string
  business_name: string | null
  onboarding_completed_at: string
}

async function kor() {
  const supabase = getServerSupabase()

  const { data, error } = await supabase
    .from('business_config')
    .select('business_id, business_name, onboarding_completed_at')
    .not('onboarding_completed_at', 'is', null)
    .is('assigned_phone_number', null)
    // is_pilot kan vara NULL — ett olikhetsfilter mot true hade tappat de
    // raderna (NULL != true är NULL i Postgres, inte sant).
    .or('is_pilot.is.null,is_pilot.eq.false')
    .limit(500)

  if (error) {
    console.error('[phone-provision-retry] kunde inte läsa konton:', error.message)
    return NextResponse.json({ error: 'Kunde inte läsa konton' }, { status: 500 })
  }

  const kandidater = (data || []) as Kandidat[]
  if (kandidater.length === 0) {
    return NextResponse.json({ ok: true, forsokta: 0, lyckade: 0, larmade: 0 })
  }

  const { purchaseAndAssignNumber } = await import('@/lib/phone/purchase-number')
  const now = Date.now()
  let lyckade = 0
  let larmade = 0
  const misslyckade: Array<{ business_id: string; error?: string }> = []

  for (const kandidat of kandidater) {
    let resultat: { ok: boolean; error?: string; details?: unknown }
    try {
      resultat = await purchaseAndAssignNumber(supabase, kandidat.business_id)
    } catch (err) {
      resultat = { ok: false, error: String(err) }
    }

    if (resultat.ok) {
      lyckade++
      continue
    }

    misslyckade.push({ business_id: kandidat.business_id, error: resultat.error })

    // Dag 1–2 är en tillfällig störning som svepet självt löser i morgon.
    // Från dag 3 behöver en människa titta på det.
    const dagarUtanNummer = Math.floor(
      (now - new Date(kandidat.onboarding_completed_at).getTime()) / DYGN_MS,
    )
    if (dagarUtanNummer >= LARM_EFTER_DAGAR) {
      larmade++
      await rapporteraTystFel(
        supabase,
        kandidat.business_id,
        'telefonnummer_saknas',
        `${kandidat.business_name || kandidat.business_id} har saknat AI-nummer i ${dagarUtanNummer} dagar — provisioneringen misslyckas: ${resultat.error || 'okänt fel'}`,
        { dagar: dagarUtanNummer, details: resultat.details },
      ).catch(() => { /* larmet får aldrig fälla svepet */ })
    }
  }

  return NextResponse.json({
    ok: true,
    forsokta: kandidater.length,
    lyckade,
    larmade,
    misslyckade: misslyckade.slice(0, 20),
  })
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return kor()
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return kor()
}
