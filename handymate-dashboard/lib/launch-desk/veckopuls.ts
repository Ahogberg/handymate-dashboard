/**
 * Veckopuls — "ett tal per fredag" (docs/gtm/SALJMASKINEN.md), fyra
 * kontrollerbara tal + läget + varningar, lästa ur befintliga tabeller.
 * Ingen ny tabell, ingen migration (tasks/plan-veckopuls.md).
 *
 * Vecka = måndag 00:00 Europe/Stockholm till nu. Räkna ALDRIG veckostart i
 * UTC — det ger fel svar varje söndagkväll och varje måndagmorgon. Samma
 * tidszonsidiom som lib/tysta-timmar.ts (stockholmMinutesNow), fast här
 * behövs kalenderdatumet också, inte bara klockslaget.
 *
 * "Aktiva konton" ÅTERANVÄNDER lib/admin/adoption.ts — husets enda
 * definition av "aktiv" ("≥4 ytor inom 30 dagar"). Ingen ny definition
 * skrivs här.
 *
 * Fail-soft: fel på EN källa ger 0 för just det talet + console.warn,
 * aldrig ett kastat fel som fäller hela panelen.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { PAID_STATES } from '@/lib/onboarding/payment-gate'
import {
  hamtaAdoptionHandelser,
  computeAdoption,
  aggregateAdoption,
  type AdoptionBusiness,
} from '@/lib/admin/adoption'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

const DYGN_MS = 86_400_000
const KONTO_60_DAGAR_GRANS_MS = 60 * DYGN_MS

export interface Veckopuls {
  /** ISO — måndag 00:00 svensk tid för innevarande vecka. */
  veckostart: string
  /** gtm_activity, outcome in (attempted, no_answer, spoke), veckan */
  kontakter: number
  /** gtm_activity, outcome in (meeting_booked, demo_booked), veckan */
  genomgangarBokade: number
  /** gtm_activity, outcome = offer_sent, veckan */
  erbjudandenSkickade: number
  /** gtm_activity, outcome = 'won', veckan */
  signeradeVeckan: number
  /** gtm_account, status = 'won', alla tider */
  signeradeTotalt: number
  /** business_config, subscription_status in PAID_STATES */
  betalandeKonton: number
  /** Adoptionsmåttet (lib/admin/adoption.ts) — "aktiv på ≥4 ytor/30 d" */
  aktivaKonton: number
  /** betalande OCH onboarding_completed_at äldre än 60 dagar */
  konton60Dagar: number
  /** raddningsarende, status in (öppet, pågående) */
  raddningskoOppna: number
}

/**
 * UTC-offset i minuter för Europe/Stockholm vid en given instant. Sverige
 * växlar mellan GMT+1 (vintertid) och GMT+2 (sommartid) — ingen extern
 * tz-databas behövs, `Intl` känner redan till övergångarna.
 */
function stockholmOffsetMinuter(nar: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Stockholm',
    timeZoneName: 'shortOffset',
  }).formatToParts(nar)
  const tz = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+1'
  const m = /GMT([+-]\d+)(?::(\d+))?/.exec(tz)
  if (!m) return 60
  const timmar = Number(m[1])
  const minuter = m[2] ? Number(m[2]) : 0
  return timmar * 60 + (timmar < 0 ? -minuter : minuter)
}

/**
 * Ren funktion: måndag 00:00 svensk tid för veckan som innehåller `nu`.
 * Testad deterministiskt i tests/veckopuls.spec.ts, inklusive ett
 * söndagkväll-fall och ett fall över sommartidsövergången.
 */
export function veckostartStockholm(nu: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(nu)
  const varde = (typ: string) => parts.find(p => p.type === typ)?.value || ''
  const ar = Number(varde('year'))
  const manad = Number(varde('month'))
  const dag = Number(varde('day'))
  const VECKODAGAR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const isoVeckodag = VECKODAGAR.indexOf(varde('weekday')) + 1 // 1 = mån ... 7 = sön
  const dagarTillbaka = isoVeckodag > 0 ? isoVeckodag - 1 : 0

  // Gissning: måndagens kalenderdatum tolkat som UTC-midnatt. Det är bara
  // ett par timmar fel jämfört med den verkliga svenska midnatten — gott
  // nog för att slå upp rätt UTC-offset, eftersom sommar-/vintertidsbytet
  // aldrig sker i timmarna kring midnatt.
  const gissning = new Date(Date.UTC(ar, manad - 1, dag - dagarTillbaka, 0, 0, 0))
  const offset = stockholmOffsetMinuter(gissning)
  return new Date(gissning.getTime() - offset * 60_000)
}

async function safeCount(
  kalla: string,
  korQuery: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  try {
    const { count, error } = await korQuery()
    if (error) {
      if (!arSchemaSaknas(error)) console.warn(`[veckopuls] ${kalla} kunde inte läsas (0 rapporterat):`, error.message)
      return 0
    }
    return count || 0
  } catch (err) {
    if (!arSchemaSaknas(err)) console.warn(`[veckopuls] ${kalla} kastade oväntat (0 rapporterat):`, err)
    return 0
  }
}

/**
 * Hämtar hela veckopulsen. Varje tal har sin egen fail-soft-gren — en trasig
 * källa ger 0 för just det talet, aldrig ett kastat fel som fäller panelen.
 */
export async function hamtaVeckopuls(supabase: SupabaseClient, nu: Date = new Date()): Promise<Veckopuls> {
  const veckostart = veckostartStockholm(nu)
  const veckostartIso = veckostart.toISOString()
  const nuIso = nu.toISOString()
  const gransFor60Dagar = new Date(nu.getTime() - KONTO_60_DAGAR_GRANS_MS).toISOString()
  const betaldaStatusar = [...PAID_STATES]

  // Rad 1 — veckans gtm_activity-utfall. EN fråga, fyra tal ur samma svar
  // (samma "källa" i fail-soft-mening — går den sönder blir alla fyra 0).
  let kontakter = 0
  let genomgangarBokade = 0
  let erbjudandenSkickade = 0
  let signeradeVeckan = 0
  try {
    const { data, error } = await supabase.from('gtm_activity').select('outcome').gte('happened_at', veckostartIso)
    if (error) throw error
    for (const rad of (data || []) as Array<{ outcome: string }>) {
      if (rad.outcome === 'attempted' || rad.outcome === 'no_answer' || rad.outcome === 'spoke') kontakter++
      else if (rad.outcome === 'meeting_booked' || rad.outcome === 'demo_booked') genomgangarBokade++
      else if (rad.outcome === 'offer_sent') erbjudandenSkickade++
      else if (rad.outcome === 'won') signeradeVeckan++
    }
  } catch (err) {
    if (!arSchemaSaknas(err)) console.warn('[veckopuls] gtm_activity (veckans utfall) kunde inte läsas (0 rapporterat):', err)
  }

  const signeradeTotalt = await safeCount('gtm_account (signerade totalt)', () =>
    supabase.from('gtm_account').select('id', { count: 'exact', head: true }).eq('status', 'won'),
  )

  const betalandeKonton = await safeCount('business_config (betalande konton)', () =>
    supabase.from('business_config').select('business_id', { count: 'exact', head: true }).in('subscription_status', betaldaStatusar),
  )

  const konton60Dagar = await safeCount('business_config (konton äldre än 60 dagar)', () =>
    supabase
      .from('business_config')
      .select('business_id', { count: 'exact', head: true })
      .in('subscription_status', betaldaStatusar)
      .lte('onboarding_completed_at', gransFor60Dagar),
  )

  const raddningskoOppna = await safeCount('raddningsarende (öppna)', () =>
    supabase.from('raddningsarende').select('id', { count: 'exact', head: true }).in('status', ['oppet', 'pagaende']),
  )

  // Aktiva konton — ÅTERANVÄNDER adoptionsmåttet. Ingen egen "aktiv" här.
  let aktivaKonton = 0
  try {
    const { data, error } = await supabase.from('business_config').select('business_id, onboarding_completed_at')
    if (error) throw error
    const businesses: AdoptionBusiness[] = ((data || []) as Array<{ business_id: string; onboarding_completed_at: string | null }>).map(
      r => ({ business_id: r.business_id, onboarding_completed_at: r.onboarding_completed_at }),
    )
    const handelserPerForetag = await hamtaAdoptionHandelser(supabase, businesses)
    const adoptionRader = businesses.map(b => computeAdoption(handelserPerForetag.get(b.business_id) || [], b, nuIso))
    const aggregat = aggregateAdoption(adoptionRader)
    aktivaKonton = aggregat.aktivaKlara + aggregat.aktivaPagaende
  } catch (err) {
    if (!arSchemaSaknas(err)) console.warn('[veckopuls] adoption (aktiva konton) kunde inte läsas (0 rapporterat):', err)
  }

  return {
    veckostart: veckostartIso,
    kontakter,
    genomgangarBokade,
    erbjudandenSkickade,
    signeradeVeckan,
    signeradeTotalt,
    betalandeKonton,
    aktivaKonton,
    konton60Dagar,
    raddningskoOppna,
  }
}
