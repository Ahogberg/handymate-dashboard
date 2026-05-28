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
        from: from.substring(0, 11),
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
  let dealId: string | null = null
  try {
    const { data: firstPipelineStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('business_id', businessId)
      .order('sort_order', { ascending: true })
      .limit(1)
      .single()

    if (firstPipelineStage) {
      const nextNumber = await getNextCaseNumber(supabase, businessId)
      const { data: newDeal } = await supabase
        .from('deal')
        .insert({
          business_id: businessId,
          title: message ? message.slice(0, 80) : `Förfrågan från ${name}`,
          customer_id: customerId,
          lead_id: leadId,
          stage_id: firstPipelineStage.id,
          source: source.toLowerCase(),
          deal_number: nextNumber,
          priority: 'medium',
        })
        .select('deal_id')
        .maybeSingle()
      dealId = newDeal?.deal_id || null
    }
  } catch (err) {
    console.error('[golden-path] Auto-deal creation failed:', err)
    // Non-blocking — lead skapas ändå
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

  return { leadId, dealId, customerId }
}
