/**
 * Provisionsorkestrering mot databasen (omskriven 2026-08-11).
 *
 * Den gamla processMonthlyCommissions kunde ALDRIG köra: den krävde
 * referrals.status='active' men partner-referrals fastnade i 'pending'
 * (aktiveringsbuggen i lib/referral/discounts.ts, fixad samma dag), hade
 * fel prisnyckel ('enterprise' i st.f. 'business') och skrev bara två
 * icke-atomära löpande summor utan spårbarhet. Allt det är ersatt av:
 *
 *  - partner_commission_ledger: EN rad per partner × kund × månad, med
 *    sats, bas, källa och tier-snapshot — självfaktureringsunderlaget.
 *  - Betalningsdrivet: basen är billing_event payment_succeeded (faktiskt
 *    betalt, ex moms) — ingen betalning, ingen rad, inga prismappar.
 *  - Idempotent: UNIQUE(partner_id, business_id, period) + ON CONFLICT
 *    DO NOTHING. Cronen kan köra varje natt; sena Stripe-betalningar för
 *    föregående månad plockas upp i efterföljande körningar. Redan
 *    skrivna rader behåller sin sats ("sats utvärderas vid första
 *    ackrual" — dokumenterat beteende, står i partneravtalet).
 *
 * Ren beräkningslogik ligger i commission-engine.ts (direkttestbar).
 */

import { getServerSupabase } from '@/lib/supabase'
import {
  computeLedgerRows,
  periodBounds,
  type CustomerPayment,
  type PartnerCommissionConfig,
  type TierStep,
} from './commission-engine'
import {
  commissionCalendarMonth,
  extractPartnerRevenueForPeriod,
} from './revenue-classification'

export { previousMonth } from './commission-engine'

export interface ProcessResult {
  period: string
  partnersProcessed: number
  rowsInserted: number
  totalSek: number
  errors: string[]
}

/**
 * Ackruera provision för en period ('YYYY-MM' — normalt föregående månad).
 * Körs nattligt från agent-context-cronen och on-demand från admin.
 */
export async function processCommissionPeriod(period: string): Promise<ProcessResult> {
  const supabase = getServerSupabase()
  const errors: string[] = []
  let rowsInserted = 0
  let totalSek = 0
  let partnersProcessed = 0

  if (!/^\d{4}-\d{2}$/.test(period)) {
    return { period, partnersProcessed: 0, rowsInserted: 0, totalSek: 0, errors: ['Ogiltig period — förväntar YYYY-MM'] }
  }
  const { start, end } = periodBounds(period)

  const { data: partners, error: partnerErr } = await supabase
    .from('partners')
    .select('id, commission_rate, commission_tiers, base_rate_after, tier_mode, ladder_months')
    .eq('status', 'active')

  if (partnerErr) {
    return { period, partnersProcessed: 0, rowsInserted: 0, totalSek: 0, errors: [partnerErr.message] }
  }

  for (const partner of partners || []) {
    try {
      // Konverterade referrals för partnern. Legacy-rader från den gamla
      // lead-agency-routen saknar riktigt business-id ('partner_…') och
      // filtreras bort — de kan aldrig matcha billing_events ändå.
      const { data: referrals, error: referralsError } = await supabase
        .from('referrals')
        .select('id, referred_business_id, converted_at, status')
        .eq('partner_id', partner.id)
        .not('converted_at', 'is', null)
        .not('referred_business_id', 'like', 'partner_%')

      if (referralsError) {
        errors.push(`Partner ${partner.id}: referrals kunde inte läsas: ${referralsError.message}`)
        continue
      }
      if (!referrals || referrals.length === 0) continue
      partnersProcessed++

      const businessIds = referrals.map(r => r.referred_business_id)
      const refByBusiness = new Map(referrals.map(r => [r.referred_business_id, r]))

      // Alla klassade intäktshändelser som kan bära en allocation till
      // perioden. Ingen nedre created_at-gräns: en årsbetalning i september
      // ska ge sin allocation även i augusti året därpå.
      const { data: events, error: eventsError } = await supabase
        .from('billing_event')
        .select('id, business_id, data, created_at')
        .in('event_type', ['payment_succeeded', 'payment_refunded', 'payment_chargeback'])
        .in('business_id', businessIds)
        .lt('created_at', end)

      if (eventsError) {
        errors.push(`Partner ${partner.id}: billing_event kunde inte läsas: ${eventsError.message}`)
        continue
      }
      if (!events || events.length === 0) continue

      // Summera bara versionsmärkta, klassade allocations. En gammal eller
      // okänd payment_succeeded-rad i målperioden blir ett synligt fel och
      // exakt 0 kr — aldrig fallback till invoice-totalen.
      const paidByBusiness = new Map<string, { ore: number; eventIds: string[] }>()
      for (const ev of events) {
        const extracted = extractPartnerRevenueForPeriod(ev.data, period)
        if (!extracted.hasSnapshot) {
          if (ev.created_at >= start) {
            errors.push(`Partner ${partner.id}: oklassad billing_event ${ev.id} — 0 kr provisionsgrundat`)
          }
          continue
        }
        if (extracted.amountExVatOre === 0) continue
        const curr = paidByBusiness.get(ev.business_id) || { ore: 0, eventIds: [] }
        curr.ore += extracted.amountExVatOre
        curr.eventIds.push(ev.id)
        paidByBusiness.set(ev.business_id, curr)
      }
      const nonPositiveBusinesses: string[] = []
      paidByBusiness.forEach((paid, businessId) => {
        if (paid.ore <= 0) nonPositiveBusinesses.push(businessId)
      })
      for (const businessId of nonPositiveBusinesses) paidByBusiness.delete(businessId)
      if (paidByBusiness.size === 0) continue

      // Befintliga rader används bara för idempotens. Avtalsmånaden härleds
      // nedan från converted_at + kalenderperiod och får aldrig påverkas av
      // hur många betalda månader/liggarrader som råkar finnas.
      const payingIds = Array.from(paidByBusiness.keys())
      const { data: ledgerRows, error: ledgerError } = await supabase
        .from('partner_commission_ledger')
        .select('business_id, period')
        .eq('partner_id', partner.id)
        .in('business_id', payingIds)

      if (ledgerError) {
        errors.push(`Partner ${partner.id}: liggaren kunde inte läsas: ${ledgerError.message}`)
        continue
      }
      const alreadyLedgered = new Set<string>()
      for (const row of ledgerRows || []) {
        if (row.period === period) alreadyLedgered.add(row.business_id)
      }

      // Bygg motorns indata: ALLA betalande kunder (även redan liggade —
      // de ska räknas i volymen/banden), insert sker bara för oliggade.
      const customers: CustomerPayment[] = payingIds.flatMap(bid => {
        const ref = refByBusiness.get(bid)!
        const paid = paidByBusiness.get(bid)!
        const customerMonth = commissionCalendarMonth(ref.converted_at, period)
        if (customerMonth < 1) {
          errors.push(`Partner ${partner.id}: ogiltig provisionsstart för referral ${ref.id}`)
          return []
        }
        return [{
          businessId: bid,
          referralId: ref.id,
          customerMonth,
          paidExMomsSek: paid.ore / 100,
          convertedAt: ref.converted_at,
          billingEventIds: paid.eventIds,
        }]
      })

      const config: PartnerCommissionConfig = {
        tiers: (partner.commission_tiers as TierStep[] | null) ?? null,
        legacyRate: partner.commission_rate || 0.2,
        baseRateAfter: partner.base_rate_after ?? 0,
        tierMode: partner.tier_mode === 'marginal' ? 'marginal' : 'book',
        ladderMonths: partner.ladder_months ?? 36,
      }

      const drafts = computeLedgerRows(config, customers)
        .filter(d => !alreadyLedgered.has(d.businessId))

      if (drafts.length === 0) continue

      const { data: inserted, error: insertErr } = await supabase
        .from('partner_commission_ledger')
        .upsert(
          drafts.map(d => ({
            partner_id: partner.id,
            business_id: d.businessId,
            referral_id: d.referralId,
            period,
            customer_month: d.customerMonth,
            base_amount_sek: d.baseAmountSek,
            rate: d.rate,
            amount_sek: d.amountSek,
            rate_source: d.rateSource,
            tier_snapshot: d.tierSnapshot,
            source_billing_event_ids: d.billingEventIds,
            status: 'accrued',
          })),
          { onConflict: 'partner_id,business_id,period', ignoreDuplicates: true },
        )
        .select('amount_sek')

      if (insertErr) {
        errors.push(`Partner ${partner.id}: ${insertErr.message}`)
        continue
      }

      const insertedCount = inserted?.length ?? 0
      rowsInserted += insertedCount
      totalSek += (inserted || []).reduce((s, r) => s + Number(r.amount_sek || 0), 0)

      if (insertedCount > 0) {
        await recomputePartnerTotals(partner.id)

        // Tidslinjehändelse (best effort — får aldrig fälla ackrualen).
        try {
          await supabase.from('partner_events').insert({
            partner_id: partner.id,
            business_id: drafts[0].businessId,
            event_type: 'provision_earned',
            amount_sek: Math.round((inserted || []).reduce((s, r) => s + Number(r.amount_sek || 0), 0)),
            meta: { period, rows: insertedCount },
          })
        } catch { /* non-blocking */ }
      }
    } catch (err: unknown) {
      errors.push(`Partner ${partner.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { period, partnersProcessed, rowsInserted, totalSek, errors }
}

/**
 * Räkna om partnerns cachade totalsummor SOM SUMMOR ur liggaren.
 * Ersätter den gamla icke-atomära inkrementeringen — liggaren är
 * sanningen, kolumnerna är bara visningscache.
 */
export async function recomputePartnerTotals(partnerId: string): Promise<void> {
  const supabase = getServerSupabase()

  const { data: rows } = await supabase
    .from('partner_commission_ledger')
    .select('amount_sek, status')
    .eq('partner_id', partnerId)

  let pending = 0
  let earned = 0
  for (const row of rows || []) {
    if (row.status === 'paid') earned += Number(row.amount_sek || 0)
    else pending += Number(row.amount_sek || 0)
  }

  await supabase
    .from('partners')
    .update({
      total_pending_sek: Math.round(pending),
      total_earned_sek: Math.round(earned),
    })
    .eq('id', partnerId)
}

/**
 * Skapa utbetalningsbatch (självfaktureringsunderlag) för en partner:
 * buntar alla accrued-rader t.o.m. angiven period, fryser underlaget i
 * batchens statement-JSONB och kopplar raderna till batchen.
 */
export async function createPayoutBatch(
  partnerId: string,
  period: string,
): Promise<{ success: boolean; batchId?: string; totalSek?: number; error?: string }> {
  const supabase = getServerSupabase()

  const { data: rows, error: rowsErr } = await supabase
    .from('partner_commission_ledger')
    .select('id, business_id, period, customer_month, base_amount_sek, rate, amount_sek, rate_source')
    .eq('partner_id', partnerId)
    .eq('status', 'accrued')
    .is('payout_batch_id', null)
    .lte('period', period)
    .order('period', { ascending: true })

  if (rowsErr) return { success: false, error: rowsErr.message }
  if (!rows || rows.length === 0) return { success: false, error: 'Inga upplupna rader att bunta' }

  const totalSek = Math.round(rows.reduce((s, r) => s + Number(r.amount_sek || 0), 0))

  // Kundnamn till underlaget (ett anrop, inte N+1).
  const bizIds = Array.from(new Set(rows.map(r => r.business_id)))
  const { data: businesses } = await supabase
    .from('business_config')
    .select('business_id, company_name, business_name')
    .in('business_id', bizIds)
  const nameFor = new Map((businesses || []).map(b => [b.business_id, b.company_name || b.business_name || b.business_id]))

  const statement = rows.map(r => ({
    kund: nameFor.get(r.business_id) || r.business_id,
    period: r.period,
    manad: r.customer_month,
    bas_sek: Number(r.base_amount_sek),
    sats: Number(r.rate),
    belopp_sek: Number(r.amount_sek),
    kalla: r.rate_source,
  }))

  const { data: batch, error: batchErr } = await supabase
    .from('partner_payout_batch')
    .insert({ partner_id: partnerId, period, total_sek: totalSek, statement, status: 'open' })
    .select('id')
    .single()

  if (batchErr) {
    // UNIQUE(partner_id, period) — en batch per period.
    return { success: false, error: batchErr.message }
  }

  const { error: linkErr } = await supabase
    .from('partner_commission_ledger')
    .update({ payout_batch_id: batch.id })
    .in('id', rows.map(r => r.id))

  if (linkErr) return { success: false, error: linkErr.message }

  return { success: true, batchId: batch.id, totalSek }
}

/**
 * Markera en batch som utbetald: batchen → paid, raderna → paid + paid_at,
 * partnerns cachade totaler räknas om ur liggaren.
 */
export async function markBatchPaid(
  batchId: string,
  paidBy: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServerSupabase()
  const now = new Date().toISOString()

  const { data: batch, error: batchErr } = await supabase
    .from('partner_payout_batch')
    .select('id, partner_id, status')
    .eq('id', batchId)
    .single()

  if (batchErr || !batch) return { success: false, error: batchErr?.message || 'Batch hittades inte' }
  if (batch.status === 'paid') return { success: false, error: 'Batchen är redan utbetald' }

  const { error: rowErr } = await supabase
    .from('partner_commission_ledger')
    .update({ status: 'paid', paid_at: now })
    .eq('payout_batch_id', batchId)

  if (rowErr) return { success: false, error: rowErr.message }

  const { error: updErr } = await supabase
    .from('partner_payout_batch')
    .update({ status: 'paid', paid_at: now, paid_by: paidBy })
    .eq('id', batchId)

  if (updErr) return { success: false, error: updErr.message }

  await recomputePartnerTotals(batch.partner_id)

  // Tidslinjehändelse (best effort).
  try {
    const { data: totalRow } = await supabase
      .from('partner_payout_batch')
      .select('total_sek')
      .eq('id', batchId)
      .single()
    await supabase.from('partner_events').insert({
      partner_id: batch.partner_id,
      business_id: 'system',
      event_type: 'provision_paid',
      amount_sek: Math.round(Number(totalRow?.total_sek || 0)),
      meta: { batch_id: batchId },
    })
  } catch { /* non-blocking */ }

  return { success: true }
}
