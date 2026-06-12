/**
 * execute.ts — EN SANNING för approval-exekvering (execution-chain Steg 2).
 *
 * Delad funktion som omsätter en godkänd approval-payload till en faktisk
 * handling, via Steg-1-lib-funktionerna (sendInvoice/sendQuote/createBooking)
 * + sendSmsViaElks. Tre framtida konsumenter (web-route, auto-väg, mobil)
 * anropar denna i Steg 3+ — INGEN call-site är bytt än (ren konstruktion,
 * noll prod-påverkan).
 *
 * DESIGN (execution-chain-spec §3.2 + §3.5):
 *   - Auth-kontext som PARAM (actor) — execute.ts läser aldrig request/cookies.
 *     kind:'user' bär BusinessUser (role + permissions); kind:'system' = auto.
 *   - Permission-gate inuti: kind:'user' på känsliga typer (offert/faktura)
 *     kräver create_invoices → annars permission_denied.
 *   - four-eyes för send_quote: enabled + över tröskel + icke-owner/admin
 *     (system räknas som icke-owner) → skapar four_eyes_quote-approval +
 *     sätter offert pending_approval → reason 'four_eyes_required' (skickar EJ).
 *   - Differentierad ExecuteResult: ok | fail | four_eyes_required |
 *     permission_denied | rate_limited.
 *   - INGEN status-skrivning på pending_approvals här — det sker i call-sites
 *     (Steg 3+). execute.ts gör bara själva handlingen + dess egna sidoeffekter.
 *
 * SCOPE Steg 2: kärnan (de pengar-kritiska send-flödena + pure-SMS + ack).
 * Långsvansen (dispatch/time_attestation/seasonal/job_report/ai-draft/
 * autopilot/lead_review m.fl.) signaleras `metadata.unhandled = true` så
 * Steg 3-wiringen kan falla tillbaka på den gamla switchen tills de portas
 * (migrationsplan §4 steg 3: "behåll gamla switchen bakom flag tills verifierad").
 *
 * Dependency-injection (deps) för enhetstest utan DB/nätverk.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BusinessUser } from '@/lib/permissions'
import { hasPermission } from '@/lib/permissions'
import { sendInvoice as sendInvoiceReal } from '@/lib/invoices/send-invoice'
import { sendQuote as sendQuoteReal } from '@/lib/quotes/send-quote'
import { createBooking as createBookingReal } from '@/lib/bookings/create-booking'
import { sendSmsViaElks as sendSmsReal } from '@/lib/sms-send'

// ─────────────────────────────────────────────────────────────────
// Typer (§3.2)
// ─────────────────────────────────────────────────────────────────

export type Actor =
  | { kind: 'user'; user: BusinessUser }
  | { kind: 'system'; reason: string }

export interface ApprovalForExecute {
  approval_type: string
  payload: Record<string, unknown>
  business_id: string
  package_data?: unknown
}

export interface ExecuteInput {
  approval: ApprovalForExecute
  businessId: string
  actor: Actor
  supabase: SupabaseClient // service-role, injiceras av anroparen
  actionOverrides?: Record<string, string>
}

export interface ExecuteResult {
  ok: boolean
  reason?: 'fail' | 'four_eyes_required' | 'permission_denied' | 'rate_limited'
  error?: string
  metadata?: Record<string, unknown>
}

/** Injicerbara beroenden — defaultar till riktiga lib-funktionerna. */
export interface ExecuteDeps {
  sendInvoice: typeof sendInvoiceReal
  sendQuote: typeof sendQuoteReal
  createBooking: typeof createBookingReal
  sendSms: typeof sendSmsReal
}

const realDeps: ExecuteDeps = {
  sendInvoice: sendInvoiceReal,
  sendQuote: sendQuoteReal,
  createBooking: createBookingReal,
  sendSms: sendSmsReal,
}

// Typer som kräver create_invoices för kind:'user'.
const SENSITIVE_TYPES = new Set([
  'send_invoice',
  'review_auto_invoice',
  'send_quote',
])

// Pure-SMS-typer som i gamla switchen ENBART gör sendSmsViaElks.
const PURE_SMS_TYPES = new Set([
  'send_sms',
  'quote_nudge',
  'customer_reactivation',
  'send_matte_customer_reply',
])

// ─────────────────────────────────────────────────────────────────
// Huvudfunktion
// ─────────────────────────────────────────────────────────────────

export async function executeApproval(
  input: ExecuteInput,
  deps: ExecuteDeps = realDeps,
): Promise<ExecuteResult> {
  const type = input.approval.approval_type

  // ── Permission-gate (kind:'user' på känsliga typer) ───────────
  if (input.actor.kind === 'user' && SENSITIVE_TYPES.has(type)) {
    if (!hasPermission(input.actor.user, 'create_invoices')) {
      return {
        ok: false,
        reason: 'permission_denied',
        error: 'Du saknar behörighet (create_invoices) för denna handling.',
      }
    }
  }

  try {
    switch (type) {
      case 'send_invoice':
      case 'review_auto_invoice':
        return await execSendInvoice(input, deps)

      case 'send_quote':
        return await execSendQuote(input, deps)

      case 'create_booking':
        return await execCreateBooking(input, deps)

      case 'send_sms':
      case 'quote_nudge':
      case 'customer_reactivation':
      case 'send_matte_customer_reply':
        return await execSms(input, deps)

      // Rena bekräftelse-typer (ingen extern sidoeffekt).
      case 'profitability_warning':
      case 'low_stock_alert':
      case 'create_invoice_from_report':
        return { ok: true, metadata: { acknowledged: true } }

      default:
        // §3.7: ingen handling på okänd/oportad typ. Signalera unhandled så
        // Steg 3-wiringen faller tillbaka på gamla switchen. INGEN payload-
        // forms-slump-SMS (gamla default-fallbacken tas bort i samma veva).
        console.warn(`[execute] unhandled approval_type (faller tillbaka): ${type}`)
        return {
          ok: false,
          reason: 'fail',
          error: `unhandled_type: ${type}`,
          metadata: { unhandled: true },
        }
    }
  } catch (err: any) {
    return { ok: false, reason: 'fail', error: err?.message || String(err) }
  }
}

// ─────────────────────────────────────────────────────────────────
// Per-typ-handlers
// ─────────────────────────────────────────────────────────────────

async function execSendInvoice(input: ExecuteInput, deps: ExecuteDeps): Promise<ExecuteResult> {
  const p = input.approval.payload
  const invoiceId = p.invoice_id as string | undefined
  if (!invoiceId) return { ok: false, reason: 'fail', error: 'invoice_id saknas' }

  // review_auto_invoice tvingar båda kanaler (som gamla switchen); send_invoice
  // respekterar payload-flaggorna (default true).
  const isAuto = input.approval.approval_type === 'review_auto_invoice'
  const r = await deps.sendInvoice(input.supabase, input.businessId, {
    invoiceId,
    sendEmail: isAuto ? true : p.send_email !== false,
    sendSms: isAuto ? true : p.send_sms !== false,
  })

  if (r.notFound) return { ok: false, reason: 'fail', error: 'Invoice not found' }

  // GATE PÅ FAKTISK SUCCESS (refaktorns syfte): ok endast om något skickades.
  const sent = !!(r.email || r.sms)
  if (sent) return { ok: true, metadata: { sms: r.sms, email: r.email, invoice_id: invoiceId } }
  return {
    ok: false,
    reason: 'fail',
    error: r.errors.length > 0 ? r.errors.join('; ') : 'Faktura skickades inte (ingen kanal lyckades)',
  }
}

async function execSendQuote(input: ExecuteInput, deps: ExecuteDeps): Promise<ExecuteResult> {
  const p = input.approval.payload
  const quoteId = p.quote_id as string | undefined
  if (!quoteId) return { ok: false, reason: 'fail', error: 'quote_id saknas' }

  // Hämta offert (scoped på businessId — execute.ts litar på trusted businessId,
  // ägarskaps-verifieringen som webroutens four-eyes hade görs av call-site/route).
  const { data: quote } = await input.supabase
    .from('quotes')
    .select('*, sign_token')
    .eq('quote_id', quoteId)
    .eq('business_id', input.businessId)
    .single()
  if (!quote) return { ok: false, reason: 'fail', error: 'Quote not found' }

  // ── four-eyes (§3.5) ──────────────────────────────────────────
  const { data: cfg } = await input.supabase
    .from('business_config')
    .select('four_eyes_enabled, four_eyes_threshold_sek')
    .eq('business_id', input.businessId)
    .maybeSingle()

  const quoteTotal = (quote as any).total || (quote as any).subtotal || 0
  const isOwnerOrAdmin =
    input.actor.kind === 'user' &&
    (input.actor.user.role === 'owner' || input.actor.user.role === 'admin')

  if (
    cfg?.four_eyes_enabled &&
    quoteTotal >= (cfg.four_eyes_threshold_sek || 50000) &&
    !isOwnerOrAdmin
  ) {
    const approvalId = `appr_4e_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    const { error: apprErr } = await input.supabase.from('pending_approvals').insert({
      id: approvalId,
      business_id: input.businessId,
      approval_type: 'four_eyes_quote',
      title: `Offert kräver godkännande — ${quoteTotal.toLocaleString('sv-SE')} kr`,
      description: `${(quote as any).title || 'Offert'}. Beloppet överstiger gränsen på ${(cfg.four_eyes_threshold_sek || 50000).toLocaleString('sv-SE')} kr.`,
      payload: {
        quote_id: quoteId,
        quote_title: (quote as any).title,
        quote_total: quoteTotal,
        threshold: cfg.four_eyes_threshold_sek,
        requested_by: input.actor.kind === 'user' ? input.actor.user.name : 'system',
        send_method: (p.method as string) || 'both',
      },
      status: 'pending',
      risk_level: 'high',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    if (apprErr) {
      return { ok: false, reason: 'fail', error: `Kunde inte skapa four_eyes-approval: ${apprErr.message}` }
    }
    await input.supabase.from('quotes').update({ status: 'pending_approval' }).eq('quote_id', quoteId)
    return {
      ok: false,
      reason: 'four_eyes_required',
      error: 'Offerten kräver godkännande av admin innan den skickas.',
      metadata: { new_approval_id: approvalId },
    }
  }

  // ── Skicka via lib (business_config som `business`-objekt) ─────
  const { data: business } = await input.supabase
    .from('business_config')
    .select('*')
    .eq('business_id', input.businessId)
    .single()
  if (!business) return { ok: false, reason: 'fail', error: 'Business config saknas' }

  const r = await deps.sendQuote(input.supabase, business, quote, {
    quoteId,
    method: (p.method as string) || 'both',
    extraEmails: (p.extra_emails as string[]) || undefined,
    bccEmails: (p.bcc_emails as string[]) || undefined,
  })

  if (r.status >= 200 && r.status < 300 && r.body?.success) {
    return { ok: true, metadata: r.body }
  }
  return {
    ok: false,
    reason: r.status === 429 ? 'rate_limited' : 'fail',
    error: r.body?.error || `Offert kunde inte skickas (HTTP ${r.status})`,
    metadata: r.body,
  }
}

async function execCreateBooking(input: ExecuteInput, deps: ExecuteDeps): Promise<ExecuteResult> {
  const { data: business } = await input.supabase
    .from('business_config')
    .select('*')
    .eq('business_id', input.businessId)
    .single()
  if (!business) return { ok: false, reason: 'fail', error: 'Business config saknas' }

  const r = await deps.createBooking(input.supabase, business, input.approval.payload)
  if (r.status >= 200 && r.status < 300) {
    return { ok: true, metadata: r.body }
  }
  return { ok: false, reason: 'fail', error: r.body?.error || `Bokning kunde inte skapas (HTTP ${r.status})` }
}

async function execSms(input: ExecuteInput, deps: ExecuteDeps): Promise<ExecuteResult> {
  const p = input.approval.payload
  const entity = p.entity as any
  const to = (p.to as string) || (p.customer_phone as string) || entity?.phone
  const message = (p.message as string) || (p.suggested_sms as string) || (p.customer_reply_pending as string)
  if (!to || !message) {
    return { ok: false, reason: 'fail', error: 'payload saknar to eller message' }
  }

  const { data: bc } = await input.supabase
    .from('business_config')
    .select('business_name')
    .eq('business_id', input.businessId)
    .maybeSingle()

  const r = await deps.sendSms({
    supabase: input.supabase,
    businessId: input.businessId,
    businessName: bc?.business_name ?? null,
    to,
    message,
    customerId: (p.customer_id as string) || entity?.customerId || null,
    relatedId: (p.related_id as string) || null,
    messageType: input.approval.approval_type,
  })

  if (r.success) {
    return { ok: true, metadata: { sms_sent: true, sms_id: r.smsId, elks_id: r.elksId } }
  }
  // 46elks 429 → rate_limited; annars fail.
  if (r.status === 429) {
    return { ok: false, reason: 'rate_limited', error: r.error || 'För många försök, vänta en stund.' }
  }
  return { ok: false, reason: 'fail', error: r.error || 'SMS kunde inte skickas' }
}
