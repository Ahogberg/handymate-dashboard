/**
 * Återvunnet-kärnan (gap 2, tasks/vilande-pengar-masterplan.md VP2) —
 * attribuerar VERIFIERADE intäktshändelser till godkända approval-kort:
 *
 *   kort godkänt → offert accepterad ≤14 dgr  → attribuerad krona (quote.total)
 *               → faktura betald   ≤14 dgr  → attribuerad krona (invoice.total)
 *               → bokning skapad   ≤7 dgr   → verifierad händelse, 0 kr
 *
 * Ärlighetslagen (masterplanen rad 9–21) styr varje regel här:
 *   - "Återvunnet" = ENDAST verifierade händelser. En bokning är verifierad
 *     som HÄNDELSE men har inget verifierat kronvärde → amount_kr 0, aldrig
 *     schablon i denna siffra.
 *   - En händelse attribueras till MAX ETT kort — om flera kort föregick
 *     den vinner det SENAST godkända (dokumenterat beslut i masterplanen).
 *   - Samma pengar räknas ALDRIG två gånger: en betald faktura vars
 *     quote_id redan attribuerats som accepterad offert SKIPPAS.
 *   - Endast outbound-korttyper attribuerar (RECOVERY_APPROVAL_TYPES) —
 *     ett godkänt tidrapport- eller egenkontrollkort ska inte kunna ta åt
 *     sig äran för en betald faktura bara för att kunden råkar matcha.
 *
 * Samma delning som lib/outbound/frequency-guard.ts: rena funktioner
 * (facit-testade i tests/recovered-revenue.spec.ts, tar ms-tidsstämplar)
 * + en separat I/O-funktion (getRecoveredRevenue) som är fail-soft på
 * alla DB-fel — en trasig attributionsquery får aldrig fälla dashboarden,
 * den ger 0 kr och en console.warn.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Korttyper som räknas som "outbound-jakt" och därmed får attribuera
    intäkter. Medvetet snäv — hellre missad attribution än falsk.

    De fyra sista (2026-08-12) är INTE outbound-jakt — de är direkta
    penninghändelser (en påminnelse, en ÄTA, ett granskat fynd, en
    projektfaktura). De får därför ENDAST attribuera via en verifierad
    direktreferens, aldrig via kundkorrelationsfallbacken nedan. Se
    DIRECT_ONLY_APPROVAL_TYPES + mapApprovalRowToCard. */
export const RECOVERY_APPROVAL_TYPES = [
  'send_sms',
  'quote_nudge',
  'proactive_care',
  'warranty_followup',
  'customer_reactivation',
  'seasonal_campaign',
  'autopilot_package',
  'invoice_reminder',
  'create_ata_draft',
  'missad_intakt',
  'fakturera_projekt',
] as const

/**
 * Typer som ENDAST får attribuera via en bevisad direktreferens (se
 * mapApprovalRowToCard för var referensen kommer ifrån per typ) — aldrig
 * "kunden råkar matcha inom fönstret". Ett kort av en av dessa typer utan
 * en direktreferens (t.ex. ett äldre kort skapat innan artifacts-
 * persisteringen fanns) attribuerar INGENTING, hellre missad än falsk.
 */
const DIRECT_ONLY_APPROVAL_TYPES = new Set<string>([
  'invoice_reminder',
  'create_ata_draft',
  'missad_intakt',
  'fakturera_projekt',
])

/** Attributionsfönster per händelsetyp (dagar efter kortets godkännande). */
export const ATTRIBUTION_WINDOW_DAYS = {
  quote_accepted: 14,
  invoice_paid: 14,
  booking_created: 7,
} as const

export type RevenueEventKind = keyof typeof ATTRIBUTION_WINDOW_DAYS

const DAY_MS = 24 * 60 * 60 * 1000

export interface ApprovedCard {
  id: string
  approval_type: string
  /** resolved_at (fallback created_at) i epoch-ms. */
  resolved_at_ms: number
  customer_id: string | null
  /** Direkt offertreferens ur payload när kortet gäller en specifik offert
      (quote_nudge/send_sms med related_id) — starkare bevis än kundmatch. */
  quote_id: string | null
  agent: string | null
  /**
   * Direkt FAKTURAreferens (2026-08-12) — bara satt för
   * DIRECT_ONLY_APPROVAL_TYPES. Skild från quote_id ovan: detta pekar på
   * fakturan själv (en påmind faktura, en projektfaktura, ett granskat
   * fynds utkast), inte offerten bakom den. Optional så äldre kort-byggare
   * (tester som bygger ApprovedCard direkt) inte behöver känna till fältet.
   */
  invoice_id?: string | null
  /**
   * create_ata_draft ENDAST: ÄTA-id ur
   * payload.execution_result.artifacts.ata_id. Ett halvsteg — ÄTA:n är
   * inte fakturans värde själv, I/O-lagret (getRecoveredRevenue) slår upp
   * project_change.invoice_id och fyller i invoice_id ovan om/när ÄTA:n
   * blivit fakturerad. Rena funktioner (attributeRevenue) läser bara
   * invoice_id, aldrig ata_id direkt.
   */
  ata_id?: string | null
}

export interface RevenueEvent {
  kind: RevenueEventKind
  /** quote_id / invoice_id / booking_id. */
  event_id: string
  customer_id: string | null
  /** För invoice_paid: fakturans quote_id — dubbelräkningsspärren. */
  quote_id?: string | null
  amount_kr: number
  occurred_at_ms: number
  /** Färdig svensk radetikett för UI ("Offert accepterad: Takbyte"). */
  label: string
}

export interface Attribution {
  card_id: string
  approval_type: string
  agent: string | null
  event_kind: RevenueEventKind
  event_id: string
  customer_id: string | null
  amount_kr: number
  occurred_at_ms: number
  card_resolved_at_ms: number
  label: string
}

export interface RecoveredRevenue {
  /** Summa attribuerade verifierade kronor (bokningar bidrar 0). */
  total_recovered_kr: number
  attributions: Attribution[]
  window_days: typeof ATTRIBUTION_WINDOW_DAYS
}

/**
 * Ren mappning pending_approvals-rad → ApprovedCard. null om raden saknar
 * användbar tidsstämpel. Kunden finns bara i payload (pending_approvals har
 * ingen customer_id-kolumn — verifierat i VP1:s frequency-guard).
 */
export function mapApprovalRowToCard(row: {
  id: string
  approval_type: string
  resolved_at?: string | null
  created_at?: string | null
  payload?: unknown
  routed_agent?: string | null
}): ApprovedCard | null {
  const ts = row.resolved_at || row.created_at
  if (!ts) return null
  const resolvedMs = new Date(ts).getTime()
  if (Number.isNaN(resolvedMs)) return null

  const payload = (row.payload || {}) as Record<string, unknown>
  const customerId = payload.customer_id ? String(payload.customer_id) : null

  // related_id är quote_id på offertjaktens kort (quote_nudge + cronens
  // send_sms-kort) men project_id på proactive_care/warranty_followup —
  // därför bara offertjakts-typerna. Fel-referens är harmlös (id-prefix
  // skiljer sig, matchar aldrig en quote) men vi håller det rent ändå.
  const quoteRef =
    payload.quote_id ? String(payload.quote_id)
    : (row.approval_type === 'quote_nudge' || row.approval_type === 'send_sms') && payload.related_id
      ? String(payload.related_id)
      : null

  // ═══ DIREKTATTRIBUTION (2026-08-12) ═══
  // De fyra DIRECT_ONLY_APPROVAL_TYPES har var sin sanna källa för
  // fakturareferensen — ALDRIG en gissning ur generiska fält:
  //
  //   invoice_reminder  → payload.invoice_id (toppnivå, satt av
  //                        app/api/cron/send-reminders vid kortets skapande
  //                        — "händelsen" är att den PÅMINDA fakturan betalas)
  //   fakturera_projekt → payload.execution_result.artifacts.invoice_id
  //                        (satt av persist-blocket i approvals/[id]/
  //                        route.ts vid godkännande, se extractExecutionArtifacts)
  //   missad_intakt     → payload.draft_invoice_id — INTE execution_result.
  //                        Det här kortet exekveras ALDRIG via den generiska
  //                        godkännande-rutten (ACTION_CONTRACT: REVIEW_REQUIRED,
  //                        se lib/approvals/action-contract.ts). Fakturautkastet
  //                        skapas via den dedikerade
  //                        app/api/revenue-review/[id]/route.ts, som skriver
  //                        draft_invoice_id direkt på SAMMA kort vid "skapa_utkast".
  //   create_ata_draft  → payload.execution_result.artifacts.ata_id — bara
  //                        ett halvsteg (se ata_id-fältet på ApprovedCard).
  //                        I/O-lagret (getRecoveredRevenue) slår upp
  //                        project_change.invoice_id för att komma hela vägen.
  let directInvoiceId: string | null = null
  let ataRef: string | null = null
  if (row.approval_type === 'invoice_reminder') {
    directInvoiceId = payload.invoice_id ? String(payload.invoice_id) : null
  } else if (row.approval_type === 'missad_intakt') {
    directInvoiceId = payload.draft_invoice_id ? String(payload.draft_invoice_id) : null
  } else if (row.approval_type === 'fakturera_projekt' || row.approval_type === 'create_ata_draft') {
    const artifacts = (payload.execution_result as Record<string, unknown> | null | undefined)?.artifacts as
      | Record<string, unknown>
      | undefined
    if (row.approval_type === 'fakturera_projekt') {
      directInvoiceId = artifacts?.invoice_id ? String(artifacts.invoice_id) : null
    } else {
      ataRef = artifacts?.ata_id ? String(artifacts.ata_id) : null
    }
  }

  return {
    id: row.id,
    approval_type: row.approval_type,
    resolved_at_ms: resolvedMs,
    customer_id: customerId,
    quote_id: quoteRef,
    agent: row.routed_agent || (payload.agent ? String(payload.agent) : null),
    invoice_id: directInvoiceId,
    ata_id: ataRef,
  }
}

/**
 * Rent fönsterpredikat: kortet godkändes FÖRE händelsen och händelsen föll
 * inom typens attributionsfönster. Gränsen är inklusiv (exakt 14 dagar
 * senare räknas — facit-testat).
 */
export function isWithinAttributionWindow(
  cardResolvedAtMs: number,
  eventOccurredAtMs: number,
  kind: RevenueEventKind,
): boolean {
  const delta = eventOccurredAtMs - cardResolvedAtMs
  return delta >= 0 && delta <= ATTRIBUTION_WINDOW_DAYS[kind] * DAY_MS
}

/**
 * Kärnan, ren funktion: attribuerar varje händelse till max ett kort.
 *
 * Kandidatkort för en händelse: godkänt inom fönstret FÖRE händelsen och
 * antingen (a) direkt offertreferens som matchar (quote_accepted, eller
 * invoice_paid via fakturans quote_id) — starkast bevis — eller (b) samma
 * kund. Direktreferens slår kundmatch; inom samma bevisnivå vinner det
 * senast godkända kortet. Ett kort KAN attribuera flera händelser (två
 * fakturor efter samma jakt-SMS är två verkliga intäkter), men en händelse
 * räknas aldrig mer än en gång.
 *
 * Dubbelräkningsspärren: quote_accepted-händelser attribueras först; en
 * invoice_paid vars quote_id redan attribuerats skippas helt (samma pengar).
 */
export function attributeRevenue(cards: ApprovedCard[], events: RevenueEvent[]): Attribution[] {
  const kindOrder: Record<RevenueEventKind, number> = {
    quote_accepted: 0,
    invoice_paid: 1,
    booking_created: 2,
  }
  const orderedEvents = [...events].sort(
    (a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.occurred_at_ms - b.occurred_at_ms,
  )

  const attributions: Attribution[] = []
  const attributedQuoteIds = new Set<string>()

  for (const event of orderedEvents) {
    if (event.kind === 'invoice_paid' && event.quote_id && attributedQuoteIds.has(String(event.quote_id))) {
      continue // offerten är redan räknad — samma pengar räknas aldrig två gånger
    }

    let best: ApprovedCard | null = null
    let bestIsDirect = false
    for (const card of cards) {
      if (!isWithinAttributionWindow(card.resolved_at_ms, event.occurred_at_ms, event.kind)) continue

      const eventQuoteId =
        event.kind === 'quote_accepted' ? event.event_id
        : event.kind === 'invoice_paid' ? (event.quote_id ? String(event.quote_id) : null)
        : null
      const isDirectQuote = card.quote_id !== null && eventQuoteId !== null && card.quote_id === eventQuoteId
      // Direkt FAKTURAreferens (2026-08-12) — kortets egen faktura (påmind/
      // skapad/granskad) betalades. Bara relevant för invoice_paid; en
      // quote_accepted- eller booking_created-händelse har ingen invoice_id
      // att jämföra mot.
      const isDirectInvoice =
        event.kind === 'invoice_paid' &&
        card.invoice_id != null &&
        card.invoice_id === event.event_id
      const isDirect = isDirectQuote || isDirectInvoice

      // Sanningsregeln för DIRECT_ONLY_APPROVAL_TYPES: ingen
      // korrelationsfallback. Saknar kortet en direktreferens attribuerar
      // det ingenting alls — offertjaktens (send_sms/quote_nudge/…)
      // befintliga kundmatchning ändras inte.
      const requireDirect = DIRECT_ONLY_APPROVAL_TYPES.has(card.approval_type)
      const isCustomerMatch =
        !requireDirect &&
        card.customer_id !== null && event.customer_id !== null && card.customer_id === String(event.customer_id)
      if (!isDirect && !isCustomerMatch) continue

      if (
        best === null ||
        (isDirect && !bestIsDirect) ||
        (isDirect === bestIsDirect && card.resolved_at_ms > best.resolved_at_ms)
      ) {
        best = card
        bestIsDirect = isDirect
      }
    }

    if (!best) continue

    if (event.kind === 'quote_accepted') attributedQuoteIds.add(event.event_id)
    attributions.push({
      card_id: best.id,
      approval_type: best.approval_type,
      agent: best.agent,
      event_kind: event.kind,
      event_id: event.event_id,
      customer_id: event.customer_id,
      amount_kr: event.amount_kr,
      occurred_at_ms: event.occurred_at_ms,
      card_resolved_at_ms: best.resolved_at_ms,
      label: event.label,
    })
  }

  return attributions
}

/** Ren summering — bokningar bidrar med sina 0 kr, aldrig schablon. */
export function sumRecoveredKr(attributions: Attribution[]): number {
  return Math.round(attributions.reduce((sum, a) => sum + (a.amount_kr > 0 ? a.amount_kr : 0), 0))
}

/**
 * I/O-funktionen: hämtar godkända outbound-kort + verifierade händelser i
 * fönstret och kör den rena attributionen. `sinceDays` avgränsar HÄNDELSERNA;
 * korten hämtas 14 dagar längre bak så ett kort godkänt strax före fönstret
 * fortfarande kan attribuera en händelse inne i det.
 *
 * Fail-soft: varje delquery som felar (t.ex. accepted_at-kolumnen saknas i
 * en gammal miljö) loggas och behandlas som tom — funktionen kastar aldrig.
 */
export async function getRecoveredRevenue(
  supabase: SupabaseClient,
  businessId: string,
  opts: { sinceDays?: number; now?: Date } = {},
): Promise<RecoveredRevenue> {
  const sinceDays = opts.sinceDays ?? 30
  const nowMs = (opts.now ?? new Date()).getTime()
  const eventsSinceIso = new Date(nowMs - sinceDays * DAY_MS).toISOString()
  const maxWindowDays = Math.max(...Object.values(ATTRIBUTION_WINDOW_DAYS))
  const cardsSinceIso = new Date(nowMs - (sinceDays + maxWindowDays) * DAY_MS).toISOString()

  const cards: ApprovedCard[] = []
  try {
    const { data, error } = await supabase
      .from('pending_approvals')
      .select('id, approval_type, resolved_at, created_at, payload, routed_agent')
      .eq('business_id', businessId)
      .in('status', ['approved', 'auto_approved'])
      .in('approval_type', RECOVERY_APPROVAL_TYPES as unknown as string[])
      .gte('created_at', cardsSinceIso)
      .limit(1000)
    if (error) {
      console.warn('[recovered-revenue] pending_approvals-uppslag misslyckades (ger 0 kr):', error.message)
    } else {
      for (const row of data || []) {
        const card = mapApprovalRowToCard(row)
        if (card) cards.push(card)
      }
    }
  } catch (err: any) {
    console.warn('[recovered-revenue] pending_approvals-uppslag kastade (ger 0 kr):', err?.message || err)
  }

  if (cards.length === 0) {
    return { total_recovered_kr: 0, attributions: [], window_days: ATTRIBUTION_WINDOW_DAYS }
  }

  // create_ata_draft-kort bär bara ett ÄTA-id (card.ata_id, ur
  // payload.execution_result.artifacts.ata_id) — direktreferensen till
  // FAKTURAN kräver ett uppslag i project_change (samma tabell
  // markInvoiceSources skriver invoice_id till när en faktura
  // källmarkerar en ÄTA, se lib/invoices/mark-sources.ts). Fail-soft: en
  // trasig eller tom träff lämnar kortets invoice_id null → kortet
  // utesluts från attribution (hellre missad än falsk), aldrig en gissning.
  const pendingAtaIds = cards
    .filter((c) => c.approval_type === 'create_ata_draft' && c.ata_id)
    .map((c) => c.ata_id as string)
  if (pendingAtaIds.length > 0) {
    try {
      const { data, error } = await supabase
        .from('project_change')
        .select('change_id, invoice_id')
        .eq('business_id', businessId)
        .in('change_id', pendingAtaIds)
      if (error) {
        console.warn('[recovered-revenue] project_change-uppslag misslyckades (ÄTA-kort utesluts):', error.message)
      } else {
        const invoiceByAta = new Map<string, string | null>(
          (data || []).map((r: any) => [String(r.change_id), r.invoice_id ? String(r.invoice_id) : null]),
        )
        for (const c of cards) {
          if (c.approval_type === 'create_ata_draft' && c.ata_id) {
            c.invoice_id = invoiceByAta.get(c.ata_id) ?? null
          }
        }
      }
    } catch (err: any) {
      console.warn('[recovered-revenue] project_change-uppslag kastade (ÄTA-kort utesluts):', err?.message || err)
    }
  }

  const events: RevenueEvent[] = []

  try {
    const { data, error } = await supabase
      .from('quotes')
      .select('quote_id, customer_id, total, accepted_at, title')
      .eq('business_id', businessId)
      .eq('status', 'accepted')
      .gte('accepted_at', eventsSinceIso)
      .limit(1000)
    if (error) {
      console.warn('[recovered-revenue] quotes-uppslag misslyckades (skippar offerter):', error.message)
    } else {
      for (const q of data || []) {
        if (!q.accepted_at) continue
        events.push({
          kind: 'quote_accepted',
          event_id: String(q.quote_id),
          customer_id: q.customer_id ? String(q.customer_id) : null,
          amount_kr: Number(q.total) || 0,
          occurred_at_ms: new Date(q.accepted_at).getTime(),
          label: `Offert accepterad${q.title ? ': ' + q.title : ''}`,
        })
      }
    }
  } catch (err: any) {
    console.warn('[recovered-revenue] quotes-uppslag kastade (skippar offerter):', err?.message || err)
  }

  try {
    const { data, error } = await supabase
      .from('invoice')
      .select('invoice_id, customer_id, quote_id, total, paid_at, invoice_number')
      .eq('business_id', businessId)
      .eq('status', 'paid')
      .gte('paid_at', eventsSinceIso)
      .limit(1000)
    if (error) {
      console.warn('[recovered-revenue] invoice-uppslag misslyckades (skippar fakturor):', error.message)
    } else {
      for (const inv of data || []) {
        if (!inv.paid_at) continue
        events.push({
          kind: 'invoice_paid',
          event_id: String(inv.invoice_id),
          customer_id: inv.customer_id ? String(inv.customer_id) : null,
          quote_id: inv.quote_id ? String(inv.quote_id) : null,
          amount_kr: Number(inv.total) || 0,
          occurred_at_ms: new Date(inv.paid_at).getTime(),
          label: `Faktura ${inv.invoice_number || ''} betald`.replace('  ', ' ').trim(),
        })
      }
    }
  } catch (err: any) {
    console.warn('[recovered-revenue] invoice-uppslag kastade (skippar fakturor):', err?.message || err)
  }

  try {
    const { data, error } = await supabase
      .from('booking')
      .select('booking_id, customer_id, created_at')
      .eq('business_id', businessId)
      .gte('created_at', eventsSinceIso)
      .limit(1000)
    if (error) {
      console.warn('[recovered-revenue] booking-uppslag misslyckades (skippar bokningar):', error.message)
    } else {
      for (const b of data || []) {
        if (!b.created_at) continue
        events.push({
          kind: 'booking_created',
          event_id: String(b.booking_id),
          customer_id: b.customer_id ? String(b.customer_id) : null,
          amount_kr: 0, // verifierad händelse, men inget verifierat kronvärde — aldrig schablon här
          occurred_at_ms: new Date(b.created_at).getTime(),
          label: 'Bokning skapad efter utskick',
        })
      }
    }
  } catch (err: any) {
    console.warn('[recovered-revenue] booking-uppslag kastade (skippar bokningar):', err?.message || err)
  }

  const attributions = attributeRevenue(cards, events)
  return {
    total_recovered_kr: sumRecoveredKr(attributions),
    attributions,
    window_days: ATTRIBUTION_WINDOW_DAYS,
  }
}
