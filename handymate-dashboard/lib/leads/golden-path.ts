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
import { getStageBySlug } from '@/lib/pipeline'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'
import { findCustomerDuplicates } from '@/lib/customer-dedupe'
import { contactSourceFromLead, isMissingContactSourceColumnError } from '@/lib/customers/contact-source'

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
    const newCustomerRow = {
      customer_id: newId,
      business_id: businessId,
      name,
      phone_number: leadPhone || null,
      email: email || null,
      // v152 (kontaktproveniens): Golden Path är den EN platsen som skapar
      // en customer-rad ur ett lead — se lib/customers/contact-source.ts
      // för mappningen mellan leads.source och contact_source.
      contact_source: contactSourceFromLead(source),
      contact_source_at: new Date().toISOString(),
    }
    let { data: newCustomer, error: newCustomerError } = await supabase
      .from('customer')
      .insert(newCustomerRow)
      .select('customer_id')
      .single()

    if (newCustomerError && isMissingContactSourceColumnError(newCustomerError.message)) {
      // sql/v152 ej körd ännu — Golden Path är den mest centrala kundvägen
      // i hela appen (röst, widget, portal, referral, e-postforward, ...)
      // och FÅR ALDRIG fällas av ett proveniensfält, samma toleransmönster
      // som v86.
      console.warn('[golden-path] contact_source-kolumner saknas (sql/v152 ej körd) — sparar utan dem:', newCustomerError.message)
      const { contact_source, contact_source_at, ...rest } = newCustomerRow
      const retry = await supabase.from('customer').insert(rest).select('customer_id').single()
      newCustomer = retry.data
      newCustomerError = retry.error
    }

    if (newCustomerError) {
      console.error('[golden-path] customer insert error:', newCustomerError.message)
    }
    customerId = newCustomer?.customer_id || newId
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
    const stage = await getStageBySlug(businessId, 'new_inquiry')
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
 *   2. Skapa deal i pipeline (Golden Path-deal-delen)
 *   3. Skicka SMS till hantverkaren
 *   4. fireEvent('lead_received')
 *
 * Ingen customer skapas — den finns redan från webhook.
 * Returnerar dealId | null + dealError (deal-skapande är non-blocking, men
 * ett tyst fel får aldrig se ut som success — surfas via dealError).
 *
 * Caller måste verifiera att lead.business_id stämmer med session-
 * business innan denna helper kallas — denna funktion gör ingen
 * extra rättighetscheck.
 */
export async function activatePendingLead(
  leadId: string,
  supabase: SupabaseClient,
): Promise<{ dealId: string | null; dealError: string | null }> {
  const { data: lead, error } = await supabase
    .from('leads')
    .select('lead_id, business_id, customer_id, name, phone, email, notes, source')
    .eq('lead_id', leadId)
    .single()

  if (error || !lead) {
    throw new Error(`[activatePendingLead] Lead ${leadId} hittades inte`)
  }

  // Byt status till 'new' så Golden Path-pipeline tar över
  await supabase
    .from('leads')
    .update({ status: 'new', updated_at: new Date().toISOString() })
    .eq('lead_id', leadId)

  // Hämta business-telefon för SMS-notis
  const { data: biz } = await supabase
    .from('business_config')
    .select('phone_number')
    .eq('business_id', lead.business_id)
    .single()

  // Skapa deal i pipeline
  // Samma fix som createLeadAndDeal: stage_id måste komma från pipeline_stage
  // (SINGULAR, deals-Kanban) via getStageBySlug('new_inquiry'). Ett id från
  // pipeline_stages (PLURAL) är ogiltigt mot deal.stage_id-FK:n och gjorde att
  // inserten rullades tillbaka tyst.
  let dealId: string | null = null
  let dealError: string | null = null
  try {
    const stage = await getStageBySlug(lead.business_id, 'new_inquiry')
    if (!stage) {
      dealError = 'pipeline_stage "new_inquiry" saknas — deal ej skapad (stages ej seedade?)'
      console.warn(`[activatePendingLead] ${dealError} (business ${lead.business_id})`)
    } else {
      const nextNumber = await getNextCaseNumber(supabase, lead.business_id)
      const message = lead.notes
      const { data: newDeal, error: insertError } = await supabase
        .from('deal')
        .insert({
          business_id: lead.business_id,
          title: message ? message.slice(0, 80) : `Förfrågan från ${lead.name || 'kund'}`,
          customer_id: lead.customer_id,
          lead_id: lead.lead_id,
          stage_id: stage.id,
          source: (lead.source ?? 'email_forward').toLowerCase(),
          deal_number: nextNumber,
          priority: 'medium',
        })
        .select('id')
        .maybeSingle()
      if (insertError) {
        dealError = insertError.message
        console.error('[activatePendingLead] Deal-insert misslyckades:', insertError.message)
      }
      dealId = newDeal?.id ?? null
    }
  } catch (err) {
    dealError = err instanceof Error ? err.message : String(err)
    console.error('[activatePendingLead] Deal creation failed:', err)
  }

  // SMS-notis (non-blocking)
  if (biz?.phone_number) {
    const smsText = `🌐 Ny lead!\nNamn: ${lead.name}\nTel: ${lead.phone}${lead.notes ? `\n"${lead.notes.slice(0, 80)}"` : ''}\n→ app.handymate.se/dashboard/pipeline`
    sendSMS(supabase, lead.business_id, biz.phone_number, smsText, 'Handymate').catch(() => {})
  }

  // Automation-event
  try {
    const { fireEvent } = await import('@/lib/automation-engine')
    await fireEvent(supabase, 'lead_received', lead.business_id, {
      source: lead.source || 'email_forward',
      lead_id: lead.lead_id,
      customer_id: lead.customer_id,
      customer_name: lead.name,
    })
  } catch { /* non-blocking */ }

  return { dealId, dealError }
}
