import { createHmac, timingSafeEqual } from 'crypto'
import { isAllowlistedKey, type AutonomyKey } from './earned-autonomy'
const secret = () => process.env.AUTONOMY_OFF_SECRET
export function autonomyOffToken(
  businessId: string,
  key: AutonomyKey,
  now = Date.now(),
): string | null {
  const s = secret()
  if (!s) return null
  const body = Buffer.from(
    JSON.stringify({
      businessId,
      key,
      expires: now + 7 * 86400000,
      purpose: 'autonomy-off',
    }),
  ).toString('base64url')
  return body + '.' + createHmac('sha256', s).update(body).digest('base64url')
}
export function verifyAutonomyOffToken(
  token: unknown,
  now = Date.now(),
): { businessId: string; key: AutonomyKey } | null {
  const s = secret()
  if (!s || typeof token !== 'string' || token.length > 2048) return null
  try {
    const [body, sig, ...extra] = token.split('.')
    if (extra.length || !body || !sig) return null
    const expected = createHmac('sha256', s).update(body).digest()
    const actual = Buffer.from(sig, 'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null
    const p = JSON.parse(Buffer.from(body, 'base64url').toString())
    return p.purpose === 'autonomy-off' &&
      typeof p.businessId === 'string' &&
      p.businessId.length > 0 &&
      isAllowlistedKey(p.key) &&
      Number.isFinite(p.expires) &&
      p.expires > now
      ? { businessId: p.businessId, key: p.key }
      : null
  } catch {
    return null
  }
}
