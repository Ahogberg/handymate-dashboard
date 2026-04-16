import { createHmac } from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * Verifierar att en inkommande webhook faktiskt kommer från 46elks.
 *
 * 46elks signerar varje POST med HMAC-SHA256 i X-46elks-Signature header.
 * Secret = ditt API-password (ELKS_API_PASSWORD).
 *
 * Docs: https://46elks.com/kb/authenticate-webhooks
 *
 * @param request - Next.js request (måste vara obearbetad, inte json-parsad)
 * @param rawBody - Rå body som sträng (viktigt: inte parsad!)
 * @returns true om signaturen är giltig
 */
export function verifyElksSignature(request: NextRequest, rawBody: string): boolean {
  const secret = process.env.ELKS_API_PASSWORD
  if (!secret) {
    console.error('[elks-signature] ELKS_API_PASSWORD saknas — kan inte validera webhook')
    return false
  }

  const signature = request.headers.get('x-46elks-signature')
  if (!signature) {
    console.error('[elks-signature] Ingen X-46elks-Signature header i webhook')
    return false
  }

  // 46elks signature-format: hmac-sha256 av request-URL + raw body
  const url = request.url
  const payload = url + rawBody

  const expected = createHmac('sha256', secret).update(payload).digest('hex')

  // Constant-time jämförelse för att förhindra timing attacks
  if (signature.length !== expected.length) return false

  let match = 0
  for (let i = 0; i < signature.length; i++) {
    match |= signature.charCodeAt(i) ^ expected.charCodeAt(i)
  }

  return match === 0
}

/**
 * Läser raw body från en NextRequest utan att parsa den.
 * Behövs för signatur-validering.
 */
export async function readRawBody(request: NextRequest): Promise<string> {
  const cloned = request.clone()
  return await cloned.text()
}
