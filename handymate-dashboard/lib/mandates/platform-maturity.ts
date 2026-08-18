/**
 * Etapp Y — kvantifierad grind, PLATTFORMSAGGREGATIONEN (Mission Mandates
 * V1, tasks/jaunty-pondering-hummingbird.md). I/O-lagret som
 * `bedomTypMognad` (lib/mandates/type-maturity.ts) bedömer mot.
 *
 * ═══ VARFÖR DEN HÄR FILEN FINNS SEPARAT FRÅN load-mandate-facit.ts ═══
 *
 * `lib/mandates/load-mandate-facit.ts` läser mätningen för ETT mandat i ETT
 * företag (uppdragspanelens vy — "12 utförda · 0 leveransfel · 0 STOPP" för
 * DET uppdraget). Typ-mognaden är en PLATTFORMSFRÅGA: en typ bevisas över
 * ALLA företags mandat tillsammans, inte per företag. Den här filen läser
 * därför `mission_mandate` UTAN business_id-filter (service-role,
 * admin-instrument, samma känslighetsnivå som admin/ask-coverage) och
 * summerar per typ över samtliga mandat den hittar.
 *
 * ═══ ÅTERANVÄNDER DEN RENA KÄRNAN, DUPLICERAR ALDRIG RÄKNINGEN ═══
 *
 * Per mandat anropas SAMMA rena funktion som load-mandate-facit.ts redan
 * litar på: `byggMandateFacit` (lib/mandates/mandate-facit.ts). Den här
 * filen läser bara de tre underlagen (mandat, kort, opt-out) och summerar
 * de färdiga per-typ-raderna — den räknar aldrig utforda/leveransfel/STOPP
 * själv. Det enda NYA denna fil lägger till utöver load-mandate-facit.ts:s
 * mönster är `forsta_utford` per typ (mognadens historik-kriterium behöver
 * det, men ett enskilt mandats facit gör inte) och
 * säkerhetsåterkallelse-räkningen (som i sig är plattformsspecifik — se
 * nedan).
 *
 * ═══ SÄKERHETSÅTERKALLELSER — ÄRLIGT KONSERVATIV DEFINITION (V1) ═══
 *
 * `mission_mandate` lagrar inte VARFÖR ägaren återkallade ett mandat — bara
 * ATT den gjorde det (status='revoked'). Att gissa "säkerhetsmotiverad"
 * kontra "uppdraget avslutades tidigt av ett annat skäl" vore ett
 * kausalitetspåstående ingen data här styrker. V1 väljer därför MEDVETET
 * konservativt åt den säkra riktningen: VARJE återkallelse av ett mandat
 * där typen hade ≥1 utförd räknas som en säkerhetsåterkallelse för den
 * typen. Det kan ÖVERSKATTA verkliga säkerhetsincidenter (en ägare som
 * återkallar av ett helt orelaterat skäl räknas ändå mot typen) — men aldrig
 * underskatta dem, vilket är rätt sida att vara fel på för en grind som
 * avgör om fler mandat får delas ut. En framtida version kan skilja ut ett
 * uttryckligt "varför"-fält; den här filen påstår inte mer än vad kolumnerna
 * bär.
 *
 * ═══ FAIL-SOFT PÅ TVÅ NIVÅER ═══
 *
 *   1. Hela svepet: `mission_mandate` saknas/trasig ⇒ tomt underlag för alla
 *      fyra typer (mogen blir naturligt false via type-maturity.ts:s
 *      MIN_EXECUTED-kriterium). Kastar aldrig.
 *   2. Per mandat: ett enskilt mandats kortläsning failar ⇒ DET mandatet
 *      hoppas över (räknas inte i något håll), resten av svepet fortsätter.
 *      En trasig rad ska aldrig göra att övriga 199 mandatens bevis
 *      försvinner.
 *
 * ═══ BUNDEN — INGEN OBEGRÄNSAD SKANNING ═══
 *
 * `MANDATE_MATURITY_SCAN_LIMIT` mandat läses per anrop (nyast först).
 * `mandates_capped` i resultatet talar om ärligt när gränsen träffades, så
 * en framtida läsare aldrig förväxlar "skannade 200" med "det finns bara
 * 200 mandat totalt".
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { byggMandateFacit, type MandateFacitCardInput, type MandateFacitOptOutInput } from './mandate-facit'
import { MANDATE_ALLOWED_TYPES, type MandateActionType, type MandateStatus } from './types'
import { autonomyKeyFromApproval } from '@/lib/autonomy/earned-autonomy'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

export const MANDATE_MATURITY_SCAN_LIMIT = 200

interface PlatformMandateRow {
  id: string
  business_id: string
  allowed_action_types: MandateActionType[]
  status: MandateStatus
  pause_reason: string | null
  revoked_at: string | null
  created_at: string
}

export interface PlatformTypeUnderlag {
  action_type: MandateActionType
  utforda: number
  leveransfel: number
  stopp_inom_7d: number
  ej_bedombart: number
  aterkallelser: number
  /** Tidigaste lyckade utskicket av typen, över ALLA mandat — null om inget
      utfört ännu. */
  forsta_utford: string | null
}

export interface PlatformMaturityResult {
  per_type: PlatformTypeUnderlag[]
  mandates_scanned: number
  mandates_capped: boolean
}

function emptyUnderlag(type: MandateActionType): PlatformTypeUnderlag {
  return { action_type: type, utforda: 0, leveransfel: 0, stopp_inom_7d: 0, ej_bedombart: 0, aterkallelser: 0, forsta_utford: null }
}

function emptyResult(): PlatformMaturityResult {
  return {
    per_type: MANDATE_ALLOWED_TYPES.map(emptyUnderlag),
    mandates_scanned: 0,
    mandates_capped: false,
  }
}

interface CardRow {
  approval_type: string
  status: string
  payload: Record<string, unknown> | null
  created_at: string
  resolved_at: string | null
}

/**
 * Läser ETT mandats kort + opt-out-underlag (samma tre-läsningars-mönster
 * som load-mandate-facit.ts:loadMandateFacit) och returnerar dess
 * byggMandateFacit-resultat PLUS den lokala "tidigaste lyckade utskicket
 * per typ"-kartan som platform-nivån behöver för forsta_utford. Fail-soft:
 * null om kortläsningen misslyckas — anroparen hoppar då bara över det här
 * mandatet.
 */
async function loadMandateContribution(
  supabase: SupabaseClient,
  mandate: Pick<PlatformMandateRow, 'id' | 'business_id' | 'allowed_action_types' | 'status' | 'pause_reason'>,
): Promise<{ facit: ReturnType<typeof byggMandateFacit>; firstExecutedAt: Map<MandateActionType, string> } | null> {
  try {
    const { data, error } = await supabase
      .from('pending_approvals')
      .select('approval_type, status, payload, created_at, resolved_at')
      .eq('business_id', mandate.business_id)
      .contains('payload', { mandate_id: mandate.id })

    if (error) {
      if (!arSchemaSaknas(error)) {
        console.error(`[mandates] platform-maturity: kunde inte läsa kort för mandat ${mandate.id} (fail-soft, hoppar över):`, error.message)
      }
      return null
    }

    const rows = (data || []) as CardRow[]
    const cards: MandateFacitCardInput[] = rows.map(r => ({
      approval_type: r.approval_type,
      status: r.status,
      payload: r.payload,
      created_at: r.created_at,
    }))

    const contactedCustomerAt = new Map<string, string>()
    const firstExecutedAt = new Map<MandateActionType, string>()

    for (const r of rows) {
      const payload = r.payload || {}
      if (payload.mandate_id !== mandate.id) continue
      const execution = payload.execution_result
      const outcome = execution && typeof execution === 'object' ? (execution as Record<string, unknown>).outcome : undefined
      if (outcome !== 'success') continue

      const at = r.resolved_at || r.created_at
      const type = autonomyKeyFromApproval({ approval_type: r.approval_type, payload })
      if (type) {
        const existingFirst = firstExecutedAt.get(type)
        if (!existingFirst || Date.parse(at) < Date.parse(existingFirst)) firstExecutedAt.set(type, at)
      }

      const customerId = typeof payload.customer_id === 'string' ? payload.customer_id : null
      if (!customerId) continue
      const existing = contactedCustomerAt.get(customerId)
      if (!existing || Date.parse(at) < Date.parse(existing)) contactedCustomerAt.set(customerId, at)
    }

    let optOutEvents: MandateFacitOptOutInput[] = []
    const customerIds = Array.from(contactedCustomerAt.keys())
    if (customerIds.length > 0) {
      try {
        const { data: custData, error: custErr } = await supabase
          .from('customer')
          .select('customer_id, sms_opt_out, sms_opt_out_at')
          .eq('business_id', mandate.business_id)
          .in('customer_id', customerIds)
        if (custErr) {
          if (!arSchemaSaknas(custErr)) {
            console.warn(`[mandates] platform-maturity: kunde inte läsa opt-out-underlag för mandat ${mandate.id} (fail-soft, tomt):`, custErr.message)
          }
        } else if (Array.isArray(custData)) {
          optOutEvents = (custData as Array<{ customer_id: string; sms_opt_out: boolean | null; sms_opt_out_at: string | null }>)
            .filter(c => c.sms_opt_out === true && !!c.sms_opt_out_at)
            .map(c => ({ customer_id: c.customer_id, occurred_at: c.sms_opt_out_at as string }))
        }
      } catch (err) {
        console.warn(`[mandates] platform-maturity: opt-out-läsningen kastade för mandat ${mandate.id} (fail-soft, tomt):`, err)
      }
    }

    const facit = byggMandateFacit({ mandate, cards, optOutEvents, contactedCustomerAt })
    return { facit, firstExecutedAt }
  } catch (err) {
    console.error(`[mandates] platform-maturity: loadMandateContribution kastade oväntat för mandat ${mandate.id} (fail-soft, hoppar över):`, err)
    return null
  }
}

/**
 * Aggregerar mandat-stämplade kort ÖVER ALLA FÖRETAG, per åtgärdstyp — det
 * underlag `bedomTypMognad` (type-maturity.ts) bedömer mot. Rent läsande,
 * fail-soft, bundet till MANDATE_MATURITY_SCAN_LIMIT mandat (nyast först).
 *
 * `opts.limit` finns för test-/granskningssyfte (mindre bundna svep utan
 * att ändra produktionskonstanten).
 */
export async function loadPlatformTypeMaturity(
  supabase: SupabaseClient,
  opts?: { limit?: number },
): Promise<PlatformMaturityResult> {
  const limit = opts?.limit ?? MANDATE_MATURITY_SCAN_LIMIT
  const totals = new Map<MandateActionType, PlatformTypeUnderlag>()
  for (const t of MANDATE_ALLOWED_TYPES) totals.set(t, emptyUnderlag(t))

  try {
    const { data, error } = await supabase
      .from('mission_mandate')
      .select('id, business_id, allowed_action_types, status, pause_reason, revoked_at, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      if (!arSchemaSaknas(error)) {
        console.error('[mandates] platform-maturity: kunde inte läsa mission_mandate (fail-soft, tomt underlag):', error.message)
      }
      return emptyResult()
    }

    const mandates = (data || []) as PlatformMandateRow[]

    for (const mandate of mandates) {
      const contribution = await loadMandateContribution(supabase, mandate)
      if (!contribution) continue
      const { facit, firstExecutedAt } = contribution

      for (const row of facit.per_type) {
        const total = totals.get(row.action_type) ?? emptyUnderlag(row.action_type)
        total.utforda += row.utforda
        total.leveransfel += row.leveransfel
        total.stopp_inom_7d += row.stopp_inom_7d
        total.ej_bedombart += row.ej_bedombart

        // Konservativ säkerhetsåterkallelse-räkning — se filhuvudet.
        if (facit.agaraterkallelse && row.utforda >= 1) total.aterkallelser += 1

        const first = firstExecutedAt.get(row.action_type)
        if (first && (!total.forsta_utford || Date.parse(first) < Date.parse(total.forsta_utford))) {
          total.forsta_utford = first
        }

        totals.set(row.action_type, total)
      }
    }

    return {
      per_type: MANDATE_ALLOWED_TYPES.map(t => totals.get(t) ?? emptyUnderlag(t)),
      mandates_scanned: mandates.length,
      mandates_capped: mandates.length >= limit,
    }
  } catch (err) {
    console.error('[mandates] loadPlatformTypeMaturity kastade oväntat (fail-soft, tomt underlag):', err)
    return emptyResult()
  }
}
