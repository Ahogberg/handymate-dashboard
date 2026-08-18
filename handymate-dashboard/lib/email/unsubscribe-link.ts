import crypto from 'crypto'

/**
 * lib/email/unsubscribe-link.ts — v151 (e-post-opt-out, marknadsföringslagen-
 * gap). Signerad avregistreringslänk för proaktiv marknadsföringsmail
 * (nurture-sekvenser, lib/nurture.ts) — samma tokendesign som
 * lib/referral/link.ts (Epic C spel 1), tredje/fjärde återanvändningen av
 * mönstret efter lib/partners/approve-token.ts och lib/agent/external-
 * confirm.ts.
 *
 * ═══ TOKENDESIGN ═══
 * Token = base64url(JSON{businessId, customerId, type}) + '.' +
 * HMAC-SHA256(samma sträng). Ingen ny tabell, ingen DB-lookup för att
 * verifiera — customer.customer_id + business_id räcker för att sätta
 * email_opt_out på rätt tenant-scopade rad.
 *
 * Signeringsnyckel: CRON_SECRET, samma återanvända allmänna HMAC-nyckel som
 * lib/referral/link.ts. SUPABASE_SERVICE_ROLE_KEY är fallback om CRON_SECRET
 * saknas i miljön (server-only, exponeras aldrig till klient — HMAC:en
 * läcker aldrig nyckeln, bara en signatur beräknad från den).
 *
 * Fail-closed: saknas secret, är token manipulerad, trasig base64 eller
 * saknar förväntade fält ⇒ verifyUnsubscribeToken returnerar { ok: false }.
 * Kastar ALDRIG — den publika unsubscribe-routen litar på det för att kunna
 * visa ett vänligt svenskt felmeddelande i stället för att krascha eller
 * (värre) läcka data om en gissad/manipulerad token.
 *
 * Länken har medvetet INGEN utgångstid — en avregistreringslänk i ett mail
 * som ligger kvar i en inkorg i flera år måste fortfarande fungera den dag
 * mottagaren till slut klickar på den.
 */

export interface UnsubscribeTokenPayload {
  businessId: string
  customerId: string
}

export type VerifyUnsubscribeResult =
  | { ok: true; businessId: string; customerId: string }
  | { ok: false }

interface RawTokenPayload extends UnsubscribeTokenPayload {
  type: 'email_unsubscribe'
}

function signingSecret(): string {
  return process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function sign(encoded: string): string {
  return crypto.createHmac('sha256', signingSecret()).update(encoded).digest('base64url')
}

/** Skapa en signerad avregistreringstoken som bär business_id + customer_id. */
export function createUnsubscribeToken(params: UnsubscribeTokenPayload): string {
  const payload: RawTokenPayload = {
    businessId: params.businessId,
    customerId: params.customerId,
    type: 'email_unsubscribe',
  }
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${encoded}.${sign(encoded)}`
}

/** Bygg den fullständiga publika avregistreringslänken för ett mail. */
export function buildUnsubscribeUrl(params: UnsubscribeTokenPayload): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  return `${appUrl}/api/email/unsubscribe?token=${createUnsubscribeToken(params)}`
}

/**
 * Verifiera + avkoda en token. Ogiltig/manipulerad/trasig/saknad secret ⇒
 * { ok: false } — ALDRIG throw. Konstant-tids-jämförelse (timingSafeEqual)
 * mot signaturen så svarstiden inte läcker information om hur "nära" en
 * gissad token är den riktiga.
 */
export function verifyUnsubscribeToken(token: string | null | undefined): VerifyUnsubscribeResult {
  if (!token || !signingSecret()) return { ok: false }
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false }
  const [encoded, sig] = parts
  if (!encoded || !sig) return { ok: false }

  let expectedSig: string
  try {
    expectedSig = sign(encoded)
  } catch {
    return { ok: false }
  }
  if (sig.length !== expectedSig.length) return { ok: false }
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return { ok: false }
  } catch {
    return { ok: false }
  }

  let payload: RawTokenPayload
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    return { ok: false }
  }

  if (
    !payload ||
    payload.type !== 'email_unsubscribe' ||
    typeof payload.businessId !== 'string' || !payload.businessId ||
    typeof payload.customerId !== 'string' || !payload.customerId
  ) {
    return { ok: false }
  }

  return { ok: true, businessId: payload.businessId, customerId: payload.customerId }
}
