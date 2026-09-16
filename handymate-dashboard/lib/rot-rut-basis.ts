export type RotRutBasisType = 'rot' | 'rut'

export interface RotRutBasisItem {
  item_type?: string | null
  quantity?: number | null
  unit_price?: number | null
  total?: number | null
  labor_amount?: number | null
  rot_rut_type?: string | null
  is_rot_eligible?: boolean | null
  is_rut_eligible?: boolean | null
}

export type TimeEntryCategory = 'work' | 'travel' | 'material_pickup' | 'meeting' | 'admin'

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/**
 * Delar en rad öre-exakt. Arbete och resa avrundas var för sig; material är
 * alltid resten så att de tre delarna summerar exakt till radtotalen.
 */
export function splitLine(total: number, laborShare: number, travelShare: number = 0) {
  if (![total, laborShare, travelShare].every(Number.isFinite)) {
    throw new Error('Radbelopp och andelar måste vara ändliga tal.')
  }
  if (laborShare < 0 || laborShare > 1 || travelShare < 0 || travelShare > 1 || laborShare + travelShare > 1) {
    throw new Error('Arbetsandel och reseandel måste vara 0–1 och tillsammans högst 1.')
  }
  const normalizedTotal = round2(total)
  const labor_amount = round2(normalizedTotal * laborShare)
  const travel_amount = round2(normalizedTotal * travelShare)
  const material_amount = round2(normalizedTotal - labor_amount - travel_amount)
  return { labor_amount, material_amount, travel_amount }
}

export function splitTimeEntryLine(total: number, category: TimeEntryCategory | string | null | undefined) {
  const normalized = category || 'work'
  return {
    ...splitLine(total, normalized === 'work' ? 1 : 0, normalized === 'travel' ? 1 : 0),
    is_rot_eligible: normalized === 'work',
    is_rut_eligible: false,
  }
}

export function getBasisRotRutType(item: RotRutBasisItem): RotRutBasisType | null {
  if (item.rot_rut_type !== undefined) {
    return item.rot_rut_type === 'rot' || item.rot_rut_type === 'rut' ? item.rot_rut_type : null
  }
  if (item.is_rot_eligible) return 'rot'
  if (item.is_rut_eligible) return 'rut'
  return null
}

/**
 * Gemensam ROT-/RUT-bas för offert, faktura, avtal och agentvägar.
 * `labor_amount = 0` är en giltig ren material-/reserad; bara legacy-rader
 * utan delning faller tillbaka på sin radtotal.
 */
export function rotRutLaborBasis(items: RotRutBasisItem[], type: RotRutBasisType): number {
  return round2((items || [])
    .filter(item => (item.item_type || 'item') === 'item')
    .filter(item => {
      const resolved = getBasisRotRutType(item)
      if (resolved) return resolved === type
      return item.item_type === 'labor'
    })
    .reduce((sum, item) => {
      const lineTotal = Number(item.total ?? (Number(item.quantity ?? 0) * Number(item.unit_price ?? 0)))
      const labor = item.labor_amount == null ? lineTotal : Number(item.labor_amount)
      return sum + (Number.isFinite(labor) ? labor : 0)
    }, 0))
}
