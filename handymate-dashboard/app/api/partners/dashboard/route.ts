import { NextRequest, NextResponse } from 'next/server'
import { getPartnerFromToken, getPartnerTokenFromRequest } from '@/lib/partners/auth'
import { getServerSupabase } from '@/lib/supabase'
import { deriveActivityLevel, AKTIVITETS_ETIKETT, type ActivityLevel } from '@/lib/partners/activity'
import type { TierStep } from '@/lib/partners/commission-engine'
import { AGREEMENT_VERSION, hasAcceptedCurrentAgreement } from '@/lib/partners/agreement'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET /api/partners/dashboard — portalens hela payload.
 *
 * Omskriven 2026-08-11 (partnerprogram v2):
 *  - Läcker INTE längre webhook_secret/rå api_key till webbläsaren
 *    (maskerad nyckel + has_webhook_secret; hemligheten hämtas on-demand
 *    via GET /api/partners/webhook när inställningsmodalen öppnas).
 *  - N+1-frågorna mot business_config ersatta med en batchad .in().
 *  - Statistik och per-kund-provision kommer ur partner_commission_ledger
 *    (riktiga ackruerade belopp) — inte ur den gamla fabricerade
 *    listpris × sats-beräkningen.
 *  - Varje kund får activity_level (onboardar/aktiv/inaktiv/churnad) och
 *    partnerns uppföljningar 1/2/3. Inga kundbelopp exponeras.
 */
export async function GET(request: NextRequest) {
  const token = getPartnerTokenFromRequest(request)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const partner = await getPartnerFromToken(token)
  if (!partner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  const { data: fullPartner } = await supabase
    .from('partners')
    .select('id, name, company, email, referral_code, referral_url, commission_rate, commission_tiers, base_rate_after, tier_mode, ladder_months, total_earned_sek, total_pending_sek, api_key, webhook_url, webhook_secret, webhook_events, self_billing_legal_name, self_billing_org_number, self_billing_registered_address, self_billing_vat_number, self_billing_vat_registered, self_billing_vat_rate, self_billing_f_tax_approved, self_billing_email, payout_bankgiro, payout_plusgiro, payout_account')
    .eq('id', partner.id)
    .single()

  const { data: referrals } = await supabase
    .from('referrals')
    .select('id, referred_business_id, referred_email, status, created_at, converted_at')
    .eq('partner_id', partner.id)
    .order('created_at', { ascending: false })

  const realRefs = (referrals || []).filter(
    r => r.referred_business_id && r.referred_business_id !== 'PARTNER' && !r.referred_business_id.startsWith('partner_')
  )
  const bizIds = realRefs.map(r => r.referred_business_id)

  // Batchade uppslag — ett anrop per tabell, inte per referral.
  const [bizRes, ledgerRes, followupRes, eventsRes, paymentsRes, batchesRes] = await Promise.all([
    bizIds.length
      ? supabase.from('business_config')
          .select('business_id, company_name, business_name, subscription_status, onboarding_completed_at, referred_by')
          .in('business_id', bizIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('partner_commission_ledger')
      .select('business_id, period, customer_month, rate, amount_sek, rate_source, status')
      .eq('partner_id', partner.id)
      .order('period', { ascending: false }),
    supabase.from('partner_followups')
      .select('business_id, followup_nr, done_at, note')
      .eq('partner_id', partner.id),
    supabase.from('partner_events')
      .select('id, business_id, event_type, created_at, meta')
      .eq('partner_id', partner.id)
      .order('created_at', { ascending: false })
      .limit(100),
    bizIds.length
      ? supabase.from('billing_event')
          .select('business_id, created_at')
          .eq('event_type', 'payment_succeeded')
          .in('business_id', bizIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('partner_payout_batch')
      .select('id, period, invoice_number, invoice_date, due_date, subtotal_sek, vat_sek, total_incl_vat_sek, delivery_status, review_status, reviewed_at, dispute_reason, status, paid_at')
      .eq('partner_id', partner.id)
      .not('invoice_number', 'is', null)
      .order('invoice_date', { ascending: false }),
  ])

  const bizFor = new Map((bizRes.data || []).map((b: any) => [b.business_id, b]))
  const lastPaymentFor = new Map<string, string>()
  for (const p of paymentsRes.data || []) {
    if (!lastPaymentFor.has(p.business_id)) lastPaymentFor.set(p.business_id, p.created_at)
  }

  const ledgerByBiz = new Map<string, any[]>()
  for (const row of ledgerRes.data || []) {
    const list = ledgerByBiz.get(row.business_id) || []
    list.push(row)
    ledgerByBiz.set(row.business_id, list)
  }

  const followupsByBiz = new Map<string, any[]>()
  for (const f of followupRes.data || []) {
    const list = followupsByBiz.get(f.business_id) || []
    list.push({ nr: f.followup_nr, done_at: f.done_at, note: f.note })
    followupsByBiz.set(f.business_id, list)
  }

  const ladderMonths = fullPartner?.ladder_months ?? 36

  const enrichedReferrals = realRefs.map(ref => {
    const biz = bizFor.get(ref.referred_business_id)
    const ledger = ledgerByBiz.get(ref.referred_business_id) || []
    const senaste = ledger[0] || null
    // Referral-statusen är auktoritativ för churn — den sätts av
    // billing-webhooken och vinner över den härledda nivån.
    const activity: ActivityLevel = deriveActivityLevel({
      subscriptionStatus: biz?.subscription_status ?? null,
      onboardingCompletedAt: biz?.onboarding_completed_at ?? null,
      lastPaymentAt: lastPaymentFor.get(ref.referred_business_id) ?? null,
    })

    return {
      id: ref.id,
      business_id: ref.referred_business_id,
      email: ref.referred_email,
      business_name: biz?.company_name || biz?.business_name || null,
      status: ref.status,
      created_at: ref.created_at,
      converted_at: ref.converted_at,
      referred_by: biz?.referred_by || null,
      activity_level: ref.status === 'churned' ? 'churnad' : activity,
      activity_label: AKTIVITETS_ETIKETT[ref.status === 'churned' ? 'churnad' : activity],
      // Provisionsläget för kunden — ur liggaren, inga kundbelopp.
      customer_month: senaste?.customer_month ?? 0,
      ladder_months: ladderMonths,
      current_rate: senaste ? Number(senaste.rate) : null,
      on_base_rate: senaste ? senaste.rate_source === 'base_rate' : false,
      earned_total_sek: ledger.reduce((s, r) => s + Number(r.amount_sek || 0), 0),
      followups: followupsByBiz.get(ref.referred_business_id) || [],
    }
  })

  // Underlag per period (kund × månad × sats × belopp) för portalens
  // provisionssektion — partnerns egna rader, utan basbelopp.
  const nameForStatement = (bid: string) => {
    const b = bizFor.get(bid)
    return b?.company_name || b?.business_name || bid
  }
  const statementByPeriod = new Map<string, { rows: any[]; total: number; all_paid: boolean }>()
  for (const row of ledgerRes.data || []) {
    const entry = statementByPeriod.get(row.period) || { rows: [], total: 0, all_paid: true }
    entry.rows.push({
      kund: nameForStatement(row.business_id),
      manad: row.customer_month,
      sats: Number(row.rate),
      belopp_sek: Number(row.amount_sek),
      status: row.status,
    })
    entry.total += Number(row.amount_sek || 0)
    if (row.status !== 'paid') entry.all_paid = false
    statementByPeriod.set(row.period, entry)
  }
  const statements = Array.from(statementByPeriod.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([period, s]) => ({ period, rows: s.rows, total_sek: Math.round(s.total), all_paid: s.all_paid }))

  // Statistik ur liggaren + aktivitetsnivåerna.
  const activeCustomers = enrichedReferrals.filter(r => r.activity_level === 'aktiv').length
  const pendingSek = (ledgerRes.data || [])
    .filter(r => r.status !== 'paid')
    .reduce((s, r) => s + Number(r.amount_sek || 0), 0)
  const earnedSek = (ledgerRes.data || [])
    .filter(r => r.status === 'paid')
    .reduce((s, r) => s + Number(r.amount_sek || 0), 0)

  // Trappinfo till UI:t ("Din nivå denna månad: 25 % — 6+ aktiva kunder").
  const tiers = (fullPartner?.commission_tiers as TierStep[] | null) ?? null
  let currentTierRate: number | null = null
  if (Array.isArray(tiers) && tiers.length > 0) {
    const sorted = [...tiers].sort((a, b) => a.min - b.min)
    currentTierRate = sorted[0].rate
    for (const t of sorted) if (t.min <= activeCustomers) currentTierRate = t.rate
  } else {
    currentTierRate = fullPartner?.commission_rate ?? 0.2
  }

  // Events-tidslinje per business (för de expanderbara korten).
  const eventsByBusiness: Record<string, any[]> = {}
  for (const evt of eventsRes.data || []) {
    const bizId = evt.business_id || 'unknown'
    if (!eventsByBusiness[bizId]) eventsByBusiness[bizId] = []
    eventsByBusiness[bizId].push(evt)
  }

  const apiKey: string | null = fullPartner?.api_key || null
  const billingProfile = {
    self_billing_legal_name: fullPartner?.self_billing_legal_name || null,
    self_billing_org_number: fullPartner?.self_billing_org_number || null,
    self_billing_registered_address: fullPartner?.self_billing_registered_address || null,
    self_billing_vat_number: fullPartner?.self_billing_vat_number || null,
    self_billing_vat_registered: fullPartner?.self_billing_vat_registered ?? null,
    self_billing_vat_rate: fullPartner?.self_billing_vat_rate === null || fullPartner?.self_billing_vat_rate === undefined ? null : Number(fullPartner.self_billing_vat_rate),
    self_billing_f_tax_approved: fullPartner?.self_billing_f_tax_approved ?? null,
    self_billing_email: fullPartner?.self_billing_email || null,
    payout_bankgiro: fullPartner?.payout_bankgiro || null,
    payout_plusgiro: fullPartner?.payout_plusgiro || null,
    payout_account: fullPartner?.payout_account || null,
  }
  const billingProfileComplete = Boolean(
    billingProfile.self_billing_legal_name
    && billingProfile.self_billing_org_number
    && billingProfile.self_billing_registered_address
    && billingProfile.self_billing_email
    && typeof billingProfile.self_billing_vat_registered === 'boolean'
    && typeof billingProfile.self_billing_f_tax_approved === 'boolean'
    && billingProfile.self_billing_vat_rate !== null
    && (billingProfile.payout_bankgiro || billingProfile.payout_plusgiro || billingProfile.payout_account)
    && (billingProfile.self_billing_vat_registered === false || billingProfile.self_billing_vat_number)
  )

  return NextResponse.json({
    partner: {
      id: partner.id,
      name: fullPartner?.name || partner.name,
      company: fullPartner?.company || partner.company,
      email: partner.email,
      referral_code: partner.referral_code,
      referral_url: partner.referral_url,
      commission_tiers: tiers,
      base_rate_after: fullPartner?.base_rate_after ?? 0,
      tier_mode: fullPartner?.tier_mode ?? 'book',
      ladder_months: ladderMonths,
      legacy_commission_rate: fullPartner?.commission_rate ?? 0.2,
      total_earned_sek: Math.round(earnedSek),
      total_pending_sek: Math.round(pendingSek),
      // Säkerhet (2026-08-11): hemligheterna skickas INTE i portalpayloaden.
      api_key_masked: apiKey ? `••••${apiKey.slice(-4)}` : null,
      has_webhook_secret: Boolean(fullPartner?.webhook_secret),
      webhook_url: fullPartner?.webhook_url || null,
      webhook_events: fullPartner?.webhook_events || ['trial_started', 'converted', 'plan_upgraded', 'churned'],
      // Avtalsgrind (P0-9, 2026-09-01): partners registrerade före Partneravtal v1
      // möts av AgreementGate i portalen tills acceptansen är loggad.
      agreement_version: partner.agreement_version,
      agreement_required: !hasAcceptedCurrentAgreement(partner),
      current_agreement_version: AGREEMENT_VERSION,
      billing_profile: billingProfile,
      billing_profile_complete: billingProfileComplete,
    },
    stats: {
      total_referred: enrichedReferrals.length,
      active_customers: activeCustomers,
      total_converted: enrichedReferrals.filter(r => r.converted_at).length,
      pending_commission_sek: Math.round(pendingSek),
      total_earned_sek: Math.round(earnedSek),
      current_tier_rate: currentTierRate,
    },
    referrals: enrichedReferrals,
    statements,
    self_billing_batches: (batchesRes.data || []).map(batch => ({
      ...batch,
      subtotal_sek: Number(batch.subtotal_sek || 0),
      vat_sek: Number(batch.vat_sek || 0),
      total_incl_vat_sek: Number(batch.total_incl_vat_sek || 0),
    })),
    events_by_business: eventsByBusiness,
  })
}
