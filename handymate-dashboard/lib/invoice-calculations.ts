import { InvoiceItem, InvoiceTotals } from '@/lib/types/invoice'

/**
 * Calculate all invoice totals from structured items
 */
export function calculateInvoiceTotals(
  items: InvoiceItem[],
  discountPercent: number = 0,
  vatRate: number = 25
): InvoiceTotals {
  const regularItems = items.filter(i => (i.item_type || 'item') === 'item')
  const discountItems = items.filter(i => i.item_type === 'discount')

  // Sum by ROT/RUT eligibility
  let laborTotal = 0
  let materialTotal = 0
  let serviceTotal = 0
  let rotWorkCost = 0
  let rutWorkCost = 0

  for (const item of regularItems) {
    const lineTotal = item.quantity * item.unit_price
    if (item.is_rot_eligible) {
      laborTotal += lineTotal
      rotWorkCost += lineTotal
    } else if (item.is_rut_eligible) {
      laborTotal += lineTotal
      rutWorkCost += lineTotal
    } else if (item.type === 'labor' || item.unit === 'tim' || item.unit === 'timmar' || item.unit === 'hour' || item.unit === 'h') {
      laborTotal += lineTotal
    } else {
      materialTotal += lineTotal
    }
  }

  // Discount rows (negative amounts)
  const discountFromRows = discountItems.reduce((sum, item) => sum + Math.abs(item.total), 0)

  const subtotal = laborTotal + materialTotal + serviceTotal
  const discountAmount = subtotal * (discountPercent / 100) + discountFromRows
  const afterDiscount = subtotal - discountAmount
  const vat = afterDiscount * (vatRate / 100)
  const total = afterDiscount + vat

  // ROT: 30% avdrag, max 50 000 kr/person/år
  const rotDeduction = rotWorkCost > 0 ? Math.min(rotWorkCost * 0.30, 50000) : 0
  const rotCustomerPays = rotWorkCost > 0 ? total - rotDeduction : 0

  // RUT: 50% avdrag, max 75 000 kr/person/år
  const rutDeduction = rutWorkCost > 0 ? Math.min(rutWorkCost * 0.50, 75000) : 0
  const rutCustomerPays = rutWorkCost > 0 ? total - rutDeduction : 0

  return {
    laborTotal,
    materialTotal,
    serviceTotal,
    subtotal,
    discountAmount,
    afterDiscount,
    vat,
    total,
    rotWorkCost,
    rotDeduction,
    rotCustomerPays,
    rutWorkCost,
    rutDeduction,
    rutCustomerPays,
  }
}

/**
 * Calculate subtotal for items above the subtotal row within the same group
 */
export function calculateSubtotal(items: InvoiceItem[], subtotalIndex: number): number {
  const subtotalItem = items[subtotalIndex]
  if (!subtotalItem || subtotalItem.item_type !== 'subtotal') return 0

  let sum = 0
  // Walk backwards from the subtotal row
  for (let i = subtotalIndex - 1; i >= 0; i--) {
    const item = items[i]
    // Stop at another subtotal or heading
    if (item.item_type === 'subtotal') break
    if (item.item_type === 'heading') break
    // Only sum regular items and discounts
    if ((item.item_type || 'item') === 'item') {
      sum += item.quantity * item.unit_price
    } else if (item.item_type === 'discount') {
      sum -= Math.abs(item.total)
    }
  }
  return sum
}

/**
 * Recalculate all subtotal rows and item totals
 */
export function recalculateItems(items: InvoiceItem[]): InvoiceItem[] {
  return items.map((item, index) => {
    if ((item.item_type || 'item') === 'item') {
      return { ...item, total: item.quantity * item.unit_price }
    }
    if (item.item_type === 'discount') {
      // Discount: total is negative
      return { ...item, total: -(Math.abs(item.quantity) * Math.abs(item.unit_price)) }
    }
    if (item.item_type === 'subtotal') {
      return { ...item, total: calculateSubtotal(items, index) }
    }
    return item
  })
}

/**
 * Generate a new InvoiceItem ID
 */
export function generateInvoiceItemId(): string {
  return 'ii_' + Math.random().toString(36).substr(2, 12)
}

/**
 * Create a default empty item of given type
 */
export function createDefaultInvoiceItem(
  type: InvoiceItem['item_type'],
  sortOrder: number,
  groupName?: string
): InvoiceItem {
  const base: InvoiceItem = {
    id: generateInvoiceItemId(),
    item_type: type,
    group_name: groupName,
    description: '',
    quantity: 0,
    unit: 'st',
    unit_price: 0,
    total: 0,
    is_rot_eligible: false,
    is_rut_eligible: false,
    sort_order: sortOrder,
  }

  switch (type) {
    case 'heading':
      return { ...base, description: 'Ny rubrik' }
    case 'text':
      return { ...base, description: '' }
    case 'subtotal':
      return { ...base, description: 'Delsumma' }
    case 'discount':
      return { ...base, description: 'Rabatt', unit: 'st', quantity: 1 }
    default:
      return { ...base, quantity: 1, unit: 'st' }
  }
}
