/**
 * Välj projektets befintliga fakturabyggare utan att blanda källor.
 *
 * Fastpris och blandavtal med accepterad offert faktureras från avtalet
 * (offertrader + kundgodkänd ÄTA). Löpande projekt och projekt utan offert
 * faktureras från faktiskt registrerad tid och material.
 *
 * Detta är medvetet inte en universell aggregator: samma kostnad får aldrig
 * råka komma med både som offertrad och som registrerat material.
 */
export type ProjectInvoicePath = 'contract' | 'actuals'

export function projectInvoicePath(input: {
  projectType: string | null | undefined
  quoteId: string | null | undefined
}): ProjectInvoicePath {
  if (
    input.quoteId &&
    (input.projectType === 'fixed_price' || input.projectType === 'mixed')
  ) {
    return 'contract'
  }
  return 'actuals'
}

export function invoiceableProjectAmount(input: {
  path: ProjectInvoicePath
  expectedRevenue: number
  invoicedRevenue: number
  uninvoicedTimeRevenue: number
  uninvoicedMaterialRevenue: number
}): number {
  if (input.path === 'contract') {
    return Math.max(0, input.expectedRevenue - input.invoicedRevenue)
  }
  return Math.max(0, input.uninvoicedTimeRevenue + input.uninvoicedMaterialRevenue)
}
