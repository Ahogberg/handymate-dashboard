/** Counts describe processed rows; importedIds contains unique, confirmed customer IDs. */
export interface CustomerImportResult {
  total: number
  success: number
  created: number
  updated: number
  unchanged: number
  skipped: number
  failed: number
  errors: string[]
  importedIds: string[]
}

export function readCustomerImportResult(value: unknown): CustomerImportResult {
  const r = value as CustomerImportResult | null
  const counts = r && [r.total, r.success, r.created, r.updated, r.unchanged, r.skipped, r.failed]
  if (!r || !counts?.every(n => Number.isSafeInteger(n) && n >= 0)
    || r.success !== r.created + r.updated + r.unchanged
    || r.total !== r.success + r.skipped + r.failed
    || !Array.isArray(r.errors) || !r.errors.every(s => typeof s === 'string')
    || !Array.isArray(r.importedIds) || !r.importedIds.every(s => typeof s === 'string' && s.length > 0)
    || new Set(r.importedIds).size !== r.importedIds.length || r.importedIds.length > r.success) {
    throw new Error('Importresultatet kunde inte bekräftas. Kontrollera kundlistan innan du försöker igen.')
  }
  return r
}

export function customerImportTitle(result: CustomerImportResult): string {
  if (result.failed > 0) return result.success > 0 ? 'Importen är delvis klar' : 'Importen kunde inte slutföras'
  if (result.created + result.updated === 0) return 'Inga kunduppgifter ändrades'
  return 'Kundlistan är inläst'
}
