/**
 * lib/leads/golden-path.ts (2026-05-28).
 *
 * Extraherad helper för Golden Path: lead → customer → deal i pipeline +
 * SMS till hantverkaren + automation-event.
 *
 * En sanning, flera ingångar:
 * - /api/leads/intake (portal-formulär, lead_sources API-key, website-API)
 * - /api/approvals/[id] approve-handler för approval_type='lead_review'
 *   (email-forwarding-webhook godkänner pending leads)
 *
 * Vid duplikering: ändra HÄR, inte i routes. Det är hela poängen.
 *
 * Beslut 2026-05-28: helpern tar `business_id` + `business_phone_number`
 * separat istället för hela business-objektet — tunnare gränssnitt så
 * call-sites slipper bygga full business-row. SMS skickas non-blocking;
 * helpern returnerar även om SMS-throws.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getNextLeadNumber, getNextCaseNumber } from '@/lib/numbering'
import { sanitizeSenderId } from '@/lib/sms/sender-id'
import { ensureDefaultStages, getStageBySlug } from '@/lib/pipeline'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'
import { findCustomerDuplicates } from '@/lib/customer-dedupe'
import { insertApprovalArtifact } from '@/lib/approvals/artifact-write'

const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD

/**
 * Genom strypunkten (etapp 0 batch 4, 2026-08-08).
 *
 * Båda anroparna skickar till HANTVERKARENS eget nummer ("ny lead kom in"),
 * inte till en kund — därför recipient:'owner'. Avsändaren 'Handymate' är
 * medvetet kvar: det är vår notis till honom, inte hans utskick till någon.
 */
async function sendSMS(
  supabase: SupabaseClient,
  businessId: string,
  to: string,
  message: string,
  from: string,
): Promise<boolean> {
  try {
    const { sendSmsViaElks } = await import('@/lib/sms-send')
    const r = await sendSmsViaElks({
      supabase,
      businessId,
      businessName: from,
      to,
      message,
      messageType: 'new_lead_notice',
      recipient: 'internal',
      purpose: 'internal',
    })
    if (!r.success) console.error('[golden-path] SMS misslyckades:', r.error)
    return r.success
  } catch {
    return false
  }
}

export interface CreateLeadAndDealInput {
  businessId: string
  /** Hantverkar-telefon för SMS-notis. Null = ingen notis skickas. */
  businessPhoneNumber: string | null
  name: string
  phone: string
  email: string | null
  /** Fri text — landar i lead.notes och deal.title (slice 80). */
  message: string | null
  /** Lead-källa som lagras i lead.source (lowercase). Måste vara
      lovligt enligt valid_source CHECK (v56). */
  source: string
  /** FK till lead_sources-raden om källa kan mappas. */
  leadSourceId?: string | null
  /** Extern referens (URL, ID från extern CRM). */
  sourceRef?: string | null
  /** Befintlig kund vars rekommendation genererade leaden (Epic C).
      Skickas BARA när referral-flödet är avsändare — kolumnen finns först
      efter v107, och spread-mönstret nedan gör att fältet aldrig når
      PostgREST när det inte anges (annars 400 på hela inserten). */
  referralCustomerId?: string | null
  /** Initial status. Default 'new' (Golden Path). Webhook använder
      'pending_review' så helpern kan reusa lead-skapande utan att
      skapa deal — då skickas leadCreatesDeal=false. */
  initialStatus?: 'new' | 'pending_review'
  /** Om false skippas deal-skapande + SMS + fireEvent. Används av
      webhook som vill skapa lead i pending_review-state och vänta på
      manuell godkännande innan deal aktiveras. Default true. */
  createDealAndNotify?: boolean
  /** Om false skapas deal som vanligt men ägar-SMS:et och
      lead_received-eventet hoppas över. För källor som redan sköter sin
      egen kommunikation: bokningsflödet skickar bokningsbekräftelse till
      kunden och bokningsnotis till ägaren — ett extra "tack för din
      förfrågan"-SMS ovanpå (seedade snabbsvars-regeln triggar på eventet)
      vore förvirrande dubbelkommunikation. Default true. */
  notify?: boolean
}

export interface CreateLeadAndDealResult {
  leadId: string
  dealId: string | null
  customerId: string
  /** Sätts om deal-inserten misslyckades (FK/stage saknas). Null = OK eller
      deal medvetet ej skapad (createDealAndNotify=false). En tyst FK-miss får
      ALDRIG se ut som success — callers kan inspektera detta fält. */
  dealError?: string | null
}

/**
 * Golden Path: skapa kund + lead + deal i pipeline.
 *
 * Idempotenta delar: customer dedupas mot business_id + phone_number.
 * Lead + deal skapas alltid nya (caller ansvarar för dedup om relevant).
 */
export async function createLeadAndDeal(
  input: CreateLeadAndDealInput,
  supabase: SupabaseClient,
): Promise<CreateLeadAndDealResult> {
  const {
    businessId,
    businessPhoneNumber,
    name,
    phone,
    email,
    message,
    source,
    leadSourceId,
    sourceRef,
    initialStatus = 'new',
    createDealAndNotify = true,
    notify = true,
    referralCustomerId = null,
  } = input

  // Dubbelkunds-vakten (Epic A, 2026-08-10): 46elks levererar E.164
  // (+4670…) medan formulär levererar 070… — den gamla exakta eq-matchen
  // gjorde samma person till två kunder beroende på väg in, och en tom
  // telefonsträng kunde matcha en godtycklig kund utan nummer. Nu samma
  // normaliserade hierarki som kund-API:t: telefon starkast, sedan e-post.
  // Namn+adress är för svagt för automatisk sammanslagning och lämnas
  // medvetet utanför (granskningens princip: tvetydig identitet failar
  // säkert som NY kund, aldrig tyst merge).
  const cleanPhone = phone.replace(/\s/g, '')
  const leadPhone = normalizeSwedishPhone(phone) || cleanPhone

  // ── 1. Customer (dedup: normaliserad telefon → e-post) ────────
  let customerId: string
  const dubbletter = await findCustomerDuplicates(supabase, {
    business_id: businessId,
    phone: phone || null,
    email: email || null,
  })
  const match =
    dubbletter.find(d => d.match_type === 'phone') ??
    dubbletter.find(d => d.match_type === 'email')

  if (match) {
    customerId = match.customer_id
    // Icke-destruktiv komplettering: en e-postmatch kan bära ett telefon-
    // nummer kunden saknar, och tvärtom. Fyll BARA fält som är tomma på den
    // matchade kunden — befintlig data vinner alltid, ingen överskrivning.
    const fyll: Record<string, string> = {}
    if (!match.phone_number && leadPhone) fyll.phone_number = leadPhone
    if (!match.email && email) fyll.email = email
    if (Object.keys(fyll).length > 0) {
      await supabase.from('customer').update(fyll).eq('customer_id', match.customer_id)
    }
  } else {
    const newId = 'cust_' + Math.random().toString(36).substr(2, 9)
    const { data: newCustomer, error: customerInsertError } = await supabase
      .from('customer')
      .insert({
        customer_id: newId,
        business_id: businessId,
        name,
        phone_number: leadPhone || null,
        email: email || null,
      })
      .select('customer_id')
      .single()
    // Never create a lead or start downstream sync with an unpersisted customer ID.
    if (customerInsertError || !newCustomer?.customer_id) {
      throw new Error('Kunduppgifterna kunde inte sparas. Försök igen.')
    }
    customerId = newCustomer.customer_id

    // Fortnox-kundnummer vid SKAPANDET (2026-08-26, Andreas-beslut: även
    // lead-vägen, så Fortnox löpnummer följer sann skapandeordning mellan
    // leads och manuellt skapade kunder). Kortslutningen på
    // fortnox_connected (en query) håller webhook-latensen nere för alla
    // okopplade konton. Non-blocking.
    try {
      const { syncNewCustomerToFortnox } = await import('@/lib/fortnox/sync')
      await syncNewCustomerToFortnox(supabase, businessId, customerId)
    } catch { /* non-blocking */ }
  }

  // ── 2. Lead ──────────────────────────────────────────────────
  const { data: firstStage } = await supabase
    .from('pipeline_stages')
    .select('key')
    .eq('business_id', businessId)
    .order('sort_order', { ascending: true })
    .limit(1)
    .single()

  const leadId = 'lead_' + Math.random().toString(36).substr(2, 9)
  let leadNumber: string | undefined
  try { leadNumber = await getNextLeadNumber(supabase, businessId) } catch { /* non-blocking */ }

  const { error: leadInsertError } = await supabase.from('leads').insert({
    lead_id: leadId,
    business_id: businessId,
    customer_id: customerId,
    name,
    phone: cleanPhone,
    email: email || null,
    notes: message || null,
    source: source.toLowerCase(),
    status: initialStatus,
    pipeline_stage_key: firstStage?.key || 'new_lead',
    score: 0,
    ...(leadNumber ? { lead_number: leadNumber } : {}),
    ...(leadSourceId ? { lead_source_id: leadSourceId } : {}),
    ...(sourceRef ? { source_ref: sourceRef } : {}),
    ...(referralCustomerId ? { referral_customer_id: referralCustomerId } : {}),
  })

  // En lead som aldrig landade får ALDRIG se ut som success — samma princip
  // som dealError, men hårdare: utan lead-rad är allt nedströms (deal-FK,
  // uppföljning, attribution) meningslöst. Kasta så callerns catch svarar
  // ärligt i stället för att returnera ett lead_id som inte finns.
  if (leadInsertError) {
    throw new Error(`Lead-insert misslyckades: ${leadInsertError.message}`)
  }

  // ── 3. Pending → skippa deal + notifications ─────────────────
  // Webhook använder pending_review: lead skapas, deal skapas FÖRST när
  // operatör approve:ar via approval-handlern (som kallar denna helper
  // igen med createDealAndNotify=true OCH initialStatus=new).
  if (!createDealAndNotify) {
    return { leadId, dealId: null, customerId }
  }

  // ── 4. Deal i pipeline (Golden Path) ─────────────────────────
  // deal.stage_id är en NOT-NULL FK mot pipeline_stage (SINGULAR, deals-Kanban,
  // nyckelkolumn 'slug'). Tidigare hämtades stage_id från pipeline_stages
  // (PLURAL, leads-funneln) → ett plural-id är ALDRIG giltigt mot den FK:n →
  // hela inserten rullades tillbaka tyst → inga deals skapades för golden-path-
  // leads, men callern såg success. Vi hämtar nu 'new_inquiry'-stegets id från
  // rätt tabell via getStageBySlug (samma mönster som ensureDealForQuote).
  let dealId: string | null = null
  let dealError: string | null = null
  try {
    let stage = await getStageBySlug(businessId, 'new_inquiry')
    if (!stage) {
      // Avvikelse #35: 14 av 27 företag i prod saknade steg (onboardingens
      // seeder skrev en gammal form). Seeda kanoniskt och försök igen — samma
      // ensureDefaultStages som /api/pipeline. Idempotent, aldrig destruktivt
      // när deals finns.
      try { await ensureDefaultStages(businessId) } catch (e) { console.warn('[golden-path] ensureDefaultStages:', e instanceof Error ? e.message : e) }
      stage = await getStageBySlug(businessId, 'new_inquiry')
    }
    if (!stage) {
      // Stages ej seedade → inget giltigt stage_id finns. Skapa INGEN deal med
      // ogiltigt stage_id (FK skulle avvisa). Logga och signalera till callern.
      dealError = 'pipeline_stage "new_inquiry" saknas — deal ej skapad (stages ej seedade?)'
      console.warn(`[golden-path] ${dealError} (business ${businessId})`)
    } else {
      const nextNumber = await getNextCaseNumber(supabase, businessId)
      const { data: newDeal, error: insertError } = await supabase
        .from('deal')
        .insert({
          business_id: businessId,
          title: message ? message.slice(0, 80) : `Förfrågan från ${name}`,
          customer_id: customerId,
          lead_id: leadId,
          stage_id: stage.id,
          source: source.toLowerCase(),
          deal_number: nextNumber,
          priority: 'medium',
          ...(referralCustomerId ? { referral_customer_id: referralCustomerId } : {}),
        })
        .select('id')
        .maybeSingle()
      if (insertError) {
        dealError = insertError.message
        console.error('[golden-path] Deal-insert misslyckades:', insertError.message)
      }
      dealId = newDeal?.id ?? null
    }
  } catch (err) {
    dealError = err instanceof Error ? err.message : String(err)
    console.error('[golden-path] Auto-deal creation failed:', err)
    // Non-blocking — lead skapas ändå, men felet surfas via dealError.
  }

  // ── 5. SMS till hantverkaren (non-blocking) ──────────────────
  if (notify && businessPhoneNumber) {
    const smsText = `🌐 Ny lead från ${source}!\nNamn: ${name}\nTel: ${cleanPhone}${message ? `\n"${message.slice(0, 80)}"` : ''}\n→ app.handymate.se/dashboard/pipeline`
    sendSMS(supabase, businessId, businessPhoneNumber, smsText, 'Handymate').catch(() => {})
  }

  // ── 6. Automation-event ──────────────────────────────────────
  if (notify) {
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(supabase, 'lead_received', businessId, {
        source,
        lead_id: leadId,
        customer_id: customerId,
        customer_name: name,
      })
    } catch { /* non-blocking */ }
  }

  return { leadId, dealId, customerId, dealError }
}

/**
 * Aktiverar en lead som tidigare skapades i pending_review (av t.ex.
 * email-webhook). Steg:
 *   1. Byt lead.status pending_review → new
 *   2. Skapa eller återanvänd deal om det valdes i granskningen
 *   3. Förbered ett separat granskningskort för internnotisen
 *   4. Kör lead_received med krav på nya godkännanden
 *
 * Ingen customer skapas — den finns redan från webhook.
 * Returnerar dealId | null + dealError (deal-skapande är non-blocking, men
 * ett tyst fel får aldrig se ut som success — surfas via dealError).
 *
 * Alla uppslag och skrivningar är företagsskopade även om anroparen redan
 * har kontrollerat sessionen. Återkörning återanvänder deal och följdkort.
 */
export async function activatePendingLead(
  leadId: string,
  supabase: SupabaseClient,
  options: {
    businessId: string
    approvalId: string
    createDeal: boolean
    prepareInternalSms: boolean
    runAutomationRules: boolean
    reviewedInternalPhone: string | null
    reviewedInternalMessage: string | null
  },
): Promise<{ dealId: string | null; dealError: string | null; effects: Array<{ effect: string; status: 'succeeded' | 'skipped' | 'failed'; message?: string; approval_id?: string }> }> {
  const effects: Array<{ effect: string; status: 'succeeded' | 'skipped' | 'failed'; message?: string; approval_id?: string }> = []
  const { data: lead, error } = await supabase
    .from('leads')
    .select('lead_id, business_id, customer_id, name, phone, email, notes, source, status')
    .eq('lead_id', leadId)
    .eq('business_id', options.businessId)
    .maybeSingle()

  if (error || !lead) {
    throw new Error(`[activatePendingLead] Lead ${leadId} hittades inte`)
  }
  if (!['pending_review', 'new'].includes(String(lead.status))) throw new Error('Kundförfrågan väntar inte längre på aktivering')

  // Byt status till 'new' med tenant + tillståndsvakt. En återöppnad körning
  // kan återanvända en redan aktiverad rad men skapar aldrig dubbletter.
  if (lead.status === 'pending_review') {
    const { data: activated, error: activationError } = await supabase.from('leads')
      .update({ status: 'new', updated_at: new Date().toISOString() })
      .eq('lead_id', leadId).eq('business_id', options.businessId).eq('status', 'pending_review').select('lead_id')
    if (activationError || !activated?.length) throw new Error('Kundförfrågan kunde inte aktiveras i sitt aktuella tillstånd')
    effects.push({ effect: 'lead_status', status: 'succeeded', message: 'Status ändrad till ny' })
  } else effects.push({ effect: 'lead_status', status: 'skipped', message: 'Kundförfrågan var redan aktiverad' })

  const { data: existingDeal, error: existingDealError } = await supabase.from('deal').select('id')
    .eq('lead_id', leadId).eq('business_id', options.businessId).maybeSingle()
  if (existingDealError) throw new Error(`Affärskopplingen kunde inte verifieras: ${existingDealError.message}`)
  let dealId: string | null = existingDeal?.id || null
  let dealError: string | null = null
  if (!options.createDeal) effects.push({ effect: 'deal', status: 'skipped', message: 'Valdes bort i granskningen' })
  else if (dealId) effects.push({ effect: 'deal', status: 'skipped', message: `Befintlig affär ${dealId} återanvändes` })
  else {
    try {
      const stage = await getStageBySlug(options.businessId, 'new_inquiry')
      if (!stage) {
        dealError = 'pipeline_stage "new_inquiry" saknas — affär skapades inte'
      } else {
        const nextNumber = await getNextCaseNumber(supabase, options.businessId)
        const { data: newDeal, error: insertError } = await supabase.from('deal').insert({
          business_id: options.businessId,
          title: lead.notes ? lead.notes.slice(0, 80) : `Förfrågan från ${lead.name || 'kund'}`,
          customer_id: lead.customer_id, lead_id: lead.lead_id, stage_id: stage.id,
          source: (lead.source ?? 'email_forward').toLowerCase(), deal_number: nextNumber, priority: 'medium',
        }).select('id').maybeSingle()
        if (insertError || !newDeal?.id) dealError = insertError?.message || 'Affären kunde inte verifieras efter skapandet'
        else dealId = newDeal.id
      }
    } catch (err) {
      dealError = err instanceof Error ? err.message : String(err)
    }
    effects.push(dealError ? { effect: 'deal', status: 'failed', message: dealError } : { effect: 'deal', status: 'succeeded', message: `Affär ${dealId} skapades` })
  }

  if (options.prepareInternalSms && options.reviewedInternalPhone && options.reviewedInternalMessage) {
    const { data: config } = await supabase.from('business_config').select('personal_phone, phone_number')
      .eq('business_id', options.businessId).maybeSingle()
    const currentPhone = config?.personal_phone || config?.phone_number || null
    if (currentPhone !== options.reviewedInternalPhone) effects.push({ effect: 'internal_sms', status: 'failed', message: 'Intern mottagare har ändrats; inget SMS-förslag skapades' })
    else {
      const saved = await insertApprovalArtifact(supabase, 'pending_approvals', 'id', options.businessId, options.approvalId, 'lead:internal-sms', {
        approval_type: 'send_sms', title: `Granska intern leadnotis — ${lead.name || 'ny lead'}`,
        description: 'Förberedd efter leadaktivering; skickas först efter ett nytt beslut.',
        payload: { recipient: 'internal', source: 'lead_activation', parent_approval_id: options.approvalId, to: currentPhone, message: options.reviewedInternalMessage, related_id: dealId || leadId },
        status: 'pending', risk_level: 'low', expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })
      effects.push(saved.error || !saved.data ? { effect: 'internal_sms', status: 'failed', message: saved.error?.message || 'SMS-kortet kunde inte sparas' } : { effect: 'internal_sms', status: 'succeeded', message: 'Separat granskningskort skapat', approval_id: saved.data.id })
    }
  } else effects.push({ effect: 'internal_sms', status: 'skipped', message: 'Valdes bort eller mottagare saknas' })

  if (options.runAutomationRules) {
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      const summary = await fireEvent(supabase, 'lead_received', options.businessId, {
        source: lead.source || 'email_forward', lead_id: lead.lead_id, entity_id: lead.lead_id,
        customer_id: lead.customer_id, customer_name: lead.name, require_explicit_approval: true,
      })
      effects.push({ effect: 'lead_received_rules', status: summary.failed ? 'failed' : summary.pending_approval || summary.executed ? 'succeeded' : 'skipped',
        message: `${summary.matched} matchade; ${summary.pending_approval} nya granskningar; ${summary.executed} utförda; ${summary.skipped} överhoppade; ${summary.failed} misslyckade` })
    } catch (err) {
      effects.push({ effect: 'lead_received_rules', status: 'failed', message: err instanceof Error ? err.message : String(err) })
    }
  } else effects.push({ effect: 'lead_received_rules', status: 'skipped', message: 'Valdes bort i granskningen' })

  return { dealId, dealError, effects }
}
