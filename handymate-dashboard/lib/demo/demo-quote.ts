import type { SupabaseClient } from '@supabase/supabase-js'
import { createQuote } from '@/lib/quotes/create-quote'
import { getOrCreatePortalLink } from '@/lib/portal-link'
import { buildQuoteSmsText } from '@/lib/quotes/quote-sms'
import { sendSmsViaElks } from '@/lib/sms-send'
import { ensureDefaultStages, ensureDealForQuote } from '@/lib/pipeline'

/**
 * Demo-offerten på handymate.se (yta 9, Design "Demo-offert block.dc.html",
 * brief docs/design/briefs/09-demo-offert-till-dig-sjalv.md).
 *
 * Besökaren skriver namn + mobilnummer och får en RIKTIG offert från ett
 * fast demo-företag ("Ekström Bygg AB", sql/v223_demo_offert.sql) — samma
 * SMS-text, samma kundportal, samma signering och samma efterarbete
 * (projekt + vunnen affär via finalizeAcceptedQuote) som en betalande
 * hantverkares kund får. Inget är mockat: det är det som är poängen.
 *
 * Vad som INTE finns här:
 *   - Tak och validering — de bor i routen (app/api/public/demo-quote).
 *   - Städning — lib/demo/demo-quote-cleanup.ts (maintenance-cronen).
 *
 * Demo-företaget är ett vanligt business_config med is_demo_tenant = true,
 * subscription_plan 'professional' (bränslemätaren kräver en plan) och
 * agents_globally_paused = true (ingen agent ska jaga demo-kunder).
 * automation_settings-raden har sms_auto_enabled = false så förfallo-
 * nudgen i quote-follow-up aldrig går ut.
 */

import {
  DEMO_QUOTE_BUSINESS_ID,
  DEMO_QUOTE_ITEMS,
  DEMO_QUOTE_PROJECT_ADDRESS,
  DEMO_QUOTE_TITLE,
  DEMO_QUOTE_VALID_DAYS,
  demoLandingUrl,
  demoQuoteTotals,
} from '@/lib/demo/demo-quote-data'

export * from '@/lib/demo/demo-quote-data'

export interface DemoQuoteBusinessRow {
  business_id: string
  business_name: string
  phone_number: string | null
  assigned_phone_number: string | null
  is_demo_tenant: boolean | null
  default_vat_rate: number | null
}

export type SkapaDemoOffertResult =
  | { ok: true; signToken: string; quoteId: string; quoteNumber: string; customerId: string; smsId: string | null }
  | { ok: false; error: string; status: 500 | 503 }

/**
 * Skapar kund + offert + affär i demo-företaget och skickar offert-SMS:et.
 * Ordningen är samma som app/api/quotes/send: portal-länk → SMS →
 * customer_activity → status sent → deal i quote_sent.
 *
 * Misslyckas SMS:et (saldo slut, tak, ogiltigt nummer) rullas kunden och
 * offerten INTE tillbaka — de städas av cron-svepet. Anroparen får
 * ok:false och visar "Vi kunde inte skicka just nu".
 */
export async function skapaOchSkickaDemoOffert(
  supabase: SupabaseClient,
  input: { name: string; phone: string },
): Promise<SkapaDemoOffertResult> {
  const { data: biz, error: bizErr } = await supabase
    .from('business_config')
    .select('business_id, business_name, phone_number, assigned_phone_number, is_demo_tenant, default_vat_rate')
    .eq('business_id', DEMO_QUOTE_BUSINESS_ID)
    .maybeSingle()

  // Fail-closed: utan demo-företaget (v223 ej körd) eller om någon råkat
  // slå av is_demo_tenant skapar vi INGENTING — då hade städningen aldrig
  // fått radera raderna heller.
  if (bizErr || !biz || biz.is_demo_tenant !== true) {
    console.error('[demo-quote] demo-företaget saknas eller är inte markerat som demo:', bizErr?.message || DEMO_QUOTE_BUSINESS_ID)
    return { ok: false, error: 'Demo-företaget är inte redo', status: 503 }
  }
  const business = biz as DemoQuoteBusinessRow
  const vatRate = business.default_vat_rate ?? 25
  const totals = demoQuoteTotals(vatRate)

  // ── Kunden = besökaren ─────────────────────────────────────────────
  const customerId = 'cust_' + Math.random().toString(36).substring(2, 11)
  const { error: custErr } = await supabase.from('customer').insert({
    customer_id: customerId,
    business_id: DEMO_QUOTE_BUSINESS_ID,
    name: input.name,
    phone_number: input.phone,
  })
  if (custErr) {
    console.error('[demo-quote] kund kunde inte skapas:', custErr.message)
    return { ok: false, error: 'Kunden kunde inte skapas', status: 500 }
  }

  // ── Offerten — genom den kanoniska byggaren ────────────────────────
  const created = await createQuote(supabase, DEMO_QUOTE_BUSINESS_ID, {
    customerId,
    title: DEMO_QUOTE_TITLE,
    description: 'Totalrenovering av badrum ca 5 kvm: rivning, nya VVS-dragningar, tätskikt, kakel och klinker, el med golvvärme.',
    status: 'sent',
    items: DEMO_QUOTE_ITEMS,
    vatRate,
    rotRutType: 'rot',
    rotRutDeduction: totals.rotDeduction,
    validDays: DEMO_QUOTE_VALID_DAYS,
    source: 'system',
    extra: {
      rot_work_cost: totals.rotWorkCost,
      rot_deduction: totals.rotDeduction,
      rot_customer_pays: totals.customerPays,
      rot_rut_eligible: true,
      customer_pays: totals.customerPays,
      project_address: DEMO_QUOTE_PROJECT_ADDRESS,
      detail_level: 'detailed',
      show_unit_prices: true,
      show_quantities: true,
      sent_at: new Date().toISOString(),
    },
  })
  if (!created.success || !created.quoteId || !created.signToken || !created.quoteNumber) {
    console.error('[demo-quote] offerten kunde inte skapas:', created.error)
    return { ok: false, error: 'Offerten kunde inte skapas', status: 500 }
  }
  const quote = created.quote as Record<string, any>

  // ── Portal-länk + SMS — EXAKT samma text som en riktig offert ──────
  const portalUrl = await getOrCreatePortalLink(supabase, customerId, 'quotes')
  if (!portalUrl) {
    return { ok: false, error: 'Portal-länken kunde inte skapas', status: 500 }
  }
  const message = buildQuoteSmsText({
    customerName: input.name,
    businessName: business.business_name,
    businessPhone: business.phone_number,
    assignedPhoneNumber: business.assigned_phone_number,
    total: Number(quote.total ?? totals.total),
    customerPays: Number(quote.customer_pays ?? totals.customerPays),
    rotRutType: 'rot',
    validUntil: (quote.valid_until as string) || null,
    portalUrl,
  })

  const sms = await sendSmsViaElks({
    supabase,
    businessId: DEMO_QUOTE_BUSINESS_ID,
    businessName: business.business_name,
    to: input.phone,
    message,
    customerId,
    relatedId: created.quoteId,
    messageType: 'quote',
    recipient: 'customer',
    purpose: 'transactional',
  })
  if (!sms.success) {
    console.error('[demo-quote] offert-SMS misslyckades:', sms.error, sms.blockedReason)
    return { ok: false, error: 'SMS:et kunde inte skickas', status: 503 }
  }

  await supabase.from('customer_activity').insert({
    activity_id: 'act_' + Math.random().toString(36).substring(2, 11),
    customer_id: customerId,
    business_id: DEMO_QUOTE_BUSINESS_ID,
    activity_type: 'sms_sent',
    title: 'Offert skickad via SMS',
    description: `Offert "${DEMO_QUOTE_TITLE}" skickad till ${input.phone} (demo-offert från handymate.se)`,
    created_by: 'system',
  })

  // Affären i quote_sent så att "affär vunnen" i efteråt-vyn är en riktig
  // deal-flytt (finalizeAcceptedQuote → moveDeal 'won'), inte ett påstående.
  try {
    await ensureDefaultStages(DEMO_QUOTE_BUSINESS_ID)
    await ensureDealForQuote({
      businessId: DEMO_QUOTE_BUSINESS_ID,
      quoteId: created.quoteId,
      customerId,
      title: DEMO_QUOTE_TITLE,
      value: totals.total,
    })
  } catch (err) {
    console.error('[demo-quote] deal kunde inte skapas (icke-blockerande):', err)
  }

  return {
    ok: true,
    signToken: created.signToken,
    quoteId: created.quoteId,
    quoteNumber: created.quoteNumber,
    customerId,
    smsId: sms.smsId ?? null,
  }
}

/**
 * SMS 2 — efter godkännandet. Anropas från finalizeAcceptedQuote ENDAST när
 * offertens business är demo-företaget. Avsändare Handymate (inte Ekström):
 * det är vi som pratar med prospektet nu, om vad som just hände.
 *
 * Påstår bara det som faktiskt utfördes: projekt skapat och affär vunnen
 * kommer ur finalize-resultatet. Ingen bekräftelse till "kunden" nämns —
 * demo-kunden har ingen e-post, så bekräftelsemejlet skickas aldrig.
 */
export async function skickaDemoEfterSms(
  supabase: SupabaseClient,
  input: {
    quoteId: string
    customerId: string | null
    customerPhone: string | null
    projectCreated: boolean
    dealMoved: boolean
  },
): Promise<{ sent: boolean; error?: string }> {
  // Portalvägen (app/api/portal/route.ts) skickar inte customerPhone till
  // finalize — läs kundens nummer ur offerten när det saknas.
  const { data: quote } = await supabase
    .from('quotes')
    .select('sign_token, customer_id, customer:customer_id (phone_number)')
    .eq('quote_id', input.quoteId)
    .eq('business_id', DEMO_QUOTE_BUSINESS_ID)
    .maybeSingle()
  if (!quote?.sign_token) return { sent: false, error: 'Offerten saknar token' }
  const kund = (quote as any).customer
  const kundTelefon: string | null = input.customerPhone
    || (Array.isArray(kund) ? kund[0]?.phone_number : kund?.phone_number)
    || null
  if (!kundTelefon) return { sent: false, error: 'Kunden saknar telefonnummer' }

  const hande: string[] = []
  if (input.projectCreated) hande.push('projektet skapades')
  if (input.dealMoved) hande.push('affären markerades som vunnen')
  const efterarbete = hande.length > 0
    ? ` Hos Ekström Bygg ${hande.join(' och ')} i samma sekund, utan att någon rörde ett tangentbord.`
    : ''

  const message = `Klart. Offerten är godkänd.${efterarbete}

Se vad som hände:
${demoLandingUrl(quote.sign_token)}

//Handymate`

  const r = await sendSmsViaElks({
    supabase,
    businessId: DEMO_QUOTE_BUSINESS_ID,
    businessName: 'Handymate',
    to: kundTelefon,
    message,
    customerId: input.customerId ?? (quote.customer_id as string | null),
    relatedId: input.quoteId,
    messageType: 'demo_quote_after',
    recipient: 'customer',
    purpose: 'transactional',
  })
  if (!r.success) console.error('[demo-quote] efter-SMS misslyckades:', r.error, r.blockedReason)
  return { sent: r.success, error: r.error }
}
