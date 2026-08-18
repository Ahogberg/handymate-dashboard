/**
 * Mandatets mätinstrument — Mission Mandates V1 (Etapp V,
 * tasks/jaunty-pondering-hummingbird.md). Ren funktion, INGEN I/O.
 *
 * ═══ RÄKNADE FAKTA, INTE ETT PÅSTÅENDE ═══
 *
 * Detta ÄR falsklarmsmätningen rådets autonomigrind kräver: per mandat +
 * per åtgärdstyp räknas utförda utskick, leveransfel, opt-out-händelser
 * inom 7 dagar efter ett mandatutskick till samma kund, ägarens
 * återkallelse och pausorsaker. Samma disciplin som
 * lib/playbook/checkpoint-outcomes.ts: att konstatera ATT en opt-out
 * inföll inom fönstret efter ett utskick är en observation ingen kan
 * bestrida; att påstå VARFÖR kunden avregistrerade sig är ett
 * kausalitetspåstående ingen räkning här styrker. Inget verb i den här
 * filen — kod eller kommentar — får koppla ett utskick till ett utfall
 * som dess EFFEKT. tests/mandate-facit.spec.ts låser detta med en
 * källkodsskanning; den exakta ordlistan listas medvetet INTE här
 * (annars fastnar listan i sin egen fälla).
 *
 * ═══ ÄRLIG NÄR KOPPLINGEN SAKNAS ═══
 *
 * STOPP-räkningen kräver en kundkoppling (payload.customer_id) OCH ett känt
 * kontakttillfälle (contactedCustomerAt). Saknas endera räknas utskicket
 * INTE som bedömbart för STOPP-måttet — det hamnar i `ej_bedombart`, aldrig
 * i nämnaren för en tyst nolla. Ett odömbart utskick är inte samma sak som
 * ett rent utskick.
 *
 * ═══ INGEN SUMMERING ÖVER TYPER ═══
 *
 * Varje åtgärdstyp redovisas för sig, precis som sanningsklasserna i
 * lib/mission/opportunity-portfolio.ts. Ingen totalsiffra över typer läggs
 * till — den skulle blanda ihop fyra olika sorters utskick till en
 * meningslös summa.
 */

// Värde-importen (MANDATE_ALLOWED_TYPES) hämtas ur ./types, inte
// ./mission-mandate (som drar in node:crypto) — samma skäl som lib/mandates/
// create.ts, se lib/mandates/types.ts:s filhuvud.
import { MANDATE_ALLOWED_TYPES, type MandateActionType, type MandateRow } from './types'
import { autonomyKeyFromApproval } from '@/lib/autonomy/earned-autonomy'

const STOPP_WINDOW_MS = 7 * 24 * 3600_000

export interface MandateFacitCardInput {
  approval_type: string
  status: string
  payload: Record<string, unknown> | null
  created_at: string
}

export interface MandateFacitOptOutInput {
  customer_id: string
  occurred_at: string
}

export interface MandateFacitTypeRow {
  action_type: MandateActionType
  /** Kort med execution_result.outcome==='success'. */
  utforda: number
  /** Kort med execution_result.outcome==='failed'. */
  leveransfel: number
  /** Opt-out-händelser inom [kontakttillfälle, kontakttillfälle+7d] efter
      ett utfört mandatutskick till samma kund — högst en per kund. */
  stopp_inom_7d: number
  /** Utförda utskick där kundkopplingen saknades (payload.customer_id
      och/eller ett känt kontakttillfälle) — inte räknade som "rena" för
      STOPP-måttet, bara som odömbara. */
  ej_bedombart: number
}

export interface MandateFacitResult {
  mandate_id: string
  per_type: MandateFacitTypeRow[]
  /** mandate.status === 'revoked' — ägarens uttryckliga återkallelse. */
  agaraterkallelse: boolean
  /**
   * mission_mandate lagrar bara det NUVARANDE pause_reason (inga räknare,
   * ingen historik) — listan har därför högst ETT element. Namnet är
   * plural för att spegla planens vokabulär, men innehållet är ärligt om
   * begränsningen: det här är dagsläget, inte en logg över alla pauser som
   * någonsin skett.
   */
  pausorsaker: string[]
}

function emptyRow(type: MandateActionType): MandateFacitTypeRow {
  return { action_type: type, utforda: 0, leveransfel: 0, stopp_inom_7d: 0, ej_bedombart: 0 }
}

/**
 * Bygger mätinstrumentets per-typ-facit för ett mandat.
 *
 * `cards` filtreras internt till payload.mandate_id === mandate.id — en
 * anropare som skickar in ett bredare urval korrumperar alltså aldrig
 * resultatet. Typen per kort härleds med SAMMA funktion
 * (autonomyKeyFromApproval) som förtjänad autonomi redan använder för att
 * läsa av payload.autonomy_key/approval_type — mandatgrenen (Etapp W)
 * exekverar via samma direktsändningsväg och ärver därför samma stämpling.
 *
 * `contactedCustomerAt` är den redan uträknade (I/O-lagrets jobb, samma
 * ansvarsfördelning som lib/mission/contact-outcomes.ts) tillförlitliga
 * "när skickades det HÄR till den HÄR kunden"-tidpunkten per kund — inte
 * nödvändigtvis kortets created_at, som bara mäter kö-tid.
 */
export function byggMandateFacit(input: {
  mandate: Pick<MandateRow, 'id' | 'allowed_action_types' | 'status' | 'pause_reason'>
  cards: MandateFacitCardInput[]
  optOutEvents: MandateFacitOptOutInput[]
  contactedCustomerAt: Map<string, string>
}): MandateFacitResult {
  const { mandate, cards, optOutEvents, contactedCustomerAt } = input

  const rows = new Map<MandateActionType, MandateFacitTypeRow>()
  for (const type of mandate.allowed_action_types) rows.set(type, emptyRow(type))

  // Per typ: vilken kund kontaktades när (tidigaste lyckade utskicket per
  // kund) — grunden för STOPP-fönstret.
  const contactedByType = new Map<MandateActionType, Map<string, string>>()

  for (const card of cards) {
    const payload = card.payload || {}
    if (payload.mandate_id !== mandate.id) continue

    const type = autonomyKeyFromApproval({ approval_type: card.approval_type, payload })
    if (!type || !mandate.allowed_action_types.includes(type)) continue
    const row = rows.get(type) ?? emptyRow(type)
    rows.set(type, row)

    const execution = payload.execution_result
    const outcome = execution && typeof execution === 'object'
      ? (execution as Record<string, unknown>).outcome
      : undefined

    if (outcome === 'success') {
      row.utforda += 1
      const customerId = typeof payload.customer_id === 'string' ? payload.customer_id : null
      const contactedAt = customerId ? contactedCustomerAt.get(customerId) : undefined
      if (!customerId || !contactedAt) {
        row.ej_bedombart += 1
        continue
      }
      const byCustomer = contactedByType.get(type) ?? new Map<string, string>()
      const existing = byCustomer.get(customerId)
      // Tidigaste kontakttillfället per kund — samma dedup-princip som
      // lib/mission/contact-outcomes.ts (deriveContactOutcomes).
      if (!existing || Date.parse(contactedAt) < Date.parse(existing)) {
        byCustomer.set(customerId, contactedAt)
      }
      contactedByType.set(type, byCustomer)
    } else if (outcome === 'failed') {
      row.leveransfel += 1
    }
  }

  for (const [type, byCustomer] of Array.from(contactedByType.entries())) {
    const row = rows.get(type) ?? emptyRow(type)
    rows.set(type, row)
    const countedCustomers = new Set<string>()
    for (const event of optOutEvents) {
      if (countedCustomers.has(event.customer_id)) continue
      const contactedAt = byCustomer.get(event.customer_id)
      if (!contactedAt) continue
      const contactedMs = Date.parse(contactedAt)
      const occurredMs = Date.parse(event.occurred_at)
      if (!Number.isFinite(contactedMs) || !Number.isFinite(occurredMs)) continue
      if (occurredMs < contactedMs) continue // en opt-out FÖRE utskicket hör inte till fönstret
      if (occurredMs - contactedMs > STOPP_WINDOW_MS) continue
      countedCustomers.add(event.customer_id)
      row.stopp_inom_7d += 1
    }
  }

  return {
    mandate_id: mandate.id,
    per_type: MANDATE_ALLOWED_TYPES
      .filter(t => mandate.allowed_action_types.includes(t))
      .map(t => rows.get(t) ?? emptyRow(t)),
    agaraterkallelse: mandate.status === 'revoked',
    pausorsaker: mandate.pause_reason ? [mandate.pause_reason] : [],
  }
}
