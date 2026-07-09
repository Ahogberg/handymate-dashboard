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

const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD

async function sendSMS(to: string, message: string, from: string): Promise<boolean> {
  if (!ELKS_API_USER || !ELKS_API_PASSWORD) return false
  try {
    const res = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: sanitizeSenderId(from),
        to,
        message,
      }),
    })
    return res.ok
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
  /** Initial status. Default 'new' (Golden Path). Webhook använder
      'pending_review' så helpern kan reusa lead-skapande utan att
      skapa deal — då skickas leadCreatesDeal=false. */
  initialStatus?: 'new' | 'pending_review'
  /** Om false skippas deal-skapande + SMS + fireEvent. Används av
      webhook som vill skapa lead i pending_review-state och vänta på
      manuell godkännande innan deal aktiveras. Default true. */
  createDealAndNotify?: boolean
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
  } = input

  const cleanPhone = phone.replace(/\s/g, '')

  // ── 1. Customer (dedup på business_id + phone) ────────────────
  let customerId: string
  const { data: existing } = await supabase
    .from('customer')
    .select('customer_id')
    .eq('business_id', businessId)
    .eq('phone_number', cleanPhone)
    .maybeSingle()

  if (existing) {
    customerId = existing.customer_id
  } else {
    const newId = 'cust_' + Math.random().toString(36).substr(2, 9)
    const { data: newCustomer } = await supabase
      .from('customer')
      .insert({
        customer_id: newId,
        business_id: businessId,
        name,
        phone_number: cleanPhone,
        email: email || null,
      })
      .select('customer_id')
      .single()
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

  await supabase.from('leads').insert({
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
  })

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
  if (businessPhoneNumber) {
    const smsText = `🌐 Ny lead från ${source}!\nNamn: ${name}\nTel: ${cleanPhone}${message ? `\n"${message.slice(0, 80)}"` : ''}\n→ app.handymate.se/dashboard/pipeline`
    sendSMS(businessPhoneNumber, smsText, 'Handymate').catch(() => {})
  }

  // ── 6. Automation-event ──────────────────────────────────────
  try {
    const { fireEvent } = await import('@/lib/automation-engine')
    await fireEvent(supabase, 'lead_received', businessId, {
      source,
      lead_id: leadId,
      customer_id: customerId,
      customer_name: name,
    })
  } catch { /* non-blocking */ }

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
    sendSMS(biz.phone_number, smsText, 'Handymate').catch(() => {})
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
