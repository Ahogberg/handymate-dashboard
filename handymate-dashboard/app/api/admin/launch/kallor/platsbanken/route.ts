import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, logAdminAction } from '@/lib/admin-auth'
import { hamtaPlatsbankenTraffar } from '@/lib/launch-desk/rekryteringssignal'
import { traffarTillProspekt } from '@/lib/launch-desk/platsbanken-kalla'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/launch/kallor/platsbanken (2026-09-03)
 *
 * Hämtar hantverksfirmor som annonserar efter folk och gör prospekt av dem.
 * Källan och kvalitetsmåttet är samma sak: en firma som rekryterar växer, och
 * en växande firma har precis fått det administrativa problem vi löser.
 *
 * RUTTEN SKRIVER INGENTING. Den är en källa, inget mer — den returnerar
 * prospekt i exakt den form POST /api/admin/launch/accounts tar emot, och
 * den vägen gör sedan allt det som redan är byggt: dedupe mot befintliga
 * konton, spärrlistan på org/e-post/telefon, härledd lawful_basis och
 * retention_review_at, kanalgrinden och fit_score-kvalificeringen.
 *
 * Det första utkastet anropade importrutten över HTTP med vidarebefordrade
 * cookies. Det var både skört och onödigt: en förhandsvisning som användaren
 * godkänner är en bättre grind än en automatisk skrivning, och klienten har
 * redan importvägen.
 *
 * Kontaktuppgifter till namngivna personer tas ALDRIG med; se
 * lib/launch-desk/platsbanken-kalla.ts för varför.
 */

/** Branschtermer som söks — hantverksyrken formulerade som en annons skriver
 *  dem. Samma anda som TRADE_TERMS i scoring.ts. */
const STANDARDTERMER = [
  'elektriker', 'rörmokare', 'VVS-montör', 'snickare', 'målare',
  'plattsättare', 'takläggare', 'ventilationsmontör', 'anläggningsarbetare',
]

/** Listan får aldrig växa förbi vad en människa hinner ringa. En kö på
 *  tiotusen rader är en kö ingen öppnar. */
const TAK_PER_KORNING = 150

export async function POST(request: NextRequest) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin || !admin.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const termer: string[] = Array.isArray(body?.termer) && body.termer.length > 0
    ? body.termer.filter((t: unknown) => typeof t === 'string' && t.trim()).slice(0, 15)
    : STANDARDTERMER
  const tak = Math.max(1, Math.min(Number(body?.tak) || TAK_PER_KORNING, TAK_PER_KORNING))

  // Fail-soft per term: en term som faller får inte fälla hela körningen.
  const alla = (await Promise.all(termer.map(term => hamtaPlatsbankenTraffar(term, 100)))).flat()
  const { prospekt, bortsorterade } = traffarTillProspekt(alla, { tak })

  await logAdminAction('launch_desk_kalla_platsbanken', admin.userId, null, {
    termer, traffar: alla.length, kandidater: prospekt.length,
  })

  return NextResponse.json({
    sokta_termer: termer,
    traffar_totalt: alla.length,
    kandidater: prospekt.length,
    bortsorterade,
    // Formen är exakt POST /api/admin/launch/accounts body.accounts —
    // klienten kan skicka den vidare orörd.
    prospekt: prospekt.map(({ annons_id: _a, ...rest }) => rest),
  })
}
