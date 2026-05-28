/**
 * POST /api/email/inbound — Postmark Inbound-webhook.
 *
 * Flöde (2026-05-28):
 *   1. Verifiera Basic Auth (postmark-signature.ts)
 *   2. Parsa Postmark JSON-payload
 *   3. Stage 1 Haiku: isLikelyLead — spam-filter
 *   4. Stage 2 Haiku: parseLeadFromEmail — extrahera fält + källa
 *   5. Slå upp lead_source mot business via parsed.source (best-effort)
 *   6. Skapa lead i status='pending_review' (createLeadAndDeal med
 *      createDealAndNotify=false — ingen deal/SMS/event ännu)
 *   7. Skapa pending_approvals row med approval_type='lead_review'
 *      som granska-vyn visar
 *
 * Approve sker via /api/approvals/[id] (POST { action: 'approve' }).
 * Den kallar createLeadAndDeal igen med vanliga defaults så deal
 * skapas i pipeline + Golden Path-events triggar.
 *
 * MVP-begränsning: business_id hämtas från
 * env POSTMARK_INBOUND_DEFAULT_BUSINESS_ID. Pilot är enbiz (Bee Service).
 * Senare uppgradering: per-business inbox-routing via Postmark "tag"
 * eller olika inbound-mailaddresser (TD).
 */

import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { verifyPostmarkBasicAuth } from '@/lib/email/postmark-signature'
import { isLikelyLead, parseLeadFromEmail, type EmailInput } from '@/lib/gmail-lead-detection'
import { createLeadAndDeal } from '@/lib/leads/golden-path'

interface PostmarkInboundPayload {
  From?: string
  FromName?: string
  Subject?: string
  TextBody?: string
  HtmlBody?: string
  StrippedTextReply?: string
  Date?: string
  MessageID?: string
  To?: string
  Tag?: string
}

export async function POST(request: NextRequest) {
  // ── 1. Basic Auth-verifiering ──────────────────────────────
  if (!verifyPostmarkBasicAuth(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Payload ───────────────────────────────────────────────
  let payload: PostmarkInboundPayload
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const businessId = process.env.POSTMARK_INBOUND_DEFAULT_BUSINESS_ID
  if (!businessId) {
    console.error('[email/inbound] POSTMARK_INBOUND_DEFAULT_BUSINESS_ID ej satt')
    return Response.json({ error: 'Server config missing' }, { status: 500 })
  }

  const supabase = getServerSupabase()

  const emailInput: EmailInput = {
    subject: payload.Subject || '(utan ämne)',
    from: payload.FromName ? `${payload.FromName} <${payload.From || ''}>` : (payload.From || 'unknown'),
    body: payload.TextBody || payload.StrippedTextReply || stripHtml(payload.HtmlBody || ''),
    date: payload.Date || new Date().toISOString(),
  }

  // ── 3. Stage 1: lead-detektion ────────────────────────────────
  const likely = await isLikelyLead(emailInput, [], [])
  if (!likely) {
    // Spam/nyhetsbrev/system-mail — logga men skapa inget
    console.log('[email/inbound] Ej lead enligt Stage 1', {
      from: payload.From,
      subject: payload.Subject,
      messageId: payload.MessageID,
    })
    return Response.json({ skipped: true, reason: 'not_likely_lead' })
  }

  // ── 4. Stage 2: fullständig parsning ──────────────────────────
  const parsed = await parseLeadFromEmail(emailInput)

  // Säkerhetsprincip: utan namn + telefon kan vi inte rimligen skapa
  // en lead — manuell granskning behövs ändå. Logga och returnera.
  if (!parsed.name && !parsed.phone) {
    console.warn('[email/inbound] Parser hittade varken namn eller telefon — skippar', {
      from: payload.From,
      subject: payload.Subject,
    })
    return Response.json({ skipped: true, reason: 'no_contact_info' })
  }

  // ── 5. Källa-mappning mot lead_sources ───────────────────────
  let leadSourceId: string | null = null
  let resolvedSourceName: string = parsed.source || 'email_forward'
  if (parsed.source) {
    const { data: matched } = await supabase
      .from('lead_sources')
      .select('id, name')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .ilike('name', `%${parsed.source}%`)
      .maybeSingle()
    if (matched) {
      leadSourceId = matched.id
      resolvedSourceName = matched.name
    }
    // Om ingen match → behåll fritext i resolvedSourceName, ingen FK
  }

  // ── 6. Skapa lead i pending_review (utan deal/SMS/event) ─────
  const placeholderPhone = parsed.phone || '0000000000'  // krävs av schema; rensas vid approve
  const result = await createLeadAndDeal(
    {
      businessId,
      businessPhoneNumber: null,  // ingen SMS-notis vid pending
      name: parsed.name || 'Okänd (granska)',
      phone: placeholderPhone,
      email: parsed.email,
      message: parsed.description,
      source: 'email_forward',  // CHECK-värdet (lead_source.name lagras separat i payload)
      leadSourceId,
      sourceRef: payload.MessageID || null,
      initialStatus: 'pending_review',
      createDealAndNotify: false,
    },
    supabase,
  )

  // ── 7. pending_approvals för granska-UI ──────────────────────
  const previewLine = parsed.description
    ? parsed.description.slice(0, 140)
    : (emailInput.body.slice(0, 140) + '…')

  await supabase.from('pending_approvals').insert({
    business_id: businessId,
    approval_type: 'lead_review',
    title: `Ny lead: ${parsed.name || 'Okänd'}${parsed.source ? ` (via ${parsed.source})` : ''}`,
    description: previewLine,
    payload: {
      lead_id: result.leadId,
      parsed: {
        name: parsed.name,
        phone: parsed.phone,
        email: parsed.email,
        address: parsed.address,
        job_type: parsed.job_type,
        description: parsed.description,
        urgency: parsed.urgency,
        estimated_value: parsed.estimated_value,
        source: parsed.source,
      },
      resolved_source_name: resolvedSourceName,
      lead_source_id: leadSourceId,
      raw_email: {
        from: payload.From,
        from_name: payload.FromName,
        subject: payload.Subject,
        date: payload.Date,
        message_id: payload.MessageID,
        body_preview: emailInput.body.slice(0, 1000),
      },
    },
    status: 'pending',
    risk_level: parsed.phone && parsed.name ? 'low' : 'medium',
  })

  return Response.json({
    success: true,
    lead_id: result.leadId,
    status: 'pending_review',
  })
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
