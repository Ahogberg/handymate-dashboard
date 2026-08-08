/**
 * Kostnadsboken — läsidan (COGS-mätaren, 2026-08-08).
 *
 * ═══ ENDA MODULEN SOM VET VAR KOSTNAD BOR ═══
 *
 * Läser `cost_event` + `business_config`. Läser AVSIKTLIGT INTE `agent_runs`,
 * `sms_usage` eller `usage_record` — facit i tests/cogs-matare.spec.ts
 * kontrollerar det. Anledningen är repots historia: samma data i fyra kopior
 * som gled isär (spår D1, se components/dashboard/agentPersonas.ts). En
 * kostnadsrapport som aggregerar tre källor är den fjärde kopian.
 *
 * `sms_usage` innehåller vad vi TAR av kunden, `agent_runs.estimated_cost`
 * är ett dygnstak i USD. Ingen av dem är vår kostnad i öre.
 *
 * ═══ NUMMERHYRAN ÄR HÄRLEDD, INTE EN HÄNDELSE ═══
 *
 * 30 kr/mån per företag med ett tilldelat nummer är en fast avgift. Att
 * generera den som händelse hade krävt en cron, och en cron som kör två
 * gånger dubblerar kostnaden i boken. Den räknas därför fram vid läsning.
 *
 * ═══ TOMT ÄR INTE NOLL ═══
 *
 * Mätaren startade 2026-08-08 och det finns ingen backfill. En period före
 * dess ger 0 kr — det betyder avsaknad av MÄTNING, inte avsaknad av kostnad.
 * `measurementStartedAt` följer med i svaret så ingen läsare tolkar de första
 * veckorna som ett fall.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { currentPriceList } from './price-list'
import type { CostResource } from './record'

/** Dagen mätaren slogs på. Före detta finns ingen data att tolka. */
export const MEASUREMENT_STARTED_AT = '2026-08-08'

const RESOURCES: CostResource[] = ['sms', 'call_out', 'whisper', 'llm']

function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface ResourceTotal {
  units: number
  costOre: number
}

export interface TenantCogs {
  businessId: string
  businessName: string | null
  /** 'YYYY-MM' */
  month: string
  perResource: Record<CostResource, ResourceTotal>
  /** Härledd fast avgift, ingår i totalOre. */
  numberRentalOre: number
  totalOre: number
  /** Abonnemangspriset i öre, eller null när planen är okänd. */
  planPriceOre: number | null
  /** (intäkt − kostnad) / intäkt, i procent. Null utan känd plan. */
  grossMarginPercent: number | null
  measurementStartedAt: string
}

function tomtResursblock(): Record<CostResource, ResourceTotal> {
  return {
    sms: { units: 0, costOre: 0 },
    call_out: { units: 0, costOre: 0 },
    whisper: { units: 0, costOre: 0 },
    llm: { units: 0, costOre: 0 },
  }
}

/** Månadens gränser som ISO-strängar. `month` är 'YYYY-MM'. */
function månadsintervall(month: string): { från: string; till: string } {
  const [år, mån] = month.split('-').map(Number)
  const från = new Date(Date.UTC(år, mån - 1, 1))
  const till = new Date(Date.UTC(år, mån, 1))
  return { från: från.toISOString(), till: till.toISOString() }
}

/** Planpriset i öre. Importeras dynamiskt så report.ts inte drar in gates i klienten. */
async function planprisÖre(plan: string | null): Promise<number | null> {
  if (!plan) return null
  try {
    const { getPlanPrice } = await import('@/lib/feature-gates')
    const kr = getPlanPrice(plan as any)
    return typeof kr === 'number' ? kr * 100 : null
  } catch {
    return null
  }
}

function marginal(planPriceOre: number | null, totalOre: number): number | null {
  if (!planPriceOre || planPriceOre <= 0) return null
  return Math.round(((planPriceOre - totalOre) / planPriceOre) * 1000) / 10
}

/**
 * COGS för ett företag och en månad. `month` som 'YYYY-MM'; utan värde
 * används innevarande månad (UTC).
 */
export async function getTenantCogs(businessId: string, month?: string): Promise<TenantCogs> {
  const supabase = getSupabase()
  const nu = new Date()
  const m = month || `${nu.getUTCFullYear()}-${String(nu.getUTCMonth() + 1).padStart(2, '0')}`
  const { från, till } = månadsintervall(m)

  const perResource = tomtResursblock()

  const { data: händelser, error } = await supabase
    .from('cost_event')
    .select('resource, units, cost_ore')
    .eq('business_id', businessId)
    .gte('created_at', från)
    .lt('created_at', till)

  if (error) {
    // Läsfel får inte se ut som noll kostnad — det är två helt olika svar.
    console.error(`[cost/report] kunde inte läsa cost_event för ${businessId}: ${error.message}`)
    throw new Error(`Kostnadsdata kunde inte läsas: ${error.message}`)
  }

  for (const h of händelser || []) {
    const r = h.resource as CostResource
    if (!perResource[r]) continue
    perResource[r].units += Number(h.units) || 0
    perResource[r].costOre += Number(h.cost_ore) || 0
  }

  const { data: biz } = await supabase
    .from('business_config')
    .select('business_name, subscription_plan, elks_number_id')
    .eq('business_id', businessId)
    .maybeSingle()

  const numberRentalOre = biz?.elks_number_id
    ? currentPriceList().number_rental_ore_per_month
    : 0

  const totalOre =
    RESOURCES.reduce((s, r) => s + perResource[r].costOre, 0) + numberRentalOre

  const planPriceOre = await planprisÖre(biz?.subscription_plan ?? null)

  return {
    businessId,
    businessName: biz?.business_name ?? null,
    month: m,
    perResource,
    numberRentalOre,
    totalOre,
    planPriceOre,
    grossMarginPercent: marginal(planPriceOre, totalOre),
    measurementStartedAt: MEASUREMENT_STARTED_AT,
  }
}

/**
 * COGS för alla företag en månad, dyrast först. En query över cost_event —
 * inte N stycken getTenantCogs, som hade blivit ett anrop per kund.
 */
export async function getAllTenantCogs(month?: string): Promise<TenantCogs[]> {
  const supabase = getSupabase()
  const nu = new Date()
  const m = month || `${nu.getUTCFullYear()}-${String(nu.getUTCMonth() + 1).padStart(2, '0')}`
  const { från, till } = månadsintervall(m)

  const { data: händelser, error } = await supabase
    .from('cost_event')
    .select('business_id, resource, units, cost_ore')
    .gte('created_at', från)
    .lt('created_at', till)

  if (error) {
    console.error(`[cost/report] kunde inte läsa cost_event: ${error.message}`)
    throw new Error(`Kostnadsdata kunde inte läsas: ${error.message}`)
  }

  const { data: företag } = await supabase
    .from('business_config')
    .select('business_id, business_name, subscription_plan, elks_number_id')

  const perFöretag = new Map<string, Record<CostResource, ResourceTotal>>()
  for (const h of händelser || []) {
    const id = h.business_id as string
    if (!perFöretag.has(id)) perFöretag.set(id, tomtResursblock())
    const block = perFöretag.get(id)!
    const r = h.resource as CostResource
    if (!block[r]) continue
    block[r].units += Number(h.units) || 0
    block[r].costOre += Number(h.cost_ore) || 0
  }

  // Företag med nummer men utan händelser har ändå nummerhyra — de ska med.
  const rader: TenantCogs[] = []
  for (const b of företag || []) {
    const block = perFöretag.get(b.business_id) || tomtResursblock()
    const numberRentalOre = b.elks_number_id
      ? currentPriceList().number_rental_ore_per_month
      : 0
    const totalOre =
      RESOURCES.reduce((s, r) => s + block[r].costOre, 0) + numberRentalOre
    if (totalOre === 0) continue

    const planPriceOre = await planprisÖre(b.subscription_plan ?? null)
    rader.push({
      businessId: b.business_id,
      businessName: b.business_name ?? null,
      month: m,
      perResource: block,
      numberRentalOre,
      totalOre,
      planPriceOre,
      grossMarginPercent: marginal(planPriceOre, totalOre),
      measurementStartedAt: MEASUREMENT_STARTED_AT,
    })
  }

  return rader.sort((a, b) => b.totalOre - a.totalOre)
}
