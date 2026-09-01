import crypto from 'crypto'

/**
 * Capability-tokens för partneråtgärder via e-postlänk.
 *
 * GET /api/admin/partners/[id]/approve var tidigare helt oautentiserad — vem
 * som helst som gissade ett partner-id kunde aktivera partnern + trigga
 * provisionsutbetalning. Vi signerar nu partner-id med CRON_SECRET (HMAC).
 * Token:en är inte gissningsbar, kräver ingen DB-kolumn, och är inte CSRF:bar
 * (capability i URL:en, ingen cookie inblandad). Endast admin-mejlet har länken.
 *
 * Samma mönster återanvänds (2026-09-01) för avtalsacceptans-länken som
 * mejlas till partners som inte kan logga in än (väntar på godkännande):
 * eget purpose-prefix så en approve-token aldrig kan användas som
 * agreement-token eller tvärtom.
 */
function signingSecret(): string {
  return process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

type Purpose = 'partner-approve' | 'partner-agreement'

function sign(purpose: Purpose, partnerId: string): string {
  return crypto
    .createHmac('sha256', signingSecret())
    .update(`${purpose}:${partnerId}`)
    .digest('hex')
    .slice(0, 32)
}

function verify(purpose: Purpose, partnerId: string, token: string | null | undefined): boolean {
  // Fail closed om secret saknas — då kan ingen länk valideras (säkrare än att
  // signera med tom nyckel som en angripare kan reproducera).
  if (!token || !signingSecret()) return false
  const expected = sign(purpose, partnerId)
  if (token.length !== expected.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    return false
  }
}

export function signApproveToken(partnerId: string): string {
  return sign('partner-approve', partnerId)
}

export function verifyApproveToken(partnerId: string, token: string | null | undefined): boolean {
  return verify('partner-approve', partnerId, token)
}

export function signAgreementToken(partnerId: string): string {
  return sign('partner-agreement', partnerId)
}

export function verifyAgreementToken(partnerId: string, token: string | null | undefined): boolean {
  return verify('partner-agreement', partnerId, token)
}
