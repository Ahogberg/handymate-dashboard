export interface PortalSubmission { key: string; body: Record<string, unknown> }
const storageKey = (code: string) => `handymate:portal-submission:${code}`

export function readPortalSubmission(storage: Storage, code: string): PortalSubmission | null {
  const raw = storage.getItem(storageKey(code))
  if (!raw) return null
  const saved = JSON.parse(raw)
  if (!saved || typeof saved.key !== 'string' || !saved.body || typeof saved.body !== 'object') {
    throw new Error('Det tidigare inskicket kunde inte läsas. Kontakta företaget innan du skickar igen.')
  }
  return saved
}

export function preparePortalSubmission(storage: Storage, code: string, body: Record<string, unknown>, newKey: () => string): PortalSubmission {
  const saved = readPortalSubmission(storage, code)
  if (saved) return saved
  const pending = { key: newKey(), body }
  // Storage failure must happen BEFORE the request, never after an untracked send.
  storage.setItem(storageKey(code), JSON.stringify(pending))
  return pending
}

export function clearPortalSubmission(storage: Storage, code: string) {
  storage.removeItem(storageKey(code))
}

export async function sendPortalSubmission(code: string, pending: PortalSubmission, send: typeof fetch) {
  const response = await send(`/api/lead-portal/${encodeURIComponent(code)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.key },
    body: JSON.stringify(pending.body),
  })
  const result = await response.json()
  const completed = response.ok && result.success === true && result.state === 'completed' && typeof result.lead_id === 'string'
  return { completed, status: response.status, result }
}
