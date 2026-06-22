import crypto from 'crypto'

/**
 * Capability-token för partner-godkännande via e-postlänk.
 *
 * GET /api/admin/partners/[id]/approve var tidigare helt oautentiserad — vem
 * som helst som gissade ett partner-id kunde aktivera partnern + trigga
 * provisionsutbetalning. Vi signerar nu partner-id med CRON_SECRET (HMAC).
 * Token:en är inte gissningsbar, kräver ingen DB-kolumn, och är inte CSRF:bar
 * (capability i URL:en, ingen cookie inblandad). Endast admin-mejlet har länken.
 */
function signingSecret(): string {
  return process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function signApproveToken(partnerId: string): string {
  return crypto
    .createHmac('sha256', signingSecret())
    .update(`partner-approve:${partnerId}`)
    .digest('hex')
    .slice(0, 32)
}

export function verifyApproveToken(partnerId: string, token: string | null | undefined): boolean {
  // Fail closed om secret saknas — då kan ingen länk valideras (säkrare än att
  // signera med tom nyckel som en angripare kan reproducera).
  if (!token || !signingSecret()) return false
  const expected = signApproveToken(partnerId)
  if (token.length !== expected.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    return false
  }
}
