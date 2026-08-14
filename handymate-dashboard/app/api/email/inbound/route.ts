/**
 * POST /api/email/inbound — Postmark Inbound-webhook.
 *
 * Flöde (2026-05-28, multi-tenant-routning tillagd 2026-08-10 — Epic B):
 *   1. Verifiera Basic Auth (postmark-signature.ts)
 *   2. Parsa Postmark JSON-payload
 *   3. Slå upp mottagaradressen mot email_inbound_route → business_id
 *      (sql/v106_email_inbound_route.sql är kontraktet — se resolveInboundBusinessId)
 *   4. Stage 1 Haiku: isLikelyLead — spam-filter
 *   5. Stage 2 Haiku: parseLeadFromEmail — extrahera fält + källa
 *   6. Slå upp lead_source mot business via parsed.source (best-effort)
 *   7. Skapa lead i status='pending_review' (createLeadAndDeal med
 *      createDealAndNotify=false — ingen deal/SMS/event ännu)
 *   8. Skapa pending_approvals row med approval_type='lead_review'
 *      som granska-vyn visar
 *
 * Approve sker via /api/approvals/[id] (POST { action: 'approve' }).
 * Den kallar createLeadAndDeal igen med vanliga defaults så deal
 * skapas i pipeline + Golden Path-events triggar.
 *
 * Multi-tenant-routning: env POSTMARK_INBOUND_DEFAULT_BUSINESS_ID lever kvar
 * som fail-closed legacy-fallback (enbiz-piloten, Bee Service) för adresser
 * som inte finns i email_inbound_route — se resolveInboundBusinessId nedan.
 */

import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { verifyPostmarkBasicAuth } from '@/lib/email/postmark-signature'
import { isLikelyLead, parseLeadFromEmail, type EmailInput } from '@/lib/gmail-lead-detection'
import { createLeadAndDeal } from '@/lib/leads/golden-path'
import { saveInboundAttachments, type PostmarkAttachment } from '@/lib/email/postmark-attachments'

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
  /** Postmark expanderar To till en strukturerad lista — mer tillförlitlig
      att parsa än råsträngen To när flera mottagare finns. */
  ToFull?: { Email?: string; Name?: string; MailboxHash?: string }[]
  /** Den exakta adress mailet skickades till, innan alias/vidarebefordran —
      det Postmark rekommenderar för routning. Se Postmarks inbound-docs. */
  OriginalRecipient?: string
  Tag?: string
  /** Bilagor, base64 direkt i payloaden. Kräver att "Include raw email
      content" / attachments är påslaget i Postmarks inbound-serverkonfig. */
  Attachments?: PostmarkAttachment[]
}

/**
 * Extraherar mottagaradressen ur payloaden, lower-cased.
 * Prioritet: OriginalRecipient (mest tillförlitlig) → ToFull[0].Email → To
 * (fritextparsad). Ingen av dem är "innehåll" i den mening fail-closed-
 * principen avser — det är kuvertadressen, inte mailets brödtext/ämne.
 */
function extractRecipientAddress(payload: PostmarkInboundPayload): string | null {
  if (payload.OriginalRecipient) {
    return payload.OriginalRecipient.trim().toLowerCase()
  }
  const firstToFull = payload.ToFull?.find(entry => entry.Email)?.Email
  if (firstToFull) {
    return firstToFull.trim().toLowerCase()
  }
  if (payload.To) {
    const match = payload.To.match(/[^\s<>,]+@[^\s<>,]+/)
    if (match) return match[0].trim().toLowerCase()
  }
  return null
}

/**
 * Löser business_id ur mottagaradressen. FAIL-CLOSED (sql/v106 är kontraktet):
 *   1. Adressen finns som aktiv rad i email_inbound_route → dess business_id.
 *   2. Ingen träff (eller tabellen saknas — migrationen inte körd än, eller
 *      annat DB-fel) → env POSTMARK_INBOUND_DEFAULT_BUSINESS_ID (legacy-
 *      entenant, dagens beteende) om den är satt.
 *   3. Varken träff eller env → null. Tenant-valet får ALDRIG härledas ur
 *      payloadens innehåll i övrigt (From/Subject/body).
 */
async function resolveInboundBusinessId(
  recipientAddress: string | null,
  supabase: ReturnType<typeof getServerSupabase>,
): Promise<string | null> {
  const envDefault = process.env.POSTMARK_INBOUND_DEFAULT_BUSINESS_ID || null

  if (recipientAddress) {
    try {
      const { data, error } = await supabase
        .from('email_inbound_route')
        .select('business_id')
        .eq('address', recipientAddress)
        .eq('active', true)
        .maybeSingle()

      if (error) throw error
      if (data?.business_id) return data.business_id
    } catch (err) {
      // Tabellen finns troligen inte ännu (v106 ej körd) — kan också vara
      // ett tillfälligt DB-fel. Båda fallen: samma env-fallback, aldrig
      // payload-styrd gissning.
      console.warn('[email-inbound] uppslag mot email_inbound_route misslyckades, faller tillbaka på env:', err)
    }
  }

  return envDefault
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

  const supabase = getServerSupabase()

  // ── 2.5 Multi-tenant-routning: mottagaradress → business_id ───────
  const recipientAddress = extractRecipientAddress(payload)
  const businessId = await resolveInboundBusinessId(recipientAddress, supabase)
  if (!businessId) {
    // Okänd adress och ingen env-fallback satt — avvisa tyst. 200 så
    // Postmark inte retry:ar (mailet är inte "tillfälligt fel", det hör
    // inte hemma här).
    console.log(`[email-inbound] okänd mottagaradress, mail avvisat: ${recipientAddress || '(ingen mottagaradress i payload)'}`)
    return Response.json({ skipped: true, reason: 'unknown_recipient' })
  }

  // ── 2.6 Live-kvitto (B5): markera senaste routningsträffen ────────
  // Best-effort — tabellen kan sakna kolumnen om v109 inte körts än.
  // Gäller både lead-grenen och bekräftelsemail-grenen nedan.
  if (recipientAddress) {
    try {
      const { error } = await supabase
        .from('email_inbound_route')
        .update({ last_received_at: new Date().toISOString() })
        .eq('address', recipientAddress)
      if (error) console.warn('[email-inbound] kunde inte skriva last_received_at:', error)
    } catch (err) {
      console.warn('[email-inbound] kunde inte skriva last_received_at:', err)
    }
  }

  // ── 2.7 Gmail-vidarebefordran-bekräftelse — auto-fångst (B5) ──────
  // Kunden vidarebefordrar sin info@ hit; Gmail skickar ETT bekräftelse-
  // mail TILL den nya adressen som måste besökas för att aktivera
  // vidarebefordran. Fångas HÄR, före Stage 1, så det aldrig riskerar att
  // klassas som spam eller bli en lead. Bara länkar till mail.google.com
  // hämtas — ett förfalskat From-fält är ofarligt eftersom GET:en ändå
  // bara går mot Googles egen domän, aldrig mot payloadens innehåll i
  // övrigt.
  if (/forwarding-noreply@google\.com/i.test(payload.From || '')) {
    const confirmed = await tryConfirmGmailForwarding(payload)
    console.log('[email-inbound] Gmail-vidarebefordran-bekräftelse', {
      businessId,
      recipientAddress,
      confirmed,
    })
    return Response.json({ handled: 'gmail_forwarding_confirmation', success: confirmed })
  }

  const emailInput: EmailInput = {
    subject: payload.Subject || '(utan ämne)',
    from: payload.FromName ? `${payload.FromName} <${payload.From || ''}>` : (payload.From || 'unknown'),
    body: payload.TextBody || payload.StrippedTextReply || stripHtml(payload.HtmlBody || ''),
    date: payload.Date || new Date().toISOString(),
  }

  // ── 3. Stage 1: lead-detektion ────────────────────────────────
  const likely = await isLikelyLead(emailInput, [], [], { businessId, refId: payload.MessageID || 'no_message_id_' + Date.now() })
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
  const parsed = await parseLeadFromEmail(emailInput, { businessId, refId: payload.MessageID || 'no_message_id_' + Date.now() })

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

  // ── 6.5 Bilagor → customer_document (B4) ──────────────────────
  // Leaden är redan skapad — en trasig bilaga får aldrig påverka svaret.
  try {
    await saveInboundAttachments(
      payload.Attachments,
      businessId,
      result.leadId,
      result.customerId,
      payload.MessageID || null,
    )
  } catch (err) {
    console.error('[email-inbound] Bilagehantering misslyckades (ej fatalt):', err)
  }

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
      agent_id: 'daniel',
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

/**
 * Försöker auto-bekräfta Gmails vidarebefordringsmail: hittar en länk till
 * mail.google.com i mailkroppen och gör ett server-side GET mot den. Ingen
 * retry, kort timeout — misslyckas den, loggas det bara, mailet studsar
 * inte och skapar ingen lead.
 */
async function tryConfirmGmailForwarding(payload: PostmarkInboundPayload): Promise<boolean> {
  const body = payload.HtmlBody || payload.TextBody || ''
  const urlMatches = body.match(/https?:\/\/[^\s"'<>]+/g)
  if (!urlMatches) return false

  for (const raw of urlMatches) {
    let url: URL
    try {
      url = new URL(raw.replace(/[)\].,]+$/, ''))
    } catch {
      continue
    }
    if (url.hostname !== 'mail.google.com') continue

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(url.toString(), { method: 'GET', signal: controller.signal })
      clearTimeout(timeout)
      return res.ok
    } catch (err) {
      console.warn('[email-inbound] Kunde inte hämta Gmail-bekräftelselänken:', err)
      return false
    }
  }

  return false
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
