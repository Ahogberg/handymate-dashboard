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
 *    sats, bas, källa och tier-snapshot — plus append-only-rättelser.
 *  - Betalningsdrivet: basen är billing_event payment_succeeded (faktiskt
 *    betalt, ex moms) — ingen betalning, ingen rad, inga prismappar.
 *  - Idempotent: en fryst source_key per verifierat intäktsläge. Refunds,
 *    chargebacks och sena betalningar ändrar aldrig originalet utan ger en
 *    ny justeringsrad med originalets sats.
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
import {
  adjustmentSourceKey,
  reconcileCommissionBase,
} from './commission-reconciliation'
import { getHandymateBillingIdentityFromEnv } from './self-billing'

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
  const { start } = periodBounds(period)

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
      if (paidByBusiness.size === 0) continue

      // Befintliga rader används bara för idempotens. Avtalsmånaden härleds
      // nedan från converted_at + kalenderperiod och får aldrig påverkas av
      // hur många betalda månader/liggarrader som råkar finnas.
      const payingIds = Array.from(paidByBusiness.keys())
      const { data: ledgerRows, error: ledgerError } = await supabase
        .from('partner_commission_ledger')
        .select('id, business_id, period, entry_kind, base_amount_sek, rate, amount_sek')
        .eq('partner_id', partner.id)
        .in('business_id', payingIds)
        .eq('period', period)

      if (ledgerError) {
        errors.push(`Partner ${partner.id}: liggaren kunde inte läsas: ${ledgerError.message}`)
        continue
      }
      const existingByBusiness = new Map<string, typeof ledgerRows>()
      for (const row of ledgerRows || []) {
        const existing = existingByBusiness.get(row.business_id) || []
        existing.push(row)
        existingByBusiness.set(row.business_id, existing)
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
        if (paid.ore <= 0) return []
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

      const computedByBusiness = new Map(computeLedgerRows(config, customers).map(d => [d.businessId, d]))
      const rowsToRecord: Array<Record<string, unknown>> = []

      for (const businessId of payingIds) {
        const ref = refByBusiness.get(businessId)!
        const paid = paidByBusiness.get(businessId)!
        const customerMonth = commissionCalendarMonth(ref.converted_at, period)
        if (customerMonth < 1) continue
        const existing = existingByBusiness.get(businessId) || []
        const original = existing.find(row => row.entry_kind === 'accrual')

        if (!original) {
          const draft = computedByBusiness.get(businessId)
          if (!draft) continue
          rowsToRecord.push({
            business_id: draft.businessId,
            referral_id: draft.referralId,
            customer_month: draft.customerMonth,
            base_amount_sek: draft.baseAmountSek,
            rate: draft.rate,
            amount_sek: draft.amountSek,
            rate_source: draft.rateSource,
            tier_snapshot: draft.tierSnapshot,
            source_billing_event_ids: draft.billingEventIds,
            entry_kind: 'accrual',
            source_key: `accrual:${partner.id}:${businessId}:${period}`,
          })
          continue
        }

        const adjustment = reconcileCommissionBase(paid.ore / 100, existing.map(row => ({
          id: row.id,
          entryKind: row.entry_kind === 'adjustment' ? 'adjustment' : 'accrual',
          baseAmountSek: Number(row.base_amount_sek || 0),
          rate: Number(row.rate || 0),
        })))
        if (!adjustment) continue

        rowsToRecord.push({
          business_id: businessId,
          referral_id: ref.id,
          customer_month: customerMonth,
          base_amount_sek: adjustment.baseAmountSek,
          rate: adjustment.rate,
          amount_sek: adjustment.amountSek,
          rate_source: 'adjustment',
          tier_snapshot: { original_ledger_id: adjustment.adjustsLedgerId },
          source_billing_event_ids: paid.eventIds,
          entry_kind: adjustment.entryKind,
          source_key: adjustmentSourceKey({
            partnerId: partner.id,
            businessId,
            period,
            billingEventIds: paid.eventIds,
          }),
          adjusts_ledger_id: adjustment.adjustsLedgerId,
        })
      }

      if (rowsToRecord.length === 0) continue

      const { data: recorded, error: insertErr } = await supabase.rpc('record_partner_commission_rows', {
        p_partner_id: partner.id,
        p_period: period,
        p_rows: rowsToRecord,
      })

      if (insertErr) {
        errors.push(`Partner ${partner.id}: ${insertErr.message}`)
        continue
      }

      const insertedCount = Number(recorded?.inserted || 0)
      rowsInserted += insertedCount
      totalSek += Number(recorded?.amount_sek || 0)

      if (insertedCount > 0) {
        // Tidslinjehändelse (best effort — får aldrig fälla ackrualen).
        try {
          await supabase.from('partner_events').insert({
            partner_id: partner.id,
            business_id: String(rowsToRecord[0].business_id),
            event_type: 'provision_earned',
            amount_sek: Math.round(Number(recorded?.amount_sek || 0)),
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
  createdBy = 'system',
): Promise<{ success: boolean; batchId?: string; invoiceNumber?: string; subtotalSek?: number; vatSek?: number; totalSek?: number; error?: string }> {
  const supabase = getServerSupabase()
  let buyer
  try {
    buyer = getHandymateBillingIdentityFromEnv()
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }

  const { data, error } = await supabase.rpc('create_partner_self_billing_batch', {
    p_partner_id: partnerId,
    p_period: period,
    p_buyer: buyer,
    p_actor: createdBy,
  })
  if (error) return { success: false, error: error.message }
  return {
    success: true,
    batchId: data?.batch_id,
    invoiceNumber: data?.invoice_number,
    subtotalSek: Number(data?.subtotal_sek || 0),
    vatSek: Number(data?.vat_sek || 0),
    totalSek: Number(data?.total_sek || 0),
  }
}

/**
 * Markera en batch som utbetald: batchen → paid, raderna → paid + paid_at,
 * partnerns cachade totaler räknas om ur liggaren.
 *
 * paymentReference är obligatorisk (RPC:n avvisar tom sträng) — den manuella
 * banköverföringen (bankgiro/plusgiro/konto) ska lämna ett verkligt spår,
 * inte bara adminens namn. paidAt är valfri: låter admin ange det faktiska
 * betaldatumet separat från servertiden, om det skiljer sig.
 */
export async function markBatchPaid(
  batchId: string,
  paidBy: string,
  paymentReference: string,
  paidAt?: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServerSupabase()
  const { error } = await supabase.rpc('mark_partner_self_billing_paid', {
    p_batch_id: batchId,
    p_paid_by: paidBy,
    p_payment_reference: paymentReference,
    p_paid_at: paidAt || null,
  })
  if (error) return { success: false, error: error.message }
  return { success: true }
}
