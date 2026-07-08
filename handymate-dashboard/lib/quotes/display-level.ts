/**
 * Visningsnivå (Del C — produktbank) — EN sanning för "Vad ska kunden se?".
 *
 * Tre nivåer som alla renderare (data-builder + mallar + public-API + portal +
 * legacy-PDF) delar. Läs-mappningen normaliserar bort de gamla, delvis
 * inkoherenta kolumnkombinationerna (inkl. total_only → summary, TILLÄGG 3).
 *
 * Rena funktioner utan sidoeffekter — enhetstestas i tests/display-level.spec.ts.
 */

export type DisplayLevel = 'summary' | 'rows' | 'full'

/**
 * Läs-mappning från lagrade quote-fält → visningsnivå.
 *
 * | detail_level              | show_unit_prices | → nivå     |
 * |---------------------------|------------------|------------|
 * | subtotals_only            | (spelar ingen)   | summary    |
 * | total_only (legacy)       | (spelar ingen)   | summary    |  ← TILLÄGG 3
 * | detailed / null / undef.  | !== false        | full       |
 * | detailed / null / undef.  | === false        | rows       |
 *
 * `total_only` skrivs aldrig igen (nivåväljaren skriver bara subtotals_only /
 * detailed), men gamla offerter — t.ex. Christoffers "Montering av handledare"
 * — bär det värdet och ska äntligen rendera som "Bara delsummor" överallt.
 */
export function resolveDisplayLevel(q: {
  detail_level?: string | null
  show_unit_prices?: boolean | null
}): DisplayLevel {
  const level = q.detail_level
  if (level === 'subtotals_only' || level === 'total_only') return 'summary'
  // detailed, null eller undefined → detaljerad rad-rendering.
  // show_unit_prices === false betyder "Rad för rad" (dölj à-priser + antal).
  // Allt annat (true / null / undefined) → full detalj — oförändrat för
  // alla befintliga offerter som aldrig satte flaggan.
  if (q.show_unit_prices === false) return 'rows'
  return 'full'
}

/**
 * Vilka kolumner en nivå exponerar. showRows === false ⇒ nivån visar
 * gruppsummor i stället för radlista (summary).
 */
export function displayLevelToColumns(level: DisplayLevel): {
  showQuantities: boolean
  showUnitPrices: boolean
  showRows: boolean
} {
  switch (level) {
    case 'summary':
      return { showQuantities: false, showUnitPrices: false, showRows: false }
    case 'rows':
      return { showQuantities: false, showUnitPrices: false, showRows: true }
    case 'full':
    default:
      return { showQuantities: true, showUnitPrices: true, showRows: true }
  }
}

/**
 * Nivå → koherenta skrivfält (nivåväljaren är enda skrivvägen). Skriver ALDRIG
 * total_only — bara subtotals_only / detailed enligt planens tabell:
 *   summary → (subtotals_only, false, false)
 *   rows    → (detailed,       false, false)
 *   full    → (detailed,       true,  true)
 */
export function displayLevelToWriteFields(level: DisplayLevel): {
  detail_level: 'subtotals_only' | 'detailed'
  show_unit_prices: boolean
  show_quantities: boolean
} {
  switch (level) {
    case 'summary':
      return { detail_level: 'subtotals_only', show_unit_prices: false, show_quantities: false }
    case 'rows':
      return { detail_level: 'detailed', show_unit_prices: false, show_quantities: false }
    case 'full':
    default:
      return { detail_level: 'detailed', show_unit_prices: true, show_quantities: true }
  }
}

export interface DisplayGroup {
  heading: string
  total: number
}

/** Minsta radform som grupperingen behöver. Speglar quote_items. */
interface GroupableItem {
  item_type?: string | null
  description?: string | null
  group_name?: string | null
  quantity?: number | null
  unit_price?: number | null
  total?: number | null
  [key: string]: any
}

const DEFAULT_GROUP_HEADING = 'Arbete och material'

function rowTotal(it: GroupableItem): number {
  // total-kolumnen är auktoritativ när den finns; annars härled från qty×pris.
  if (it.total != null) return Number(it.total)
  return Number(it.quantity ?? 0) * Number(it.unit_price ?? 0)
}

/**
 * Partitionerar radlistan i gruppsummor för "Bara delsummor".
 *
 * - Rubrikrader ('heading') delar in listan: allt UNDER en rubrik (fram till
 *   nästa rubrik) tillhör den. Rader FÖRE första rubriken — eller helt utan
 *   rubriker — samlas i standardgruppen "Arbete och material".
 * - En grupp får ingen summa-rad om den saknar innehåll (tom rubrik hoppas över).
 * - Gruppsumman = Σ item-rader. Rabattrader ('discount') räknas MED som negativa
 *   (så delsumman speglar det faktiska priset). Fritext ('text') och delsumme-
 *   rader ('subtotal') ignoreras — subtotals skulle dubbelräkna gruppen.
 * - Tillval ('option') räknas ALDRIG i gruppsummorna. De returneras separat med
 *   fulla fält och renderas alltid som egna, kryssbara rader — kundens val ska
 *   vara synligt oavsett nivå.
 */
export function groupItemsForSummary(items: GroupableItem[]): {
  groups: DisplayGroup[]
  options: GroupableItem[]
} {
  const options: GroupableItem[] = []
  const groups: DisplayGroup[] = []

  // Aktuell grupp; skapas lat (default-gruppen bara om den får innehåll).
  let current: { heading: string; total: number; hasContent: boolean } | null = null
  let defaultStarted = false

  const flush = () => {
    if (current && current.hasContent) {
      groups.push({ heading: current.heading, total: current.total })
    }
    current = null
  }

  for (const it of items) {
    const type = it.item_type ?? 'item'

    if (type === 'option') {
      options.push(it)
      continue
    }

    if (type === 'heading') {
      // Ny sektion börjar — stäng föregående (även default-gruppen).
      flush()
      current = {
        heading: (it.description ?? it.group_name ?? '').toString().trim() || DEFAULT_GROUP_HEADING,
        total: 0,
        hasContent: false,
      }
      continue
    }

    // Rader före första rubriken → default-gruppen (skapas en gång).
    if (!current) {
      current = { heading: DEFAULT_GROUP_HEADING, total: 0, hasContent: false }
      defaultStarted = true
    }

    if (type === 'item') {
      current.total += rowTotal(it)
      current.hasContent = true
    } else if (type === 'discount') {
      // Rabatt lagras negativt; räkna alltid som negativ oavsett lagrat tecken.
      current.total += -Math.abs(rowTotal(it))
      current.hasContent = true
    }
    // 'text' och 'subtotal' påverkar inte summan och skapar inte innehåll.
  }

  flush()
  void defaultStarted // (dokumenterar avsikten; ingen ytterligare logik behövs)

  return { groups, options }
}
