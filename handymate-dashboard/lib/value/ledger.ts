/**
 * Value Ledger — fyrstegsvyn (2026-08-12): "Handymate den här månaden:
 * X kr identifierade möjligheter · Y kr agerat · Z kr fakturerat ·
 * W kr bekräftat betalt."
 *
 * ═══ VARFÖR FYRA STADIER, ALDRIG EN SUMMA ═══
 *
 * Fyra helt olika sanningsnivåer bor på samma rad i ägarens mockup, och de
 * FÅR ALDRIG blandas eller summeras — en identifierad möjlighet är inte en
 * intäkt, och ett fakturerat belopp är inte bekräftat betalt. Varje stadium
 * är en delmängd av det förra:
 *
 *   Identifierat ⊇ Agerat ⊇ Fakturerat ⊇ Betalt
 *
 * Kronorna i ett senare stadium kommer ALDRIG från kortets egen uppskattning
 * — de kommer från FAKTURANS verkliga belopp, uppslaget separat. Ett kort
 * som gissade fel ska inte kunna redovisa sin gissning som bekräftad krona.
 *
 * ═══ SKILLNADEN MOT VÄRDEKVITTOT (lib/value/vardekvitto.ts) ═══
 *
 * Värdekvittot attribuerar en händelse till den månad HÄNDELSEN inträffade.
 * Ledgern gör motsatsen med flit: den följer SAMMA kortkohort (skapade i
 * perioden) genom hela dess livscykel, oavsett i vilken månad nästa steg
 * råkar inträffa. Frågan här är "hur långt kom det vi identifierade den här
 * månaden?", inte "vilka kronor hörde till den här månaden?". Två olika
 * frågor, två olika härledningar — inget i den ena filen läser den andra.
 *
 * ═══ SANNINGSREGLERNA (facit i tests/value-ledger.spec.ts) ═══
 *
 * 1. Stadierna är delmängder ÅT HÖGER. Agerat är alltid ur samma kortmängd
 *    som Identifierat (bara status filtreras bort) — aldrig en separat
 *    fråga mot databasen som råkar ge fler rader.
 * 2. Gamla kort utan en bevisad direktreferens (artifacts, se
 *    mapApprovalRowToCard i recovered-revenue.ts) når ALDRIG Fakturerat
 *    eller Betalt. De exkluderas — de gissas aldrig in.
 * 3. Inga korrelationsantaganden. Bara direktreferenser (samma regel som
 *    DIRECT_ONLY_APPROVAL_TYPES i attributionskärnan) — en faktura som
 *    råkar tillhöra samma kund räknas aldrig som bevis här.
 * 4. Fakturerat/Betalt kronor är FAKTURANS belopp, aldrig kortets
 *    uppskattning (payload.amount_kr/amount_estimate/projected_overrun).
 * 5. Samma faktura räknas aldrig två gånger, även om två kort råkar peka
 *    på den.
 *
 * ═══ ÅTERANVÄNDNING ═══
 *
 * Direktreferens-extraktionen (vilket payload-fält som är den sanna källan
 * per korttyp) duplicerades INTE — den återanvänds från
 * mapApprovalRowToCard i lib/value/recovered-revenue.ts, som redan är
 * facit-testad per typ. Månadsfönstret återanvänds från manadsfonster i
 * lib/value/vardekvitto.ts. Betalt-fönstret för invoice_reminder-vägen
 * (fakturan fanns redan innan kortet — se nedan) återanvänder
 * isWithinAttributionWindow oförändrad.
 *
 * Enda avvikelsen: uppgiftens beskrivning nämnde generiskt
 * "payload.execution_result.artifacts.invoice_id" för både missad_intakt
 * och fakturera_projekt. Den verkliga källan för missad_intakt är
 * payload.draft_invoice_id (se mapApprovalRowToCard — det kortet exekveras
 * aldrig via den generiska godkännande-vägen). Att återanvända
 * mapApprovalRowToCard i stället för att duplicera en förenklad — och här
 * felaktig — beskrivning är den ärliga vägen.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { manadsfonster } from '@/lib/value/vardekvitto'
import { mapApprovalRowToCard, isWithinAttributionWindow } from '@/lib/value/recovered-revenue'

export const MANADS_LEDGER_METHOD_VERSION = 1

/** De fem korttyperna som bär ett belopp värt att spåra genom ledgern.
    Medvetet skild från RECOVERY_APPROVAL_TYPES — profitability_warning är
    ingen outbound-jakt, den är en varning, men hör hemma i "identifierat". */
export const VALUE_LEDGER_APPROVAL_TYPES = [
  'profitability_warning',
  'create_ata_draft',
  'missad_intakt',
  'fakturera_projekt',
  'invoice_reminder',
] as const

const APPROVED_STATUSES = new Set(['approved', 'auto_approved'])

export interface ManadsLedgerSteg {
  kr: number
  antal: number
}

/** Kohortens avvisade kort — "föll bort på vägen" (Etapp B3, 2026-08-17).
    Delmängd av Identifierat (kortets egen uppskattning i kronor), aldrig
    inräknad i något av de fyra stegen. */
export interface ManadsLedgerBortfall {
  avvisade_antal: number
  avvisade_kr: number
}

/** Vilket steg ETT kort nått — delmängdssemantiken per rad (Etapp B4).
    'betalt' implicerar att kortet passerat stegen före (invoice_reminder
    hoppar fakturerat by design, se byggManadsLedger steg 3). */
export type LedgerItemSteg = 'identifierat' | 'agerat' | 'fakturerat' | 'betalt' | 'avvisad'

/** En rad i "Varje krona, med sin historia" — ren exponering av det
    byggManadsLedger redan vet, aldrig en egen härledning. kr är fakturans
    belopp när fakturan är bevisad (fakturerat/betalt), annars kortets egen
    uppskattning — samma regel som aggregaten. invoice_id exponeras BARA
    när fakturan är bevisad. */
export interface LedgerItem {
  approval_id: string
  title: string | null
  approval_type: string
  /** ISO-tidsstämpel — kortets skapande (kohortnyckeln). */
  created_at: string
  steg: LedgerItemSteg
  kr: number
  invoice_id: string | null
  paid_at: string | null
}

export interface ManadsLedger {
  /** 'ÅÅÅÅ-MM' — kalendermånaden kortet SKAPADES i, inte händelsens månad. */
  period: string
  identifierat: ManadsLedgerSteg
  agerat: ManadsLedgerSteg
  fakturerat: ManadsLedgerSteg
  betalt: ManadsLedgerSteg
  /** Additivt (B3): avvisade kort ur samma kohort. Ändrar ingen stegmatte. */
  bortfall: ManadsLedgerBortfall
  /** Additivt (B4): en rad per kohortkort, nyast först. Ändrar ingen stegmatte. */
  items: LedgerItem[]
  method_version: number
}

/**
 * Kortets EGNA belopp (uppskattning/underlag) — en helt annan sort än
 * fakturans verkliga belopp. Används BARA för Identifierat/Agerat. Kort utan
 * belopp ger 0 (räknas i antal på anropsstället, aldrig i kronor).
 */
export function ledgerCardAmountKr(
  approvalType: string,
  payload: Record<string, unknown> | null | undefined,
): number {
  const p = payload || {}
  const raw =
    approvalType === 'profitability_warning' ? p.projected_overrun
    : approvalType === 'create_ata_draft' ? p.amount_estimate
    : p.amount_kr // missad_intakt, fakturera_projekt, invoice_reminder
  return typeof raw === 'number' && raw > 0 ? raw : 0
}

/**
 * Ett kort, redan berikat med sin (ev.) direktreferens till en faktura.
 * invoice_verified skiljer "en referens finns" från "referensen är bevisad"
 * — bara relevant för create_ata_draft, där ÄTA:n måste ha blivit
 * FAKTURERAD (project_change.invoiced_at satt), inte bara länkad.
 */
export interface LedgerCard {
  id: string
  approval_type: string
  status: string
  created_at_ms: number
  /** Godkännandets tidsstämpel — null om kortet aldrig resolvats. */
  resolved_at_ms: number | null
  amount_kr: number
  invoice_id: string | null
  invoice_verified: boolean
  /** Kortets rubrik (pending_approvals.title) — bara för items-raderna. */
  title?: string | null
}

export interface LedgerInvoiceFacit {
  total_kr: number
  paid: boolean
  paid_at_ms: number | null
}

const tomtSteg = (): ManadsLedgerSteg => ({ kr: 0, antal: 0 })

/**
 * Ren härledning. Ingen I/O, inget datum-nu — allt kommer via `input`.
 */
export function byggManadsLedger(input: {
  period: string
  cards: LedgerCard[]
  invoices: Map<string, LedgerInvoiceFacit>
}): ManadsLedger {
  const fonster = manadsfonster(input.period)
  if (!fonster) {
    return Object.freeze({
      period: input.period,
      identifierat: tomtSteg(),
      agerat: tomtSteg(),
      fakturerat: tomtSteg(),
      betalt: tomtSteg(),
      bortfall: Object.freeze({ avvisade_antal: 0, avvisade_kr: 0 }),
      items: Object.freeze([]) as unknown as LedgerItem[],
      method_version: MANADS_LEDGER_METHOD_VERSION,
    })
  }

  // ── Steg 1: Identifierat — kort SKAPADE i perioden. ──────────────────
  const identifierade = input.cards.filter(
    c => c.created_at_ms >= fonster.fromMs && c.created_at_ms < fonster.toMs,
  )
  const identifierat: ManadsLedgerSteg = {
    kr: Math.round(identifierade.reduce((s, c) => s + c.amount_kr, 0)),
    antal: identifierade.length,
  }

  // ── Steg 2: Agerat — delmängd av identifierade, status godkänt. ──────
  const agerade = identifierade.filter(c => APPROVED_STATUSES.has(c.status))
  const agerat: ManadsLedgerSteg = {
    kr: Math.round(agerade.reduce((s, c) => s + c.amount_kr, 0)),
    antal: agerade.length,
  }

  // ── Additiv spårning (B4): vilket steg varje kort nått. Uppgraderas i
  // stegloopar nedan — ren bokföring bredvid aggregaten, aldrig egen matte.
  const stegPerKort = new Map<string, LedgerItemSteg>()
  for (const c of identifierade) {
    stegPerKort.set(
      c.id,
      c.status === 'rejected' ? 'avvisad'
      : APPROVED_STATUSES.has(c.status) ? 'agerat'
      : 'identifierat',
    )
  }

  // ── Steg 3: Fakturerat — delmängd av agerade MED en bevisad faktura. ─
  // invoice_reminder hoppar alltid över det här steget: fakturan fanns
  // redan innan kortet skapades (kortet ÄR en påminnelse om en befintlig
  // faktura). Den går direkt till Betalt-prövningen nedan (n/a här).
  const raknadeFakturor = new Set<string>()
  const fakturerade: Array<{ kort: LedgerCard; faktura: LedgerInvoiceFacit }> = []
  for (const c of agerade) {
    if (c.approval_type === 'invoice_reminder') continue
    if (!c.invoice_id || !c.invoice_verified) continue // gammalt kort utan artifacts → exkluderas, gissas aldrig
    if (raknadeFakturor.has(c.invoice_id)) continue // samma faktura räknas aldrig två gånger
    const faktura = input.invoices.get(c.invoice_id)
    if (!faktura) continue
    raknadeFakturor.add(c.invoice_id)
    fakturerade.push({ kort: c, faktura })
    stegPerKort.set(c.id, 'fakturerat')
  }
  const fakturerat: ManadsLedgerSteg = {
    // Fakturans BELOPP — aldrig kortets uppskattning.
    kr: Math.round(fakturerade.reduce((s, f) => s + f.faktura.total_kr, 0)),
    antal: fakturerade.length,
  }

  // ── Steg 4: Betalt. ───────────────────────────────────────────────────
  //   a) de fakturerade vars faktura är betald.
  //   b) invoice_reminder-vägen: fakturan fanns redan, räknas direkt in i
  //      Betalt när den betalas EFTER kortets godkännande, inom samma
  //      fönster som attributionskärnan (isWithinAttributionWindow,
  //      'invoice_paid' = 14 dagar) — precis den regel recovered-revenue.ts
  //      redan facit-testar, återanvänd oförändrad i stället för duplicerad.
  const raknadeBetalda = new Set<string>()
  let betaltKr = 0
  let betaltAntal = 0
  for (const { kort, faktura } of fakturerade) {
    if (!faktura.paid) continue
    if (raknadeBetalda.has(kort.invoice_id as string)) continue
    raknadeBetalda.add(kort.invoice_id as string)
    betaltKr += faktura.total_kr
    betaltAntal += 1
    stegPerKort.set(kort.id, 'betalt')
  }
  for (const c of agerade) {
    if (c.approval_type !== 'invoice_reminder') continue
    if (!c.invoice_id || c.resolved_at_ms === null) continue
    if (raknadeBetalda.has(c.invoice_id)) continue
    const faktura = input.invoices.get(c.invoice_id)
    if (!faktura || !faktura.paid || faktura.paid_at_ms === null) continue
    if (!isWithinAttributionWindow(c.resolved_at_ms, faktura.paid_at_ms, 'invoice_paid')) continue
    raknadeBetalda.add(c.invoice_id)
    betaltKr += faktura.total_kr
    betaltAntal += 1
    stegPerKort.set(c.id, 'betalt')
  }

  // ── Additivt (B3): bortfallet — avvisade ur samma kohort, kortets egen
  // uppskattning (samma sort som Identifierat, aldrig fakturakronor).
  const avvisade = identifierade.filter(c => c.status === 'rejected')
  const bortfall: ManadsLedgerBortfall = {
    avvisade_antal: avvisade.length,
    avvisade_kr: Math.round(avvisade.reduce((s, c) => s + c.amount_kr, 0)),
  }

  // ── Additivt (B4): en rad per kohortkort, nyast först. Fakturans belopp
  // först när fakturan är bevisad (steget säger det) — annars kortets egen
  // uppskattning. invoice_id/paid_at exponeras bara när de är bevisade.
  const items: LedgerItem[] = identifierade
    .map(c => {
      const steg = stegPerKort.get(c.id) as LedgerItemSteg
      const fakturaBevisad = steg === 'fakturerat' || steg === 'betalt'
      const faktura = fakturaBevisad && c.invoice_id ? input.invoices.get(c.invoice_id) : undefined
      return Object.freeze({
        approval_id: c.id,
        title: c.title ?? null,
        approval_type: c.approval_type,
        created_at: new Date(c.created_at_ms).toISOString(),
        steg,
        kr: Math.round(faktura ? faktura.total_kr : c.amount_kr),
        invoice_id: fakturaBevisad ? c.invoice_id : null,
        paid_at:
          steg === 'betalt' && faktura && faktura.paid_at_ms !== null
            ? new Date(faktura.paid_at_ms).toISOString()
            : null,
      })
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  return Object.freeze({
    period: input.period,
    identifierat: Object.freeze(identifierat),
    agerat: Object.freeze(agerat),
    fakturerat: Object.freeze(fakturerat),
    betalt: Object.freeze({ kr: Math.round(betaltKr), antal: betaltAntal }),
    bortfall: Object.freeze(bortfall),
    items: Object.freeze(items) as unknown as LedgerItem[],
    method_version: MANADS_LEDGER_METHOD_VERSION,
  })
}

/**
 * I/O: hämtar periodens kort, slår upp deras direktreferenser (återanvänder
 * mapApprovalRowToCard) och de fakturor de pekar på, och kör den rena
 * härledningen. Kastar vid DB-fel (samma mönster som app/api/dashboard/
 * pengar/route.ts) — en trasig ledger ska svara 500, aldrig visa en tyst
 * nolla som ser ut som ett ärligt "inget hände".
 */
export async function getManadsLedger(
  supabase: SupabaseClient,
  businessId: string,
  period: string,
): Promise<ManadsLedger | null> {
  const fonster = manadsfonster(period)
  if (!fonster) return null

  const { data: rows, error } = await supabase
    .from('pending_approvals')
    .select('id, approval_type, status, created_at, resolved_at, payload, title')
    .eq('business_id', businessId)
    .in('approval_type', VALUE_LEDGER_APPROVAL_TYPES as unknown as string[])
    .gte('created_at', new Date(fonster.fromMs).toISOString())
    .lt('created_at', new Date(fonster.toMs).toISOString())
    .limit(2000)
  if (error) throw new Error(`pending_approvals-uppslag misslyckades: ${error.message}`)

  const kortRader = rows || []
  if (kortRader.length === 0) {
    return byggManadsLedger({ period, cards: [], invoices: new Map() })
  }

  // Direktreferenserna — samma extraktion som attributionskärnan (per-typ-
  // logiken bor bara där, se filhuvudets ÅTERANVÄNDNING-avsnitt).
  const kartor = kortRader.map(row => ({
    row,
    kort: mapApprovalRowToCard({
      id: row.id,
      approval_type: row.approval_type,
      resolved_at: row.resolved_at,
      created_at: row.created_at,
      payload: row.payload,
    }),
  }))

  // ÄTA-kort: ata_id → project_change.invoice_id, kräver invoiced_at satt
  // (samma uppslag som getRecoveredRevenue gör för samma korttyp).
  const ataIds = Array.from(
    new Set(
      kartor
        .filter(k => k.row.approval_type === 'create_ata_draft' && k.kort?.ata_id)
        .map(k => k.kort!.ata_id as string),
    ),
  )
  const ataFacit = new Map<string, { invoice_id: string | null; invoiced_at: string | null }>()
  if (ataIds.length > 0) {
    const { data: changes, error: changeErr } = await supabase
      .from('project_change')
      .select('change_id, invoice_id, invoiced_at')
      .eq('business_id', businessId)
      .in('change_id', ataIds)
    if (changeErr) throw new Error(`project_change-uppslag misslyckades: ${changeErr.message}`)
    for (const r of changes || []) {
      ataFacit.set(String(r.change_id), {
        invoice_id: r.invoice_id ? String(r.invoice_id) : null,
        invoiced_at: r.invoiced_at ?? null,
      })
    }
  }

  const cards: LedgerCard[] = kartor
    .map(({ row, kort }) => {
      const createdAtMs = row.created_at ? new Date(row.created_at).getTime() : NaN
      let invoiceId: string | null = kort?.invoice_id ?? null
      let invoiceVerified = invoiceId !== null
      if (row.approval_type === 'create_ata_draft' && kort?.ata_id) {
        const facit = ataFacit.get(kort.ata_id)
        invoiceId = facit?.invoice_id ?? null
        invoiceVerified = Boolean(invoiceId && facit?.invoiced_at)
      }
      return {
        id: row.id,
        approval_type: row.approval_type,
        status: row.status,
        created_at_ms: createdAtMs,
        resolved_at_ms: kort?.resolved_at_ms ?? null,
        amount_kr: ledgerCardAmountKr(row.approval_type, (row.payload || {}) as Record<string, unknown>),
        invoice_id: invoiceId,
        invoice_verified: invoiceVerified,
        title: typeof (row as { title?: unknown }).title === 'string' ? (row as { title?: string }).title! : null,
      }
    })
    .filter(c => Number.isFinite(c.created_at_ms))

  const invoiceIds = Array.from(
    new Set(cards.map(c => c.invoice_id).filter((v): v is string => v !== null)),
  )
  const invoices = new Map<string, LedgerInvoiceFacit>()
  if (invoiceIds.length > 0) {
    const { data: invRows, error: invErr } = await supabase
      .from('invoice')
      .select('invoice_id, total, status, paid_at')
      .eq('business_id', businessId)
      .in('invoice_id', invoiceIds)
    if (invErr) throw new Error(`invoice-uppslag misslyckades: ${invErr.message}`)
    for (const inv of invRows || []) {
      invoices.set(String(inv.invoice_id), {
        total_kr: Number(inv.total) || 0,
        paid: inv.status === 'paid',
        paid_at_ms: inv.paid_at ? new Date(inv.paid_at).getTime() : null,
      })
    }
  }

  return byggManadsLedger({ period, cards, invoices })
}
