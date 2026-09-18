/**
 * SMS-svaret blir ett jobb — ETT kort, aldrig fem (spår 1, 2026-09-18).
 *
 * ═══ VARFÖR ═══
 *
 * Fångst-SMS:et lovar kunden: "Svara på detta SMS med vad du behöver hjälp
 * med, så återkommer vi direkt". Svaret kom fram och sparades i
 * sms_conversation — och där tog det slut. Ingen kund skapades, inget kort
 * lades i kön, och hantverkaren fick ringa upp och fråga om igen. Löftet
 * hölls till hälften.
 *
 * Den här modulen stänger den halvan: svaret blir en kund (golden path),
 * kundens egna ord blir customer_fact med ordagrant citat, och allt landar
 * i ETT lead_review-kort med direktväg till offert.
 *
 * ═══ ETT MODELLANROP ═══
 *
 * Klassningen görs INTE av ett eget AI-anrop. Matte kör redan runIntentAgent
 * på varje inkommande SMS (lib/matte/intent-agent.ts) — dess `intent` och
 * `confidence` är klassningen. Den enda extra modellkostnaden är
 * faktaextraktionen, och den körs bara när texten är begriplig, kunden är
 * känd och texten når MIN_TEXT_LANGD.
 *
 * ═══ INGET ANDRA SMS ═══
 *
 * createLeadAndDeal anropas med notify:false. Flaggan finns sedan tidigare
 * och är dokumenterad för exakt det här fallet: notify:true fyrar
 * lead_received, och den seedade regeln "Snabbsvar på ny lead"
 * (lib/seed-defaults.ts) skickar då ett "Tack för din förfrågan"-SMS ovanpå
 * fångst-SMS:et kunden just svarade på. Kortet är notisen i stället.
 *
 * ═══ GISSAR ALDRIG ETT JOBB ═══
 *
 * Är svaret obegripligt (intent unclear/fuel_stopped, eller låg konfidens)
 * skapas kortet ändå — men det SÄGER att vi inte förstod, bär ingen
 * jobbtyp, ingen offertväg, och inga kundfakta sparas. Förfrågan går aldrig
 * förlorad, men vi hittar inte på vad den handlade om.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MatteDecision, IncomingSignal } from '@/lib/matte/intent-agent'
import type { ResolvedEntity } from '@/lib/matte/resolver'
import { createLeadAndDeal } from '@/lib/leads/golden-path'
import { extractCustomerFacts, MIN_TEXT_LANGD, EMAIL_FAKTA_MODELL } from '@/lib/customer-facts/extract-from-text'
import type { MissatSamtalKoppling } from '@/lib/sms/relatera-missat-samtal'

/**
 * Intent-värden som betyder "vi förstod inte". `unclear` är intent-agentens
 * egen etikett; `fuel_stopped` betyder att AI:n aldrig ens tolkade texten
 * (bränslet slut) — då finns ingen klassning alls att lita på.
 */
export const OBEGRIPLIGA_INTENT = new Set(['unclear', 'fuel_stopped'])

/**
 * Under den här konfidensen behandlas svaret som obegripligt även om
 * intent-agenten satte en etikett. Samma nivå som resten av huset använder
 * för "säker nog att agera på" — under hälften är en gissning.
 */
export const MIN_KONFIDENS = 50

/**
 * Action-typer som lead_review-kortet ERSÄTTER. Skapades kortet hoppar
 * Matte-exekveraren över dessa i sin actions-loop, annars får hantverkaren
 * två kort för samma SMS. Samma princip som ataHandled-flaggan i
 * lib/matte/action-executor.ts.
 *
 * `create_lead` är med av ett andra, tyngre skäl: den är AUTONOM i Matte och
 * anropar createLeadAndDeal med notify:true — alltså precis det andra
 * "tack för din förfrågan"-SMS vi är här för att förhindra.
 */
export const KORT_ERSATTER_ACTIONS = [
  'create_lead',
  'lead_review',
  'new_contact',
  'quote_request',
  'create_quote_draft',
] as const

export interface SvarBlirJobbResultat {
  /** Kortets id, eller null om inget kort skapades (dedup eller fel). */
  kortId: string | null
  leadId: string | null
  customerId: string | null
  /** Antal customer_fact-rader som skrevs. */
  faktaSparade: number
  begripligt: boolean
  /** Action-typer Matte-exekveraren ska hoppa över. Tom när inget kort blev till. */
  hanteradeTyper: string[]
}

const INGET: SvarBlirJobbResultat = {
  kortId: null, leadId: null, customerId: null,
  faktaSparade: 0, begripligt: false, hanteradeTyper: [],
}

/**
 * Förstod vi vad kunden vill? Ren funktion — hela grinden är kod, inte
 * prompttillit.
 */
export function arBegripligt(decision: Pick<MatteDecision, 'intent' | 'confidence'>): boolean {
  if (!decision) return false
  if (OBEGRIPLIGA_INTENT.has(decision.intent)) return false
  if (typeof decision.confidence !== 'number' || !Number.isFinite(decision.confidence)) return false
  return decision.confidence >= MIN_KONFIDENS
}

/**
 * Kundvänd rubrik för intenten. Returnerar null när vi inte förstod — och
 * DÅ sätts ingen jobbtyp någonstans, vilket är hela poängen.
 */
export function jobbtypFranIntent(intent: string): string | null {
  const karta: Record<string, string> = {
    quote_request: 'Offertförfrågan',
    quote_addition: 'Tilläggsarbete',
    new_booking_request: 'Bokningsförfrågan',
    reschedule_request: 'Ombokning',
    material_change: 'Materialändring',
    invoice_question: 'Fakturafråga',
    payment_confirmation: 'Betalningsbesked',
    complaint: 'Reklamation',
    cancellation: 'Avbokning',
    new_contact: 'Ny kontakt',
    general_question: 'Allmän fråga',
    confirmation: 'Bekräftelse',
  }
  return karta[intent] || null
}

/**
 * Kör hela vägen från tolkat SMS till ett kort. Kastar ALDRIG — ett svar som
 * inte kan bli ett kort får inte också bli ett tappat SMS.
 */
export async function svarBlirJobb(input: {
  decision: MatteDecision
  entity: ResolvedEntity
  signal: IncomingSignal
  businessId: string
  supabase: SupabaseClient
  missatSamtal: MissatSamtalKoppling
  /** sms_conversation-radens id — blir customer_fact.source_id. */
  smsConversationId?: string | number | null
}): Promise<SvarBlirJobbResultat> {
  const { decision, entity, signal, businessId, supabase, missatSamtal } = input
  try {
    const begripligt = arBegripligt(decision)
    const text = (signal.body || '').trim()
    // Utan tolkad avsändare finns ingen identitet att knyta kortet till, och
    // utan text finns inget att visa. Båda är tysta avbrott: SMS:et ligger
    // redan i tråden.
    if (!text || !entity) return INGET

    // ── 1. Lead: återanvänd en öppen, skapa annars ────────────────────
    // entity.activeDeals kommer ur leads-tabellen (resolvern), så id:t ÄR
    // ett lead_id. En pågående dialog om samma jobb ska inte bli en ny lead
    // för varje SMS.
    let leadId: string | null = entity.activeDeals[0]?.id || null
    let customerId: string | null = entity.customerId || null

    if (!leadId) {
      try {
        const gp = await createLeadAndDeal({
          businessId,
          businessPhoneNumber: null,
          name: entity.customerName || 'Okänd (SMS-svar)',
          phone: signal.from,
          email: entity.email ?? null,
          message: text,
          source: 'inbound_sms',
          // ═══ INGET ANDRA SMS ═══ se filhuvudet. notify:false hoppar över
          // både ägar-SMS:et och lead_received — och därmed den seedade
          // regeln som annars tackar kunden en andra gång.
          notify: false,
        }, supabase)
        leadId = gp.leadId
        customerId = gp.customerId
        if (gp.dealError) {
          console.warn('[sms/svar-blir-jobb] affären skapades inte:', gp.dealError)
        }
      } catch (err) {
        // Dedupvakten i golden path kastar vid tvetydiga kontaktuppgifter.
        // Då skapas inget kort — hantverkaren ser SMS:et i tråden, och vi
        // kopplar hellre ingen kund än fel kund.
        console.error('[sms/svar-blir-jobb] createLeadAndDeal misslyckades:', err)
        return INGET
      }
    }

    if (!leadId) return INGET

    // ── 2. Dedup: ETT kort per lead ───────────────────────────────────
    // Samma idiom som suggest-quote-draft.ts. Två SMS i rad om samma sak
    // ska inte bli två kort i kön.
    const { data: befintliga, error: dedupFel } = await supabase
      .from('pending_approvals')
      .select('id')
      .eq('business_id', businessId)
      .eq('approval_type', 'lead_review')
      .eq('status', 'pending')
      .contains('payload', { lead_id: leadId })
      .limit(1)

    if (dedupFel) {
      console.error('[sms/svar-blir-jobb] dedupkollen misslyckades — avstår hellre än dubblerar:', dedupFel.message)
      return { ...INGET, leadId, customerId, begripligt }
    }
    if ((befintliga || []).length > 0) {
      // Kortet finns redan. Matte ska ändå inte lägga ett eget ovanpå.
      return {
        kortId: null, leadId, customerId, faktaSparade: 0, begripligt,
        hanteradeTyper: [...KORT_ERSATTER_ACTIONS],
      }
    }

    // ── 3. Kundfakta (bara när vi förstod, och bara på en riktig kund) ─
    let fakta: Array<{ fact_type: string; content: string; evidence_quote: string; confidence: number }> = []
    if (begripligt && customerId && text.length >= MIN_TEXT_LANGD) {
      try {
        fakta = await extractCustomerFacts({
          text,
          channel: 'sms',
          businessId,
          refId: String(input.smsConversationId ?? `sms_${Date.now()}`),
          supabase,
        })
      } catch (err) {
        console.error('[sms/svar-blir-jobb] faktaextraktionen misslyckades (berikning, ej blockerande):', err)
        fakta = []
      }
    }

    let faktaSparade = 0
    if (fakta.length > 0 && customerId) {
      const rader = fakta.map((f, i) => ({
        id: `fact_sms_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
        business_id: businessId,
        customer_id: customerId,
        fact_type: f.fact_type,
        content: f.content,
        source_type: 'sms',
        source_id: input.smsConversationId != null ? String(input.smsConversationId) : null,
        evidence_quote: f.evidence_quote,
        confidence: f.confidence,
        // INTE bekräftat. Ingen människa har godkänt det här — raden är
        // fångat kundminne som väntar på granskning. Läsare som påstår
        // "godkända av hantverkaren" filtrerar på confirmed_at.
        confirmed_at: null,
      }))
      const { error: faktaFel } = await supabase.from('customer_fact').insert(rader)
      if (faktaFel) console.error('[sms/svar-blir-jobb] kundfakta kunde inte sparas:', faktaFel.message)
      else faktaSparade = rader.length
    }

    // ── 4. ETT kort ───────────────────────────────────────────────────
    const jobbtyp = begripligt ? jobbtypFranIntent(decision.intent) : null
    const kundNamn = entity.customerName || 'Okänd avsändare'
    const nyKund = entity.type === 'unknown'
    const kortId = `appr_sms_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    const rubrik = begripligt
      ? `${jobbtyp || 'Kundförfrågan'} från ${kundNamn}`
      : `Vi förstod inte svaret från ${kundNamn}`

    const beskrivning = begripligt
      ? `"${text.slice(0, 200)}"`
      : `Kunden svarade, men vi kunde inte tolka vad det gäller. Läs och ta ställning själv: "${text.slice(0, 200)}"`

    const { error: kortFel } = await supabase.from('pending_approvals').insert({
      id: kortId,
      business_id: businessId,
      approval_type: 'lead_review',
      title: rubrik,
      description: beskrivning,
      status: 'pending',
      risk_level: begripligt ? 'low' : 'medium',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      payload: {
        agent_id: 'daniel',
        lead_id: leadId,
        // Samma form som e-postintaget (app/api/email/inbound/route.ts) så
        // prepareLeadActivationReview läser kortet utan ändring.
        parsed: {
          name: entity.customerName || null,
          phone: signal.from,
          email: entity.email || null,
          job_type: jobbtyp,
          description: begripligt ? text : null,
        },
        // Kundens egna ord, ordagrant. Det är dem hantverkaren ska läsa.
        raw_sms: {
          from: signal.from,
          body: text,
          received_at: signal.receivedAt,
          related_call_id: missatSamtal.related_call_id,
          svar_pa_missat_samtal: missatSamtal.svar_pa_missat_samtal,
        },
        kund_ar_ny: nyKund,
        forstod_inte: !begripligt,
        intent: decision.intent,
        konfidens: decision.confidence,
        kundfakta: fakta.map(f => ({
          fact_type: f.fact_type, content: f.content, evidence_quote: f.evidence_quote,
        })),
        fakta_modell: fakta.length > 0 ? EMAIL_FAKTA_MODELL : null,
      },
    })

    if (kortFel) {
      console.error('[sms/svar-blir-jobb] kortet kunde inte skapas:', kortFel.message)
      return { kortId: null, leadId, customerId, faktaSparade, begripligt, hanteradeTyper: [] }
    }

    return {
      kortId, leadId, customerId, faktaSparade, begripligt,
      hanteradeTyper: [...KORT_ERSATTER_ACTIONS],
    }
  } catch (err) {
    console.error('[sms/svar-blir-jobb] oväntat fel (sväljs — SMS:et är redan sparat):', err)
    return INGET
  }
}
