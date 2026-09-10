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

/** A quote is not proof of fixed-price billing; require a choice at navigation. */
export function invoiceReviewEntry(quoteId: string | null | undefined): 'choose' | 'actuals' {
  return quoteId ? 'choose' : 'actuals'
}

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

/**
 * Listvyn har inte hela ekonomikalkylen. Där avgör vi därför om en säker
 * källrad finns, utan att kräva känt pris (en prislös timrad måste fortfarande
 * kunna nå fakturagranskningen för att användaren ska kunna sätta pris).
 */
export function hasInvoiceableProjectSources(input: {
  path: ProjectInvoicePath
  contractValue: number
  linkedInvoiceCount: number
  uninvoicedTimeEntryCount: number
  uninvoicedMaterialCount: number
}): boolean {
  if (input.path === 'contract') {
    return input.contractValue > 0 && input.linkedInvoiceCount === 0
  }
  return input.uninvoicedTimeEntryCount > 0 || input.uninvoicedMaterialCount > 0
}
