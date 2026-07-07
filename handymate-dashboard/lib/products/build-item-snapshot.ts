/**
 * Snapshot-byggare för produktbanken (tasks/produktbank-spec.md §Schema p.4).
 *
 * RENA funktioner — inga API-anrop, ingen DB. Vid val av produkt i offertraden
 * fryses allt raden behöver in i quote_items (snapshot-principen): produktens
 * komponenter, arbetsandel och split. Produktändringar efteråt rör ALDRIG
 * befintliga offerter.
 *
 * Härledningsordning (öres-invariant per konstruktion — TILLÄGG 2):
 *   labor_amount    = round2(total × arbetsandel)
 *   material_amount = round2(total − labor_amount)   ← härledd, aldrig egen beräkning
 *
 * `??` (nullish), ALDRIG `||`: labor_share = 0 är ett GILTIGT värde
 * (ren materialprodukt), inte en falsy-fallback.
 */

export interface SnapshotComponent {
  component_type: 'arbete' | 'material'
  description: string
  quantity_per_unit: number
  unit: string
  unit_cost: number
}

export interface SnapshotProduct {
  id: string
  name: string
  sku: string | null
  sales_price: number
  default_labor_share: number | null
}

export interface ItemSnapshotResult {
  component_snapshot: {
    product_id: string
    product_name: string
    sku: string | null
    sales_price: number
    /** Fryst arbetsandel — mängdändring i editorn räknar om spliten
        klient-side från detta värde utan att behöva API:t igen. */
    labor_share: number | null
    components: SnapshotComponent[]
  } | null
  labor_share: number | null // null = ingen split (legacy-beteende)
  labor_amount: number | null
  material_amount: number | null
  estimated_hours: number | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Arbetsandel = arbetskomponenternas kostnadsandel av total komponentkostnad.
 * Utan komponenter (eller med noll-kostnad): produktens default_labor_share.
 * `?? null` — 0 är giltigt (ren material), undefined/null = ingen split.
 */
export function resolveLaborShare(
  components: SnapshotComponent[],
  defaultLaborShare: number | null | undefined
): number | null {
  if (components.length > 0) {
    const cost = (c: SnapshotComponent) => c.quantity_per_unit * c.unit_cost
    const totalCost = components.reduce((s, c) => s + cost(c), 0)
    if (totalCost <= 0) return defaultLaborShare ?? null
    return (
      components
        .filter((c) => c.component_type === 'arbete')
        .reduce((s, c) => s + cost(c), 0) / totalCost
    )
  }
  return defaultLaborShare ?? null // ?? — 0 är giltigt!
}

/**
 * Split av radens total. material_amount HÄRLEDS ur labor_amount så att
 * labor_amount + material_amount === total exakt, även på ojämna belopp.
 */
export function splitAmount(
  total: number,
  laborShare: number | null
): { labor_amount: number | null; material_amount: number | null } {
  if (laborShare === null) return { labor_amount: null, material_amount: null }
  const labor = round2(total * laborShare)
  return { labor_amount: labor, material_amount: round2(total - labor) }
}

/**
 * Kalkylerade timmar = mängd × Σ(arbetskomponenters quantity_per_unit).
 * Inga arbetskomponenter → null (ingen timuppskattning, inte 0).
 */
export function estimateHours(
  components: SnapshotComponent[],
  quantity: number
): number | null {
  const laborComponents = components.filter((c) => c.component_type === 'arbete')
  if (laborComponents.length === 0) return null
  return quantity * laborComponents.reduce((s, c) => s + c.quantity_per_unit, 0)
}

/**
 * Bygger radens kompletta snapshot vid produktval:
 * fryst komponentlista + arbetsandel + split + timmar.
 */
export function buildItemSnapshot(
  product: SnapshotProduct,
  components: SnapshotComponent[],
  quantity: number,
  rowTotal: number
): ItemSnapshotResult {
  const laborShare = resolveLaborShare(components, product.default_labor_share)
  const { labor_amount, material_amount } = splitAmount(rowTotal, laborShare)
  return {
    component_snapshot: {
      product_id: product.id,
      product_name: product.name,
      sku: product.sku ?? null,
      sales_price: product.sales_price,
      labor_share: laborShare,
      components,
    },
    labor_share: laborShare,
    labor_amount,
    material_amount,
    estimated_hours: estimateHours(components, quantity),
  }
}
