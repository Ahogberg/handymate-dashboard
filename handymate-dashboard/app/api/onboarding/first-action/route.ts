import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { svDateStr } from '@/lib/dates'
import { OPEN_QUOTE_STATUSES } from '@/lib/quotes/statuses'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'
import {
  pickFirstAction,
  firstActionCopy,
  DEFAULT_ENABLED_TIERS,
  type FirstActionInvoiceRow,
  type FirstActionQuoteRow,
  type FirstActionCopy,
} from '@/lib/onboarding/first-action'
import { loadReminderConfig, composeReminderStep, createInvoiceReminderCard } from '@/lib/invoice-reminder-card'
import { createQuoteFollowUpCard } from '@/lib/agents/daniel/quote-follow-up-card'
import { buildUnopenedNudgeMessage, buildOpenedQuoteFollowUpMessage } from '@/lib/agents/daniel/unopened-quotes'

// force-dynamic: auth läses via helper som läser request.headers direkt —
// se CLAUDE.md "GET-rutter som läser auth via en helper". POST cachas inte,
// men regeln hålls för konsekvens.
export const dynamic = 'force-dynamic'

/**
 * POST /api/onboarding/first-action — första verifierade handlingen (2026-08-27).
 *
 * Anropas av Company Scan (components/tour/CompanyScan.tsx) parallellt med
 * radanimationen. Skannings-GET:en förblir read-only; skrivningen bor här.
 *
 * Flöde: livstidsdedup på payload.first_action_source → hämta rader →
 * pickFirstAction (ren, deterministisk, noll tokens) → skapa kortet via
 * SAMMA byggare som cronarna (lib/invoice-reminder-card.ts respektive
 * lib/agents/daniel/quote-follow-up-card.ts) → svara med kortets id + copy.
 *
 * Ingen push, inget första-händelse-SMS: ägaren sitter framför skärmen.
 * Alla fel → driftlarm + 200 { kind: null } så skanningen degraderar till
 * dagens "Visa mig" (kunden ser aldrig ett fel här).
 *
 * Markören `first_action_source: 'company_scan'` i payloaden är
 * livstidsdedupen (samma regel som startkorten: INGET statusfilter — ett
 * löst kort ska inte födas om vid nästa inloggning).
 */
// Inte exporterad: Next.js validerar en route-fils värde-exporter (bara
// GET/POST/dynamic m.fl. tillåts) — en exporterad const fäller next build.
const FIRST_ACTION_SOURCE = 'company_scan'

export interface FirstActionResponse {
  kind: 'karin_overdue' | 'daniel_stale_quote' | 'skapa_kund' | null
  approvalId?: string
  href?: string
  headline?: string
  cta?: string
  agent?: FirstActionCopy['agent']
}

const ingen = (): NextResponse => NextResponse.json({ kind: null } satisfies FirstActionResponse)

export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const currentUser = await getCurrentUser(request, business.business_id)
  if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
    return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
  }

  const supabase = getServerSupabase()
  const businessId = business.business_id
  const now = new Date()

  try {
    // ── 1. Livstidsdedup: har skanningen redan skapat ett kort för det här kontot?
    const { data: tidigare, error: dedupErr } = await supabase
      .from('pending_approvals')
      .select('id, status, payload')
      .eq('business_id', businessId)
      .contains('payload', { first_action_source: FIRST_ACTION_SOURCE })
      .limit(1)
    if (dedupErr) {
      await rapporteraTystFel(supabase, businessId, 'first-action:dedupe-read', dedupErr.message)
      return ingen()
    }
    if (tidigare && tidigare.length > 0) {
      const kort = tidigare[0]
      const sparad = (kort.payload as Record<string, unknown> | null)?.first_action as Partial<FirstActionResponse> | undefined
      if (kort.status === 'pending' && sparad?.kind) {
        return NextResponse.json({ ...sparad, kind: sparad.kind, approvalId: kort.id } satisfies FirstActionResponse)
      }
      return ingen()
    }

    // ── 2. Raderna — samma urval som skanningen, plus det pickern behöver
    const today = svDateStr(now)
    const [invRes, quoteRes, custCountRes] = await Promise.all([
      supabase
        .from('invoice')
        .select('invoice_id, invoice_number, ocr_number, status, due_date, total, customer_pays, rot_rut_type, reminder_count, customer_id')
        .eq('business_id', businessId)
        .in('status', ['sent', 'overdue'])
        .lt('due_date', today)
        .limit(500),
      supabase
        .from('quotes')
        .select('quote_id, status, sent_at, view_count, total, customer_pays, customer_id, title')
        .eq('business_id', businessId)
        .in('status', [...OPEN_QUOTE_STATUSES])
        .not('sent_at', 'is', null)
        .limit(500),
      supabase
        .from('customer')
        .select('customer_id', { count: 'exact', head: true })
        .eq('business_id', businessId),
    ])
    if (invRes.error || quoteRes.error || custCountRes.error) {
      await rapporteraTystFel(
        supabase, businessId, 'first-action:rows-read',
        invRes.error?.message || quoteRes.error?.message || custCountRes.error?.message || 'okänt',
      )
      return ingen()
    }

    // Kunder i EN query (offerter saknar FK-embed i prod — se lib/autopilot/quote-nudge.ts)
    const kundIds = Array.from(new Set(
      [...(invRes.data ?? []), ...(quoteRes.data ?? [])].map(r => r.customer_id).filter((id): id is string => !!id),
    ))
    const kunder = new Map<string, { name: string | null; phone_number: string | null; email: string | null }>()
    if (kundIds.length > 0) {
      const { data: rows, error: custErr } = await supabase
        .from('customer')
        .select('customer_id, name, phone_number, email')
        .eq('business_id', businessId)
        .in('customer_id', kundIds)
      if (custErr) {
        await rapporteraTystFel(supabase, businessId, 'first-action:customers-read', custErr.message)
        return ingen()
      }
      for (const c of rows ?? []) kunder.set(c.customer_id, { name: c.name ?? null, phone_number: c.phone_number ?? null, email: c.email ?? null })
    }

    const invoices: FirstActionInvoiceRow[] = (invRes.data ?? []).map(r => ({
      invoice_id: r.invoice_id,
      invoice_number: r.invoice_number ?? null,
      status: r.status,
      due_date: r.due_date ?? null,
      total: r.total ?? null,
      customer_pays: r.customer_pays ?? null,
      rot_rut_type: r.rot_rut_type ?? null,
      reminder_count: r.reminder_count ?? null,
      customer_id: r.customer_id ?? null,
      customer_name: r.customer_id ? kunder.get(r.customer_id)?.name ?? null : null,
      customer_phone: r.customer_id ? kunder.get(r.customer_id)?.phone_number ?? null : null,
    }))
    const quotes: FirstActionQuoteRow[] = (quoteRes.data ?? []).map(r => ({
      quote_id: r.quote_id,
      status: r.status,
      sent_at: r.sent_at ?? null,
      view_count: r.view_count ?? null,
      total: r.total ?? null,
      customer_pays: r.customer_pays ?? null,
      customer_id: r.customer_id ?? null,
      customer_name: r.customer_id ? kunder.get(r.customer_id)?.name ?? null : null,
      customer_phone: r.customer_id ? kunder.get(r.customer_id)?.phone_number ?? null : null,
      title: r.title ?? null,
    }))

    // ── 3. Välj EN — deterministiskt
    const action = pickFirstAction({
      today,
      now: now.getTime(),
      customerCount: custCountRes.count ?? 0,
      invoices,
      quotes,
      enabledTiers: DEFAULT_ENABLED_TIERS,
    })
    if (!action) return ingen()
    const copy = firstActionCopy(action)

    if (action.kind === 'skapa_kund') {
      return NextResponse.json({ kind: 'skapa_kund', href: action.href, headline: copy.headline, cta: copy.cta, agent: copy.agent } satisfies FirstActionResponse)
    }

    // ── 4. Skapa kortet via cronarnas byggare
    const svar: FirstActionResponse = { kind: action.kind, headline: copy.headline, cta: copy.cta, agent: copy.agent }
    const extraPayload = { first_action_source: FIRST_ACTION_SOURCE, first_action: svar }

    if (action.kind === 'karin_overdue') {
      const inv = (invRes.data ?? []).find(r => r.invoice_id === action.invoiceId)
      if (!inv || !inv.invoice_number || !inv.due_date) return ingen()
      const cfg = await loadReminderConfig(supabase, businessId)
      const customer = action.customerId ? kunder.get(action.customerId) : null
      const step = composeReminderStep({
        inv: { ...inv, invoice_number: inv.invoice_number, due_date: inv.due_date, business_id: businessId },
        customer,
        cfg,
        today: now,
      })
      const kort = await createInvoiceReminderCard(supabase, { businessId, inv: { ...inv, invoice_number: inv.invoice_number, due_date: inv.due_date, business_id: businessId }, customer, step, extraPayload })
      if ('error' in kort) {
        await rapporteraTystFel(supabase, businessId, 'first-action:karin-card', kort.error, { invoiceId: action.invoiceId })
        return ingen()
      }
      if ('duplicate' in kort) {
        // Cronen hann före: peka på DESS kort i stället för att skapa ett till.
        const { data: befintligt } = await supabase
          .from('pending_approvals')
          .select('id')
          .eq('business_id', businessId)
          .eq('approval_type', 'invoice_reminder')
          .eq('status', 'pending')
          .contains('payload', { invoice_id: action.invoiceId })
          .limit(1)
        const id = befintligt?.[0]?.id
        return id ? NextResponse.json({ ...svar, approvalId: id } satisfies FirstActionResponse) : ingen()
      }
      return NextResponse.json({ ...svar, approvalId: kort.id } satisfies FirstActionResponse)
    }

    // Daniel — offert som väntat
    const { data: cfgRow } = await supabase
      .from('business_config')
      .select('contact_name')
      .eq('business_id', businessId)
      .maybeSingle()
    const namnArgs = { customerFirstName: action.customerName, contactFirstName: cfgRow?.contact_name ?? null }
    const message = action.opened ? buildOpenedQuoteFollowUpMessage(namnArgs) : buildUnopenedNudgeMessage(namnArgs)
    const kort = await createQuoteFollowUpCard(supabase, {
      businessId,
      quote: { quote_id: action.quoteId, title: action.title, customer_id: action.customerId },
      customer: { name: action.customerName, phone_number: action.customerPhone },
      message,
      amountKr: action.amountKr > 0 ? action.amountKr : null,
      daysSinceSent: action.daysSinceSent,
      extraPayload,
    })
    if ('error' in kort) {
      await rapporteraTystFel(supabase, businessId, 'first-action:daniel-card', kort.error, { quoteId: action.quoteId })
      return ingen()
    }
    if ('duplicate' in kort) {
      const { data: befintligt } = await supabase
        .from('pending_approvals')
        .select('id')
        .eq('business_id', businessId)
        .eq('approval_type', 'send_sms')
        .eq('status', 'pending')
        .contains('payload', { related_id: action.quoteId })
        .limit(1)
      const id = befintligt?.[0]?.id
      return id ? NextResponse.json({ ...svar, approvalId: id } satisfies FirstActionResponse) : ingen()
    }
    return NextResponse.json({ ...svar, approvalId: kort.id } satisfies FirstActionResponse)
  } catch (err: unknown) {
    await rapporteraTystFel(supabase, businessId, 'first-action:unexpected', err instanceof Error ? err.message : String(err))
    return ingen()
  }
}
