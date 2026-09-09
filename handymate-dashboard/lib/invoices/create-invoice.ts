import { generateOCR } from '@/lib/ocr'
import { createHash, randomUUID } from 'node:crypto'
import { svDateStr } from '@/lib/dates'
import type { InvoiceType, InvoiceStatus } from '@/lib/types/invoice'

/**
 * Gemensam createInvoice()-kärna — ETAPP 6a (offert-masterplan.md,
 * faktura-sprinten), TVÄRGÅENDE punkt.
 *
 * ÅTTA kodvägar skapade tidigare fakturor med en handskriven, identisk
 * sexstegskedja (hämta prefix+nummer → bygg invoice_number → generera OCR
 * → beräkna förfallodatum → INSERT → bumpa next_invoice_number) UTAN lås
 * på nummerserien — två samtidiga anrop kunde läsa samma
 * next_invoice_number innan någon skrev tillbaka och få DUBBLA
 * fakturanummer (bokföringsproblem). Denna fil bryter ut just den kedjan.
 *
 * MEDVETET UTELÄMNAT (läs innan du "förbättrar" detta vidare): total-/ROT-
 * beräkningen. Kartläggningen visade att alla granskade vägar (invoices/
 * route.ts, from-quote, from-project, from-time-entries,
 * create-final-invoice, auto-invoice-on-complete, invoice-visit) REDAN
 * anropar calculateCappedDeduction korrekt (inga hårdkodade ROT/RUT-satser
 * hittades — masterplanens misstanke om from-project verkar vara inaktuell,
 * se rapporten) — men de gör det med SINSEMELLAN OLIKA underlag (labor_amount
 * vs radtotal, olika filter för vilka rader som räknas, globala
 * rabattprocent på olika ställen). Att tvinga alla åtta genom EN gemensam
 * totals-formel här hade riskerat att tyst ändra belopp på skarpa fakturor
 * — uttryckligen förbjudet ("beteendeförändringar ... ska INTE smygas in").
 * Kärnan tar därför FÄRDIGA totaler + färdiga items från anroparen; den
 * äger bara nummer/OCR/datum/insert/bump.
 */

export interface CreateInvoiceExtraFields {
  [column: string]: unknown
}

export interface CreateInvoiceInput {
  /** Explicit source ownership is committed with the invoice, never afterwards. */
  sources?: { timeEntryIds?: string[]; materialIds?: string[]; changeIds?: string[] }
  requestKey?: string
  businessId: string
  customerId?: string | null
  /** JSONB — de åtta vägarna bygger sina rader med sinsemellan olika
      fältuppsättningar (vissa saknar id/item_type/sort_order helt, t.ex.
      auto-generate). Kärnan skriver dem rakt in i invoice.items utan att
      normalisera formen — samma "any[]"-hållning som samtliga vägar redan
      hade INNAN denna etapp. */
  items: any[]
  /** Redan beräknade totaler — se filkommentaren för varför kärnan inte
      räknar om dem. */
  subtotal: number
  vatRate?: number
  vatAmount: number
  total: number
  rotRutType?: 'rot' | 'rut' | null
  rotRutDeduction?: number
  /** Utelämnad → `total` (inget avdrag). */
  customerPays?: number
  discountPercent?: number
  discountAmount?: number
  projectId?: string | null
  quoteId?: string | null
  bookingId?: string | null
  invoiceType?: InvoiceType
  status?: InvoiceStatus
  /** Dagar till förfallodatum från invoiceDate. Default 30. Kreditfakturor
      (som förfaller samma dag) skickar 0. */
  dueDays?: number
  /** Default: nu. */
  invoiceDate?: Date
  personnummer?: string | null
  fastighetsbeteckning?: string | null
  introductionText?: string | null
  conclusionText?: string | null
  ourReference?: string | null
  yourReference?: string | null
  /** ETAPP 6c (offert-masterplan.md, faktura-sprinten): sql/v82 — per-
      faktura stilöverstyrning (speglar quotes.template_style). Utelämnad/
      null → business_config.quote_template_style (oförändrat beteende). */
  templateStyle?: 'modern' | 'premium' | 'friendly' | null
  /**
   * Kringgår RPC:n helt — ENDAST för kreditfakturor (invoices/credit),
   * som har en egen KF-YYYY-NNN-serie räknad på `COUNT(*) WHERE
   * invoice_type='credit'` istället för business_config.next_invoice_number.
   * Den serien delar INTE dubblett-problemet i samma utsträckning (kredit-
   * skapande är sällsynt/manuellt, inte cron/auto-triggat) och är medvetet
   * OFÖRÄNDRAD i denna etapp — se rapporten.
   */
  numberOverride?: { invoiceNumber: string; ocrNumber: string }
  /** Path-specifika kolumner som inte har en egen typad plats ovan
      (bankgiro_number/plusgiro_number/bank_account, is_credit_note,
      original_invoice_id, credit_for_invoice_id, credit_reason,
      partial_number, partial_total, ...). Skrivs rakt in i INSERT-raden. */
  extraFields?: CreateInvoiceExtraFields
  /** Supabase .select()-strängen för den returnerade raden. Default '*'. */
  selectClause?: string
}

export interface CreateInvoiceResult {
  /** Reusing an existing invoice must not emit another invoice_created event. */
  replayed?: boolean
  invoice: any
  invoiceNumber: string
  ocrNumber: string
  /** true → RPC:n (next_invoice_number, sql/v81) saknades eller
      misslyckades och kärnan föll tillbaka till den gamla read-then-write-
      kedjan. Dubblettrisken kvarstår i det läget — loggas som warning,
      men blockerar INTE fakturaskapandet (migrationsordningen får aldrig
      knäcka prod). */
  usedNumberFallback: boolean
}

/** "FV-2026-042" — ren funktion, facit-testad direkt (tests/create-invoice-core.spec.ts). */
export function formatInvoiceNumber(prefix: string, year: number, num: number): string {
  return `${prefix}-${year}-${String(num).padStart(3, '0')}`
}

/** OCR-numret länkas till det numeriska löpnumret (num), INTE till hela
    invoice_number-strängen (som innehåller bokstäver/bindestreck) — samma
    konvention som samtliga åtta vägar redan använde
    (generateOCR(String(nextNum))). */
export function computeInvoiceOcr(num: number): string {
  return generateOCR(String(num))
}

/** Ren datumfunktion — UTC-säker via lokala Date-metoder (samma mönster
    som alla åtta vägar redan använde: `new Date(invoiceDate);
    d.setDate(d.getDate() + dueDays)`). */
export function computeDueDate(invoiceDate: Date, dueDays: number): Date {
  const d = new Date(invoiceDate)
  d.setDate(d.getDate() + dueDays)
  return d
}

function toDateOnly(d: Date): string {
  // Svensk kalenderdag, aldrig UTC-dagen (F21).
  return svDateStr(d)
}

/**
 * Skapar en faktura. `supabase` tas in som parameter (inte importerad här)
 * så anroparens egen getServerSupabase()/service-role-instans återanvänds
 * rakt av — samma mönster som lib/invoices/apply-payment.ts.
 */
export async function createInvoice(
  supabase: any,
  input: CreateInvoiceInput,
): Promise<CreateInvoiceResult> {
  const invoiceDate = input.invoiceDate ?? new Date()
  const year = invoiceDate.getFullYear()

  let invoiceNumber: string
  let ocrNumber: string
  let usedNumberFallback = false

  if (input.numberOverride) {
    invoiceNumber = input.numberOverride.invoiceNumber
    ocrNumber = input.numberOverride.ocrNumber
  } else {
    const { data: rpcRows, error: rpcError } = await supabase.rpc('next_invoice_number', {
      p_business_id: input.businessId,
    })
    const rpcRow = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows

    if (!rpcError && rpcRow && typeof rpcRow.num === 'number') {
      invoiceNumber = formatInvoiceNumber(rpcRow.prefix || 'FV', year, rpcRow.num)
      ocrNumber = computeInvoiceOcr(rpcRow.num)
    } else {
      if (input.sources || input.requestKey) throw rpcError || new Error('Fakturanumret kunde inte reserveras säkert.')
      // Fallback: RPC:n (sql/v81_invoice_number_rpc.sql) är inte körd ännu,
      // eller businessen saknar en business_config-rad. Gamla read-then-
      // write-kedjan — samma dubblettrisk som INNAN denna etapp, men appen
      // ska aldrig sluta fungera bara för att migrationsordningen inte
      // hunnit köras. Loggas synligt så Andreas ser om RPC:n behöver köras.
      console.warn(
        '[createInvoice] next_invoice_number-RPC saknas/misslyckades — faller tillbaka till read-then-write (dubblettrisk kvarstår tills sql/v81 körts):',
        rpcError?.message || 'tom rad',
      )
      usedNumberFallback = true
      const { data: config } = await supabase
        .from('business_config')
        .select('invoice_prefix, next_invoice_number')
        .eq('business_id', input.businessId)
        .single()
      const prefix = config?.invoice_prefix || 'FV'
      const num = config?.next_invoice_number || 1
      invoiceNumber = formatInvoiceNumber(prefix, year, num)
      ocrNumber = computeInvoiceOcr(num)
      await supabase
        .from('business_config')
        .update({ next_invoice_number: num + 1 })
        .eq('business_id', input.businessId)
    }
  }

  const dueDate = computeDueDate(invoiceDate, input.dueDays ?? 30)

  const row: Record<string, unknown> = {
    business_id: input.businessId,
    customer_id: input.customerId ?? null,
    project_id: input.projectId ?? null,
    quote_id: input.quoteId ?? null,
    invoice_number: invoiceNumber,
    invoice_type: input.invoiceType ?? 'standard',
    status: input.status ?? 'draft',
    items: input.items,
    subtotal: input.subtotal,
    vat_rate: input.vatRate ?? 25,
    vat_amount: input.vatAmount,
    total: input.total,
    rot_rut_type: input.rotRutType ?? null,
    rot_rut_deduction: input.rotRutDeduction ?? 0,
    customer_pays: input.customerPays ?? input.total,
    personnummer: input.personnummer ?? null,
    fastighetsbeteckning: input.fastighetsbeteckning ?? null,
    invoice_date: toDateOnly(invoiceDate),
    due_date: toDateOnly(dueDate),
    ocr_number: ocrNumber,
    introduction_text: input.introductionText ?? null,
    conclusion_text: input.conclusionText ?? null,
    our_reference: input.ourReference ?? null,
    your_reference: input.yourReference ?? null,
  }
  if (input.templateStyle !== undefined) row.template_style = input.templateStyle
  if (input.discountPercent !== undefined) row.discount_percent = input.discountPercent
  if (input.discountAmount !== undefined) row.discount_amount = input.discountAmount
  // booking_id (v74) är inte en kolumn alla vägar bryr sig om — sätts bara
  // när anroparen faktiskt anger den, så vägar som aldrig satte den
  // (t.ex. invoices/route.ts) inte plötsligt skriver NULL ovanpå ett
  // annat default eller triggar ett schema-cache-fel på miljöer utan v74.
  if (input.bookingId !== undefined) row.booking_id = input.bookingId
  if (input.extraFields) Object.assign(row, input.extraFields)

  if (input.sources || input.requestKey) {
    row.invoice_id = row.invoice_id || `inv_${randomUUID()}`
    const sources = {
      times: Array.from(new Set(input.sources?.timeEntryIds || [])).sort(),
      materials: Array.from(new Set(input.sources?.materialIds || [])).sort(),
      changes: Array.from(new Set(input.sources?.changeIds || [])).sort(),
    }
    if (Object.values(sources).some(ids => ids.some(id => typeof id !== 'string' || !id))) throw new Error('Ogiltiga fakturakällor.')
    const { extraFields, invoiceDate: _date, selectClause: _select, sources: _sources, requestKey: _key, ...intentInput } = input
    const { invoice_id: _id, ...extra } = extraFields || {}
    const intent = { ...intentInput, extraFields: extra, sources,
      items: input.items.map(({ id: _itemId, ...item }: any) => item) }
    const hasSources = Object.values(sources).some(ids => ids.length)
    const key = input.requestKey || (hasSources ? `sources:${createHash('sha256').update(JSON.stringify(sources)).digest('hex')}` : `request:${randomUUID()}`)
    const { data, error } = await supabase.rpc('create_invoice_with_sources', {
      p_row: row, p_key: key, p_intent: intent,
      p_times: sources.times, p_materials: sources.materials, p_changes: sources.changes,
    })
    if (error) throw error
    const saved = Array.isArray(data) ? data[0] : data
    if (!saved?.invoice_id || saved.business_id !== input.businessId) throw new Error('Fakturan saknar sparbekräftelse. Försök igen med samma underlag.')
    let invoice = saved
    if (input.selectClause?.includes('customer:')) {
      const readback = await supabase.from('invoice').select(input.selectClause).eq('business_id', input.businessId).eq('invoice_id', saved.invoice_id).single()
      if (readback.error || !readback.data) throw readback.error || new Error('Fakturan sparades men kunde inte läsas tillbaka. Försök igen med samma underlag.')
      invoice = readback.data
    }
    return { invoice, invoiceNumber: saved.invoice_number, ocrNumber: saved.ocr_number, usedNumberFallback, replayed: saved.invoice_id !== row.invoice_id }
  }

  const { data: invoice, error } = await supabase
    .from('invoice')
    .insert(row)
    .select(input.selectClause ?? '*')
    .single()

  if (error) throw error
  if (!invoice) throw new Error('Fakturan saknar sparbekräftelse.')

  return { invoice, invoiceNumber, ocrNumber, usedNumberFallback }
}
