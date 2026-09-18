import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Resends leveranshändelser: signaturkontroll och kroppstolkning.
 *
 * Bodde till 2026-09-18 i app/api/email/events/route.ts. Next.js 14 tillåter
 * bara ett fixt antal exporter ur en route-fil (`GET`/`POST`/`dynamic`/…), och
 * de exporterade hjälparna fällde `npx tsc --noEmit` via `.next/types`.
 * Funktionerna är rena och testbara utan HTTP — de hör hemma i lib.
 *
 * Signaturen verifieras enligt Svix (som Resend använder) utan nytt beroende:
 * `svix-id.svix-timestamp.<rå kropp>` HMAC-SHA256:as med hemligheten ur
 * RESEND_WEBHOOK_SECRET (base64 efter `whsec_`-prefixet) och jämförs i
 * konstant tid mot varje `v1,<sig>` i `svix-signature`.
 */

/** Händelser vi agerar på. Allt annat kvitteras med 200 och ignoreras. */
export const HANTERADE_HANDELSER = [
  'email.delivered',
  'email.bounced',
  'email.complained',
  'email.delivery_delayed',
] as const
export type EpostHandelse = (typeof HANTERADE_HANDELSER)[number]

/** Leveransstatus vi skriver i databasen per händelse. */
export const LEVERANSSTATUS: Record<EpostHandelse, 'delivered' | 'bounced' | 'complained' | 'delayed'> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.delivery_delayed': 'delayed',
}

/** Toleransfönster i sekunder. En replay av en gammal signerad kropp avvisas. */
export const SVIX_TOLERANS_SEKUNDER = 5 * 60

export type SvixVerdikt =
  | { ok: true }
  | { ok: false; skal: 'hemlighet_saknas' | 'headers_saknas' | 'for_gammal' | 'fel_signatur' }

/**
 * Konstant tid: jämför bytes av samma längd, aldrig strängar med ===.
 */
function likaSignaturer(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export function verifieraSvixSignatur(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  hemlighet: string | undefined,
  nuSekunder: number = Math.floor(Date.now() / 1000),
): SvixVerdikt {
  if (!hemlighet) return { ok: false, skal: 'hemlighet_saknas' }
  if (!headers.id || !headers.timestamp || !headers.signature) return { ok: false, skal: 'headers_saknas' }

  const ts = Number(headers.timestamp)
  if (!Number.isFinite(ts) || Math.abs(nuSekunder - ts) > SVIX_TOLERANS_SEKUNDER) {
    return { ok: false, skal: 'for_gammal' }
  }

  const nyckel = Buffer.from(hemlighet.startsWith('whsec_') ? hemlighet.slice(6) : hemlighet, 'base64')
  const forvantad = createHmac('sha256', nyckel)
    .update(`${headers.id}.${headers.timestamp}.${rawBody}`)
    .digest('base64')

  // Headern kan bära flera signaturer (nyckelrotation), mellanslagsseparerade.
  for (const del of headers.signature.split(' ')) {
    const [version, sig] = del.split(',')
    if (version !== 'v1' || !sig) continue
    if (likaSignaturer(sig, forvantad)) return { ok: true }
  }
  return { ok: false, skal: 'fel_signatur' }
}

export interface EpostHandelseData {
  typ: EpostHandelse | null
  emailId: string | null
  tidpunkt: string | null
  mottagare: string | null
}

/** Ren funktion: Resends JSON-kropp → de fyra fakta vi använder. */
export function tolkaEpostHandelse(rawBody: string): EpostHandelseData {
  let kropp: any = null
  try { kropp = JSON.parse(rawBody) } catch { return { typ: null, emailId: null, tidpunkt: null, mottagare: null } }
  if (!kropp || typeof kropp !== 'object') return { typ: null, emailId: null, tidpunkt: null, mottagare: null }

  const typ = HANTERADE_HANDELSER.includes(kropp.type) ? (kropp.type as EpostHandelse) : null
  const data = kropp.data && typeof kropp.data === 'object' ? kropp.data : {}
  const emailId: string | null = typeof data.email_id === 'string' && data.email_id
    ? data.email_id
    : typeof data.id === 'string' && data.id ? data.id : null

  const råTid = typeof kropp.created_at === 'string' ? kropp.created_at
    : typeof data.created_at === 'string' ? data.created_at : ''
  const parsad = råTid ? new Date(råTid) : null
  const tidpunkt = parsad && Number.isFinite(parsad.getTime()) ? parsad.toISOString() : null

  const till = Array.isArray(data.to) ? data.to[0] : typeof data.to === 'string' ? data.to : null
  const mottagare = typeof till === 'string' && till.trim() ? till.trim().toLowerCase() : null

  return { typ, emailId, tidpunkt, mottagare }
}
