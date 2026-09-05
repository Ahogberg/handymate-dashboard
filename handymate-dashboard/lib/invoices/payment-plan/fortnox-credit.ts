/** Verified against Fortnox stable v3 OpenAPI, 2026-09-05:
 * PUT /invoices/{DocumentNumber}/credit returns the ORIGINAL invoice;
 * CreditInvoiceReference identifies the credit, not DocumentNumber.
 * Re-read the original before retrying an interrupted export. */
export async function exportPlanCredit(
  request: (method: 'GET' | 'PUT', path: string) => Promise<any>, originalNumber: string,
): Promise<string> {
  const path = `/invoices/${encodeURIComponent(originalNumber)}`
  const original = await request('GET', path)
  let reference = original?.Invoice?.CreditInvoiceReference
  if (!reference || String(reference) === '0') {
    const result = await request('PUT', `${path}/credit`)
    reference = result?.Invoice?.CreditInvoiceReference
  }
  if (!reference || String(reference) === '0' || String(reference) === originalNumber) throw new Error('Fortnox returnerade ingen säker kreditreferens. Stäm av originalet innan nytt försök.')
  return String(reference)
}

/** Verify the external document before either e-invoice or PDF delivery.
 * A settings-dependent rounding or deduction difference needs reconciliation. */
export function assertPlanFortnoxAmounts(local: { total: number; rot_rut_deduction?: number }, remote: { Total: number; TaxReduction?: number }) {
  const expected = [Number(local.total), Number(local.rot_rut_deduction || 0)]
  const actual = [Number(remote?.Total), Number(remote?.TaxReduction || 0)]
  if (actual.some((amount, i) => !Number.isFinite(amount) || Math.abs(Math.round(amount * 100) - Math.round(expected[i] * 100)) > 1)) {
    throw new Error('Fortnox-belopp eller avdrag skiljer sig från betalplanen. Stäm av avrundning och avdrag före utskick.')
  }
}
