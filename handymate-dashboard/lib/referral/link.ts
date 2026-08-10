import crypto from 'crypto'

/**
 * lib/referral/link.ts — Epic C spel 1 (tasks/hanna-sales-engine-v2-spec.md,
 * tasks/lead-intake-granskning-2026-08-10.md). En NÖJD KUNDS personliga
 * rekommendationslänk (/rekommendera/[token]) — inte att förväxla med det
 * BEFINTLIGA business-till-business-referralprogrammet i lib/referral/codes.ts
 * och lib/referral/discounts.ts (hantverkare som rekommenderar Handymate till
 * en kollega, business_config.referral_code, tabellen `referrals`). Den här
 * filen bär i stället en HANTVERKARENS EGEN KUND som rekommenderar
 * hantverkaren vidare till en vän — helt annan riktning, helt annan mottagare.
 *
 * ═══ TOKENDESIGN ═══
 * Token = base64url(JSON{businessId, customerId, type}) + '.' +
 * HMAC-SHA256(samma sträng). Ingen ny tabell, ingen DB-lookup för att
 * verifiera — customer.customer_id + business_id räcker för att attribuera
 * (sql/v107_referral_attribution.sql: leads/deal.referral_customer_id).
 *
 * Signeringsnyckel: CRON_SECRET är REDAN återanvänt som allmän HMAC-nyckel
 * på två andra ställen i kodbasen (lib/partners/approve-token.ts,
 * lib/agent/external-confirm.ts) — samma mönster återanvänds här som tredje
 * instans i stället för att uppfinna ett nytt signeringskoncept.
 * SUPABASE_SERVICE_ROLE_KEY är fallback om CRON_SECRET saknas i miljön
 * (server-only, exponeras aldrig till klient — HMAC:en läcker aldrig
 * nyckeln, bara en signatur beräknad från den).
 *
 * Fail-closed: saknas secret, är token manipulerad, trasig base64 eller
 * saknar förväntade fält ⇒ verifyReferralToken returnerar null. Kastar ALDRIG
 * — den publika landningssidan och submit-endpointen litar på det för att
 * kunna visa en vänlig felsida i stället för att krascha.
 *
 * Länken har medvetet INGEN utgångstid (till skillnad från
 * external-confirm.ts 15-minuters-token) — en rekommendationslänk ska kunna
 * delas och återanvändas av kunden under lång tid, inte bara en gång.
 */

export interface ReferralTokenPayload {
  businessId: string
  customerId: string
}

interface RawTokenPayload extends ReferralTokenPayload {
  type: 'referral_link'
}

function signingSecret(): string {
  return process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function sign(encoded: string): string {
  return crypto.createHmac('sha256', signingSecret()).update(encoded).digest('base64url')
}

/** Skapa en signerad token som bär business_id + customer_id. */
export function createReferralToken(businessId: string, customerId: string): string {
  const payload: RawTokenPayload = { businessId, customerId, type: 'referral_link' }
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${encoded}.${sign(encoded)}`
}

/** Bygg den fullständiga publika länken kunden kan dela vidare. */
export function buildReferralUrl(businessId: string, customerId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  return `${appUrl}/rekommendera/${createReferralToken(businessId, customerId)}`
}

/**
 * Verifiera + avkoda en token. Ogiltig/manipulerad/trasig/saknad secret ⇒
 * null — ALDRIG throw. Konstant-tids-jämförelse (timingSafeEqual) mot
 * signaturen så svarstiden inte läcker information om hur "nära" en gissad
 * token är den riktiga.
 */
export function verifyReferralToken(token: string | null | undefined): ReferralTokenPayload | null {
  if (!token || !signingSecret()) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [encoded, sig] = parts
  if (!encoded || !sig) return null

  let expectedSig: string
  try {
    expectedSig = sign(encoded)
  } catch {
    return null
  }
  if (sig.length !== expectedSig.length) return null
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null
  } catch {
    return null
  }

  let payload: RawTokenPayload
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (
    !payload ||
    payload.type !== 'referral_link' ||
    typeof payload.businessId !== 'string' || !payload.businessId ||
    typeof payload.customerId !== 'string' || !payload.customerId
  ) {
    return null
  }

  return { businessId: payload.businessId, customerId: payload.customerId }
}
