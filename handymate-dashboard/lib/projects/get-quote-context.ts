/**
 * getProjectQuoteContext (Etapp 3.1, 2026-05-22).
 *
 * Läs-helper som hämtar offert-rader, textblock och PDF-länk FRÅN ett
 * projekt via project.quote_id-referensen. Referens-modell — ingen
 * kopiering, ingen ny tabell.
 *
 * Designkontrakt:
 * - has_quote=false om projektet saknar quote_id → ingen krasch
 * - Läser samma källa som quote-edit-UI: primärt quote_items-tabellen,
 *   fallback till quote.items JSONB (legacy-offerter, ej migrerade)
 * - PDF on-demand via /api/quotes/pdf?id=<quote_id> (ingen lagrad fil)
 * - Visar ALLTID aktuell offert-data (referens-modell). Medvetet val
 *   — Etapp 4 överväger snapshot-låsning (TD-64).
 *
 * Arbete-vs-material-distinktion:
 * - Legacy JSONB: type='labor'|'material' är källan
 * - quote_items: ingen explicit type-kolumn. Heuristik:
 *   * is_rot_eligible || is_rut_eligible || unit-i-tim → arbete
 *   * Annars → material
 * - Heuristiken är best-effort. För osäkra fall blir det material.
 *   Branschspecifika anpassningar kan göras i framtida iteration.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────

export interface QuoteLineRow {
  id: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  is_rot_eligible: boolean
  is_rut_eligible: boolean
  article_number: string | null
  /** Endast satt för rubriker/text/subtotal/discount (ej för 'item') */
  item_type: 'item' | 'heading' | 'text' | 'subtotal' | 'discount'
}

export interface ProjectQuoteContext {
  has_quote: boolean
  quote_id: string | null
  quote_number: string | null
  status: string | null
  total_kr: number
  vat_rate: number
  vat_amount: number
  rader: {
    arbete: QuoteLineRow[]
    material: QuoteLineRow[]
    /** Rubriker, fritext, delsumma, rabatt — bevarad ordning från offerten */
    rubriker_och_texter: QuoteLineRow[]
  }
  textblock: {
    introduktion: string | null
    avslutning: string | null
    ej_inkluderat: string | null
    ata_villkor: string | null
    betalningsvillkor: string | null
    /** Egen 'Villkor'-text (terms_text, från Tier 1 omtag) */
    villkor: string | null
  }
  /** Metadata för läsbarhet i UI */
  meta: {
    valid_until: string | null
    sent_at: string | null
    accepted_at: string | null
    declined_at: string | null
    project_address: string | null
  }
  dokument: {
    /** On-demand PDF — genereras vid varje request, alltid aktuell */
    pdf_url: string
  } | null
  legacy: {
    /** True om data lästes från quote.items JSONB (gammal offert
        ej migrerad till quote_items-tabellen). TD-65 räknar förekomst. */
    using_jsonb_fallback: boolean
  }
}

// ─────────────────────────────────────────────────────────────────
// Internal row-types
// ─────────────────────────────────────────────────────────────────

interface QuoteItemTableRow {
  id: string
  item_type: string | null
  description: string | null
  quantity: number | null
  unit: string | null
  unit_price: number | null
  total: number | null
  is_rot_eligible: boolean | null
  is_rut_eligible: boolean | null
  article_number: string | null
  sort_order: number | null
}

interface QuoteJsonbItem {
  id?: string
  type?: string  // legacy: 'labor' | 'material' | undefined
  item_type?: string
  description?: string
  name?: string
  quantity?: number
  unit?: string
  unit_price?: number
  price?: number
  total?: number
  is_rot_eligible?: boolean
  is_rut_eligible?: boolean
  article_number?: string
  sort_order?: number
}

interface QuoteRow {
  quote_id: string
  business_id: string
  quote_number: string | null
  status: string | null
  title: string | null
  total: number | null
  vat_rate: number | null
  vat_amount: number | null
  items: QuoteJsonbItem[] | null
  introduction_text: string | null
  conclusion_text: string | null
  not_included: string | null
  ata_terms: string | null
  payment_terms_text: string | null
  terms_text: string | null
  valid_until: string | null
  sent_at: string | null
  accepted_at: string | null
  declined_at: string | null
  project_address: string | null
}

// ─────────────────────────────────────────────────────────────────
// Normalize-helpers
// ─────────────────────────────────────────────────────────────────

function normalizeItemType(raw: string | null | undefined): QuoteLineRow['item_type'] {
  if (raw === 'heading' || raw === 'text' || raw === 'subtotal' || raw === 'discount') return raw
  return 'item'
}

function isLaborByHeuristic(row: QuoteLineRow): boolean {
  // Best-effort. ROT/RUT-eligible är vanligtvis arbete (skattereduktion
  // gäller arbetskostnad). Plus unit som indikerar timme/h/timmar.
  if (row.is_rot_eligible || row.is_rut_eligible) return true
  const unit = (row.unit || '').toLowerCase().trim()
  if (unit === 'tim' || unit === 'h' || unit === 'timmar' || unit === 'hour') return true
  return false
}

function fromQuoteItemTable(r: QuoteItemTableRow): QuoteLineRow {
  return {
    id: r.id,
    description: r.description || '',
    quantity: Number(r.quantity || 0),
    unit: r.unit || 'st',
    unit_price: Number(r.unit_price || 0),
    total: Number(r.total || 0),
    is_rot_eligible: !!r.is_rot_eligible,
    is_rut_eligible: !!r.is_rut_eligible,
    article_number: r.article_number,
    item_type: normalizeItemType(r.item_type),
  }
}

function fromJsonbItem(j: QuoteJsonbItem, idx: number): QuoteLineRow {
  const qty = Number(j.quantity || 0)
  const price = Number(j.unit_price ?? j.price ?? 0)
  return {
    id: j.id || `legacy-${idx}`,
    description: j.description || j.name || '',
    quantity: qty,
    unit: j.unit || 'st',
    unit_price: price,
    total: Number(j.total ?? qty * price),
    is_rot_eligible: !!j.is_rot_eligible,
    is_rut_eligible: !!j.is_rut_eligible,
    article_number: j.article_number || null,
    item_type: normalizeItemType(j.item_type),
  }
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

export async function getProjectQuoteContext(
  supabase: SupabaseClient,
  projectId: string,
  businessId: string,
): Promise<ProjectQuoteContext> {
  // Tomt-stub som returneras om projekt eller offert saknas
  const emptyContext: ProjectQuoteContext = {
    has_quote: false,
    quote_id: null,
    quote_number: null,
    status: null,
    total_kr: 0,
    vat_rate: 25,
    vat_amount: 0,
    rader: { arbete: [], material: [], rubriker_och_texter: [] },
    textblock: {
      introduktion: null,
      avslutning: null,
      ej_inkluderat: null,
      ata_villkor: null,
      betalningsvillkor: null,
      villkor: null,
    },
    meta: {
      valid_until: null,
      sent_at: null,
      accepted_at: null,
      declined_at: null,
      project_address: null,
    },
    dokument: null,
    legacy: { using_jsonb_fallback: false },
  }

  // ── 1. Project (för quote_id) ────────────────────────────────
  const { data: projectRow } = await supabase
    .from('project')
    .select('quote_id')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .single()

  if (!projectRow || !projectRow.quote_id) {
    return emptyContext
  }

  const quoteId = projectRow.quote_id as string

  // ── 2. Quote (metadata + textblock + JSONB-fallback) ────────
  const { data: quoteData } = await supabase
    .from('quotes')
    .select(
      'quote_id, business_id, quote_number, status, title, total, vat_rate, vat_amount, items, ' +
        'introduction_text, conclusion_text, not_included, ata_terms, payment_terms_text, terms_text, ' +
        'valid_until, sent_at, accepted_at, declined_at, project_address',
    )
    .eq('quote_id', quoteId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (!quoteData) {
    // Projektet har quote_id men offerten är borttagen — degraderat tomt
    // läge med quote_id satt så UI kan visa "offert saknas".
    return { ...emptyContext, quote_id: quoteId }
  }

  const quote = quoteData as unknown as QuoteRow

  // ── 3. Quote items (primärt: tabell, fallback: JSONB) ───────
  const { data: itemsTableData } = await supabase
    .from('quote_items')
    .select(
      'id, item_type, description, quantity, unit, unit_price, total, ' +
        'is_rot_eligible, is_rut_eligible, article_number, sort_order',
    )
    .eq('quote_id', quoteId)
    .order('sort_order', { ascending: true })

  const itemsFromTable = (itemsTableData || []) as unknown as QuoteItemTableRow[]
  let usingJsonbFallback = false
  let rows: QuoteLineRow[] = []

  if (itemsFromTable.length > 0) {
    rows = itemsFromTable.map(fromQuoteItemTable)
  } else if (quote.items && Array.isArray(quote.items) && quote.items.length > 0) {
    // Legacy-offert: data finns bara i JSONB. Använd för läsning men
    // räkna in i TD-65.
    usingJsonbFallback = true
    const jsonbRows = quote.items
      .map((j, idx) => ({ row: fromJsonbItem(j, idx), originalType: j.type }))
    // För JSONB är j.type ('labor'|'material') källan för arbete-vs-material
    rows = jsonbRows.map(({ row, originalType }) => {
      if (originalType === 'labor' && !row.is_rot_eligible && !row.is_rut_eligible) {
        // Sätt en intern flagga via unit-trick — vi vill att isLaborByHeuristic
        // upptäcker den. Använd unit='tim' om den är tom så heuristiken funkar.
        return row.unit === 'st' ? { ...row, unit: 'tim' } : row
      }
      return row
    })
  }

  // Sortera item-rader i tre buckets
  const rubrikerOchTexter: QuoteLineRow[] = []
  const arbete: QuoteLineRow[] = []
  const material: QuoteLineRow[] = []

  for (const r of rows) {
    if (r.item_type !== 'item') {
      rubrikerOchTexter.push(r)
      continue
    }
    if (isLaborByHeuristic(r)) {
      arbete.push(r)
    } else {
      material.push(r)
    }
  }

  return {
    has_quote: true,
    quote_id: quote.quote_id,
    quote_number: quote.quote_number,
    status: quote.status,
    total_kr: Math.round(Number(quote.total || 0)),
    vat_rate: Number(quote.vat_rate || 25),
    vat_amount: Math.round(Number(quote.vat_amount || 0)),
    rader: {
      arbete,
      material,
      rubriker_och_texter: rubrikerOchTexter,
    },
    textblock: {
      introduktion: quote.introduction_text,
      avslutning: quote.conclusion_text,
      ej_inkluderat: quote.not_included,
      ata_villkor: quote.ata_terms,
      betalningsvillkor: quote.payment_terms_text,
      villkor: quote.terms_text,
    },
    meta: {
      valid_until: quote.valid_until,
      sent_at: quote.sent_at,
      accepted_at: quote.accepted_at,
      declined_at: quote.declined_at,
      project_address: quote.project_address,
    },
    dokument: {
      // Bekräftad route-signatur (app/api/quotes/pdf/route.ts:93):
      // GET /api/quotes/pdf?id=<quote_id>
      pdf_url: `/api/quotes/pdf?id=${encodeURIComponent(quote.quote_id)}`,
    },
    legacy: {
      using_jsonb_fallback: usingJsonbFallback,
    },
  }
}
