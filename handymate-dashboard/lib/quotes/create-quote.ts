import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Den kanoniska offertbyggaren — den ENDA vägen in i quotes + quote_items
 * (2026-08-09, offertauditens Q-P1-1/Q-P1-8).
 *
 * ═══ VARFÖR DEN FINNS ═══
 *
 * Fem ställen skrev offerter direkt i databasen, och varje ställe hade sin
 * egen uppfattning om vad en offert är:
 *
 *   api/quotes POST        ~50 fält, quote_items, nummer, sign_token
 *   tool-router (agenten)   16 fält, quote_items — men inget nummer, ingen token
 *   matte/chat               6 fält — inga rader, inga totaler alls
 *   voice/execute            8 fält — inga rader
 *
 * Följderna var inte teoretiska. En agentskapad offert saknade sign_token, så
 * smart-communication satte quote_link: undefined — SMS:et till kunden gick ut
 * UTAN länk. Den saknade quote_number, så den var osynlig i Mattes lista och
 * omöjlig att referera i samtal. Mattes utkast hade varken rader eller
 * totaler; PDF:en blev tom.
 *
 * Byggaren äger INVARIANTERNA — det varje offert måste ha oavsett vem som
 * skapar den. De rika UI-fälten (ROT-split, betalplaner, reservationer …)
 * passerar genom `extra` utan att byggaren behöver kunna dem: byggaren är
 * golvet, inte taket.
 *
 * ═══ NUMRET ═══
 *
 * Numreringen är count+1 — race-benägen, precis som auditen (Q-P1-9) säger.
 * sql/v98 gjorde (business, år, nummer) UNIKT, så kollisionen är numera ett
 * databasfel i stället för ett tyst dubblettnummer. Byggaren tar det felet
 * som en signal och räknar om — upp till tre varv. Det är inte elegant, men
 * det är korrekt under constraint:en, och all logik bor på ETT ställe.
 */

export interface CanonicalQuoteItem {
  description: string
  quantity?: number
  unit?: string
  unit_price?: number
  /** 'item' (default), 'section' eller 'text' — samma värden som quote_items. */
  item_type?: string
  group_name?: string | null
  total?: number
  cost_price?: number | null
  article_number?: string | null
  category_slug?: string | null
  is_rot_eligible?: boolean
  is_rut_eligible?: boolean
  rot_rut_type?: string | null
  option_selected?: boolean
  option_default?: boolean
  linked_product_id?: string | null
  labor_amount?: number | null
  material_amount?: number | null
  estimated_hours?: number | null
  component_snapshot?: unknown
  show_components_to_customer?: boolean
  is_hidden?: boolean
  id?: string
}

export interface CreateQuoteInput {
  customerId?: string | null
  title: string
  description?: string | null
  status?: 'draft' | 'sent'
  items?: CanonicalQuoteItem[]
  vatRate?: number
  rotRutType?: string | null
  rotRutDeduction?: number
  validDays?: number
  createdBy?: string | null
  /**
   * Vem som skapade offerten — syns i quotes.source om kolumnen finns i
   * `extra`, men främst i loggen när något går snett.
   */
  source: 'ui' | 'agent' | 'matte' | 'voice' | 'duplicate' | 'system'
  /**
   * Rika fält som byggaren inte behöver förstå: ROT/RUT-detaljer, betalplan,
   * reservationssnapshot, versionsfält … Skrivs rakt in på quotes-raden.
   * `extra` kan ALDRIG skriva över invarianterna — de appliceras efteråt.
   */
  extra?: Record<string, unknown>
}

export interface CreateQuoteResult {
  success: boolean
  quoteId?: string
  quoteNumber?: string
  signToken?: string
  quote?: Record<string, unknown>
  error?: string
}

function slumpId(prefix: string): string {
  return prefix + '_' + Math.random().toString(36).substring(2, 14)
}

/**
 * Split-invarianten (v67): labor + material = radens total. Läker hellre än
 * felar — ett angivet labor_amount vinner och material härleds ur resten.
 * Samma beteende som api/quotes alltid haft; nu bor det här.
 */
export function resolveItemSplit(
  item: { description?: string; labor_amount?: number | null; material_amount?: number | null },
  rowTotal: number
): { labor_amount: number | null; material_amount: number | null } {
  const labor = item.labor_amount ?? null
  if (labor === null) {
    return { labor_amount: null, material_amount: item.material_amount ?? null }
  }
  const material = item.material_amount ?? null
  if (material === null || Math.abs(labor + material - rowTotal) > 0.01) {
    const derived = Math.round((rowTotal - labor) * 100) / 100
    if (material !== null) {
      console.warn(
        `[quotes] Split-invariant korrigerad för rad "${item.description}": ` +
        `labor ${labor} + material ${material} != total ${rowTotal} → material_amount ${derived}`
      )
    }
    return { labor_amount: labor, material_amount: derived }
  }
  return { labor_amount: labor, material_amount: material }
}

/** Nästa lediga nummer i år — count+1, skyddat av v98:s unika index. */
/**
 * BUGFIX (2026-08-25, verklig repro mot produktion): räknade tidigare
 * `count(*) + 1` — en offert som NÅGONSIN raderas för businessen i år (t.ex.
 * E2E-städning, en admin/support-borttagning, eller ett framtida
 * radera-offert-flöde) gör att count permanent glider isär från det högsta
 * FAKTISKT utfärdade numret. Retry-loopen i createQuote() upptäcker
 * kollisionen korrekt (arNummerkollision) men räknar om EXAKT samma
 * count-baserade nummer varje försök — ingen av de tre retries gör
 * framsteg, så skapandet failar permanent (kunden ser aldrig felet; det
 * gäller ALLA vägar in, inte bara UI:t, se filhuvudets kanonisk-motivering).
 * Reproducerat: quotes '#002'/'#003' fanns, count=2 → nästa='#003' → krock
 * i evighet. Facit: högsta FAKTISKA numret + 1, inte antalet rader.
 */
async function nastaOffertnummer(supabase: SupabaseClient, businessId: string): Promise<string> {
  const year = new Date().getFullYear()
  const { data } = await supabase
    .from('quotes')
    .select('quote_number')
    .eq('business_id', businessId)
    .gte('created_at', `${year}-01-01`)
    .not('quote_number', 'is', null)
  const hogsta = (data || []).reduce((max, row) => {
    const n = parseInt(String(row.quote_number).replace(/\D/g, ''), 10)
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  return `#${String(hogsta + 1).padStart(3, '0')}`
}

function arNummerkollision(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '23505' && /quote.*number|business_year_number/i.test(error.message || '')
}

export async function createQuote(
  supabase: SupabaseClient,
  businessId: string,
  input: CreateQuoteInput
): Promise<CreateQuoteResult> {
  const quoteId = slumpId('quote')
  const signToken = crypto.randomUUID()
  const vatRate = input.vatRate ?? 25
  const validUntil = new Date()
  validUntil.setDate(validUntil.getDate() + (input.validDays ?? 30))

  const rader = input.items ?? []

  // Totaler härleds ur raderna när rader finns. Skickar anroparen egna
  // totaler i extra (UI:t räknar med rabatter byggaren inte kan) vinner de —
  // de ligger EFTER de härledda i spridningen nedan, men före invarianterna.
  const radTotal = (r: CanonicalQuoteItem) =>
    r.item_type && r.item_type !== 'item' ? (r.total ?? 0) : (r.quantity ?? 0) * (r.unit_price ?? 0)
  const subtotal = rader.reduce((s, r) => s + radTotal(r), 0)
  const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100
  const total = subtotal + vatAmount
  const rotRutDeduction = input.rotRutDeduction ?? 0

  const harledda = rader.length > 0
    ? {
        subtotal,
        vat_amount: vatAmount,
        total,
        customer_pays: total - rotRutDeduction,
        labor_total: rader.reduce((s, r) => s + (resolveItemSplit(r, radTotal(r)).labor_amount ?? 0), 0),
        material_total: rader.reduce((s, r) => s + (resolveItemSplit(r, radTotal(r)).material_amount ?? 0), 0),
      }
    : {}

  // Tre varv mot v98:s unika index. Kollisionen är sällsynt (två skapare i
  // samma sekund) — men den som drabbas ska få ett nytt nummer, inte ett fel.
  let quoteNumber = ''
  let quote: Record<string, unknown> | null = null
  let sistaFel = ''

  for (let forsok = 0; forsok < 3; forsok++) {
    quoteNumber = await nastaOffertnummer(supabase, businessId)

    const { data, error } = await supabase
      .from('quotes')
      .insert({
        ...harledda,
        ...(input.extra || {}),
        // ── Invarianterna. Appliceras SIST — ingen extra kan ta bort dem. ──
        quote_id: quoteId,
        business_id: businessId,
        customer_id: input.customerId ?? null,
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? 'draft',
        quote_number: quoteNumber,
        sign_token: signToken,
        vat_rate: vatRate,
        rot_rut_type: input.rotRutType ?? null,
        rot_rut_deduction: rotRutDeduction || (input.extra?.rot_rut_deduction ?? 0),
        valid_until: validUntil.toISOString().split('T')[0],
        created_by: input.createdBy ?? null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (!error) { quote = data; break }
    sistaFel = error.message
    if (!arNummerkollision(error)) break
  }

  if (!quote) {
    console.error(`[createQuote:${input.source}] offerthuvudet kunde inte skapas:`, sistaFel)
    return { success: false, error: sistaFel || 'Offerten kunde inte skapas' }
  }

  if (rader.length > 0) {
    const radRader = rader.map((r, idx) => {
      const rowTotal = radTotal(r)
      const split = resolveItemSplit(r, rowTotal)
      return {
        id: r.id || slumpId('qi'),
        quote_id: quoteId,
        business_id: businessId,
        item_type: r.item_type || 'item',
        group_name: r.group_name ?? null,
        description: r.description || '',
        quantity: r.quantity ?? 0,
        unit: r.unit || 'st',
        unit_price: r.unit_price ?? 0,
        total: rowTotal,
        cost_price: r.cost_price ?? null,
        article_number: r.article_number ?? null,
        category_slug: r.category_slug ?? null,
        // ROT-rätten som en sanning (tasks/plan-rot-ratt.md, 2026-09-02):
        // is_rot_eligible/is_rut_eligible tas emot rakt av från anroparen
        // här — den här funktionen är INTE sanningen om vad som ger ROT.
        // Den sanningen är lib/rot/ratt.ts (bedomAvdrag), källbelagd mot
        // docs/bransch/*.md. Anropare som sätter dessa booleaner utan att
        // ha frågat bedomAvdrag riskerar exakt det pengafel branschgenom-
        // gången hittade (t.ex. fasadmålning i bostadsrätt eller rena
        // servicejobb markerade ROT).
        is_rot_eligible: r.is_rot_eligible ?? false,
        is_rut_eligible: r.is_rut_eligible ?? false,
        rot_rut_type: r.rot_rut_type ?? null,
        option_selected: r.option_selected ?? false,
        option_default: r.option_default ?? false,
        linked_product_id: r.linked_product_id ?? null,
        labor_amount: split.labor_amount,
        material_amount: split.material_amount,
        estimated_hours: r.estimated_hours ?? null,
        component_snapshot: r.component_snapshot ?? null,
        show_components_to_customer: r.show_components_to_customer ?? false,
        is_hidden: r.is_hidden ?? false,
        sort_order: idx,
      }
    })

    const { error: radFel } = await supabase.from('quote_items').insert(radRader)
    if (radFel) {
      // En offert utan sina rader är korrupt — ta bort huvudet så inget
      // halvsparat blir kvar. Samma regel som tool-routern redan hade;
      // nu gäller den alla skapare.
      await supabase.from('quotes').delete().eq('quote_id', quoteId).eq('business_id', businessId)
      console.error(`[createQuote:${input.source}] raderna kunde inte sparas:`, radFel.message)
      return { success: false, error: `Kunde inte spara offertens rader: ${radFel.message}` }
    }
  }

  return { success: true, quoteId, quoteNumber, signToken, quote }
}
