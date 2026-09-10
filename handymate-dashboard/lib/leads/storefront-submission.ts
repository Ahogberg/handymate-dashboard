import { preparePortalSubmission, readPortalSubmission, clearPortalSubmission, type PortalSubmission } from './portal-submission'

// Slash cannot be a portal code; keep website receipts isolated per business.
const scope = (businessId: string) => `storefront/${businessId}`
export const readStorefrontSubmission = (storage: Storage, businessId: string) => readPortalSubmission(storage, scope(businessId))
export const prepareStorefrontSubmission = (storage: Storage, businessId: string, body: Record<string, unknown>, newKey: () => string) =>
  preparePortalSubmission(storage, scope(businessId), body, newKey)
export const clearStorefrontSubmission = (storage: Storage, businessId: string) => clearPortalSubmission(storage, scope(businessId))
export type StorefrontSubmission = PortalSubmission

export async function sendStorefrontSubmission(pending: StorefrontSubmission, send: typeof fetch) {
  // A cached page must not blindly retry against a rolled-back legacy writer.
  const capability = await send('/api/storefront/contact', { method: 'OPTIONS', cache: 'no-store' })
  if (!capability.ok || (await capability.json()).contract !== 'storefront-intake-v1') {
    throw new Error('Mottagningen kan inte bekräfta säkra återförsök. Försök senare.')
  }
  const response = await send('/api/storefront/contact', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.key },
    body: JSON.stringify(pending.body),
  })
  const result = await response.json()
  const completed = response.ok && result.success === true && result.state === 'completed'
    && typeof result.receipt_id === 'string' && typeof result.lead_id === 'string' && typeof result.deal_id === 'string'
  return { completed, result, status: response.status }
}
