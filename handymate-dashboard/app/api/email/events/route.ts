import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { LEVERANSSTATUS, tolkaEpostHandelse, verifieraSvixSignatur } from '@/lib/email/svix'

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
 * Signaturkontrollen och kroppstolkningen bor i lib/email/svix.ts: en
 * route-fil i Next.js 14 får bara exportera sina HTTP-metoder och
 * segmentinställningar, allt annat fäller typkontrollen i `.next/types`.
 */

export const dynamic = 'force-dynamic'

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
