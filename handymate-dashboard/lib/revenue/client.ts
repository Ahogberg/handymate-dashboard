'use client'
/** Keep a failed command's key across refresh/retry, including unknown network outcomes. */
export async function sendRevenue(
  type: string,
  input: Record<string, unknown> = {},
) {
  const fingerprint = JSON.stringify({ type, ...input })
  const hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(fingerprint),
      ),
    ),
  )
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
  const key = `hm-revenue-pending:${hash}`
  let requestId = sessionStorage.getItem(key)
  if (!requestId) {
    requestId = crypto.randomUUID()
    sessionStorage.setItem(key, requestId)
  }
  const response = await fetch('/api/admin/revenue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...input, request_id: requestId }),
  })
  const body = await response.json()
  if (!response.ok) {
    // Deterministic validation/conflict responses made no mutation; allow a fresh attempt.
    if ([400, 403, 404, 409].includes(response.status))
      sessionStorage.removeItem(key)
    throw new Error(body.error || 'Kunde inte spara. Försök igen.')
  }
  sessionStorage.removeItem(key)
  return body
}
