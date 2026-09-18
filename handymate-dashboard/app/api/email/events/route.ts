import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { getServerSupabase } from '@/lib/supabase'

/**
 * Resends leveranshändelser (Svix-webhook).
 *
 * "Skickat" har hittills betytt att Resend svarade 200 på vårt anrop. En
 * studsad adress, en spamanmälan och ett mejl som lästes av kunden såg
 * identiska ut i Handymate. Hantverkaren skickade påminnelse två på en adress
 * som aldrig kunde ta emot påminnelse ett.
 *
 * Rutten tar emot `email.delivered`, `email.bounced`, `email.complained` och
 * `email.delivery_delayed` och skriver leveransfaktumet på den rad som bär
 * Resend-id:t (`communication_log.provider_message_id`, v261) plus H3b-löftet
 * när flaggan är på. Sändningsstatusen rörs aldrig — leverans är ett eget
 * faktum.
 *
 * En studs eller spamanmälan på en KUNDADRESS skriver ett `customer_fact`
 * (fact_type `contact`, källa `email_bounce`, `confirmed_at: null` — ingen
 * människa har bekräftat något). Den skickar ALDRIG ett nytt mejl: att svara
 * på en studs med ännu ett utskick är precis hur en avsändardomän bränns.
 *
 * Signaturen verifieras enligt Svix (som Resend använder) utan nytt beroende:
 * `svix-id.svix-timestamp.<rå kropp>` HMAC-SHA256:as med hemligheten ur
 * RESEND_WEBHOOK_SECRET (base64 efter `whsec_`-prefixet) och jämförs i
 * konstant tid mot varje `v1,<sig>` i `svix-signature`.
 */

export const dynamic = 'force-dynamic'

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

export async function POST(request: NextRequest) {
  // Rå kropp FÖRE all parsning — signaturen är över exakt dessa bytes.
  const rawBody = await request.text()

  const verdikt = verifieraSvixSignatur(rawBody, {
    id: request.headers.get('svix-id'),
    timestamp: request.headers.get('svix-timestamp'),
    signature: request.headers.get('svix-signature'),
  }, process.env.RESEND_WEBHOOK_SECRET)

  if (!verdikt.ok) {
    console.error('[email/events] avvisade anrop', { skal: verdikt.skal })
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const handelse = tolkaEpostHandelse(rawBody)
    if (!handelse.typ || !handelse.emailId) return new NextResponse('OK')

    const supabase = getServerSupabase()
    const status = LEVERANSSTATUS[handelse.typ]
    const nar = handelse.tidpunkt || new Date().toISOString()

    const { data: rader, error: uppdateringsfel } = await supabase
      .from('communication_log')
      .update({ delivery_status: status, delivered_at: nar })
      .eq('provider_message_id', handelse.emailId)
      .select('id, business_id, customer_id, message')

    if (uppdateringsfel) {
      console.error('[email/events] communication_log kunde inte uppdateras:', uppdateringsfel.message)
      return new NextResponse('OK')
    }
    if (!rader || rader.length === 0) {
      console.warn('[email/events] okänt email_id, ingen loggrad matchade', { email_id: handelse.emailId })
    }

    // H3b-löftet: bara leveransfaktumet, aldrig status-maskinen.
    if (status === 'delivered' || status === 'bounced') {
      await speglaTillOutboundIntent(supabase, handelse.emailId, status === 'delivered' ? 'delivered' : 'failed', nar)
    }

    // Studs eller spamanmälan på en kundadress: skriv ned det, skicka aldrig igen.
    if (status === 'bounced' || status === 'complained') {
      const rad = rader?.[0]
      if (rad?.business_id && rad.customer_id) {
        await skrivKontaktfakta(supabase, {
          businessId: rad.business_id,
          customerId: rad.customer_id,
          adress: handelse.mottagare || rad.message || '',
          status,
          emailId: handelse.emailId,
        })
      }
    }

    return new NextResponse('OK')
  } catch (fel) {
    console.error('[email/events] oväntat fel (svarar OK för att undvika retry-storm):', fel)
    return new NextResponse('OK')
  }
}

async function speglaTillOutboundIntent(
  supabase: ReturnType<typeof getServerSupabase>,
  providerRef: string,
  utfall: 'delivered' | 'failed',
  nar: string,
): Promise<void> {
  if (process.env.OUTBOUND_INTENTS_ENABLED !== 'true') return
  try {
    const { data: intent } = await supabase
      .from('outbound_intents')
      .select('business_id')
      .eq('provider_ref', providerRef)
      .maybeSingle()
    if (!intent?.business_id) return
    const { error } = await supabase.rpc('mark_outbound_delivered', {
      p_business_id: intent.business_id, p_provider_ref: providerRef, p_status: utfall, p_at: nar,
    })
    if (error) console.error('[email/events] mark_outbound_delivered misslyckades:', error.message)
  } catch (fel) {
    console.error('[email/events] outbound_intents-spegling kastade:', fel)
  }
}

/** Kundminnet får veta att adressen inte fungerar. Ingen människa har bekräftat det ⇒ confirmed_at: null. */
async function skrivKontaktfakta(
  supabase: ReturnType<typeof getServerSupabase>,
  args: { businessId: string; customerId: string; adress: string; status: 'bounced' | 'complained'; emailId: string },
): Promise<void> {
  const innehall = args.status === 'bounced'
    ? `E-postadressen ${args.adress} studsade — mejl kommer inte fram dit.`
    : `Kunden anmälde ett mejl till ${args.adress} som skräppost — mejla inte dit igen.`
  try {
    const { error } = await supabase.from('customer_fact').insert({
      id: `fact_mail_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      business_id: args.businessId,
      customer_id: args.customerId,
      fact_type: 'contact',
      content: innehall,
      source_type: 'email_bounce',
      source_id: args.emailId,
      evidence_quote: `Resend: ${args.status}`,
      confidence: 1,
      confirmed_at: null,
    })
    if (error) console.error('[email/events] customer_fact kunde inte sparas:', error.message)
  } catch (fel) {
    console.error('[email/events] customer_fact kastade:', fel)
  }
}
