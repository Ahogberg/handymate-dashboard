export function toCreditItem(item: any, id: string) {
  return {
    ...item,
    id,
    total: -Math.abs(item.total || (item.quantity * item.unit_price) || 0),
    unit_price: -Math.abs(item.unit_price || 0),
    labor_amount: -Math.abs(item.labor_amount || 0),
    material_amount: -Math.abs(item.material_amount || 0),
    travel_amount: -Math.abs(item.travel_amount || 0),
  }
}
