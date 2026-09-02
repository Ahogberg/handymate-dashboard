import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { isPartnerReferralCode } from '../lib/partners/attribution'
import {
  classifyPaidInvoice,
  commissionCalendarMonth,
  extractPartnerRevenueForPeriod,
  reverseRevenueSnapshot,
} from '../lib/partners/revenue-classification'
import { computeLedgerRows } from '../lib/partners/commission-engine'
import { reconcileCommissionBase } from '../lib/partners/commission-reconciliation'
import { buildSelfBillingDocument } from '../lib/partners/self-billing'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const finalPayoutSql = read('sql/v205_partner_final_payout.sql')
const billingNameFixSql = read('sql/v206_partner_self_billing_business_name.sql')

test.describe('Partner Launch Gate — attributionen är en enda sanningsgräns', () => {
  test('bara riktiga P-koder går till partnerclaimen', () => {
    expect(isPartnerReferralCode('P-BYG-1234')).toBe(true)
    expect(isPartnerReferralCode(' p-byg-1234 ')).toBe(true)
    expect(isPartnerReferralCode('KUND-1234')).toBe(false)
    expect(isPartnerReferralCode(null)).toBe(false)
  })

  test('registreringsbody kan inte skriva partnerkoden direkt', () => {
    const route = read('app/api/auth/route.ts')
    expect(route).toContain('claimPartnerAttribution(supabaseAdmin')
    expect(route).toContain("referred_by: referralCode && !isPartnerReferralCode(referralCode) ? referralCode : null")

    const partnerBranch = route.slice(
      route.indexOf('if (isPartnerReferralCode(referralCode))'),
      route.indexOf('// Customer-to-customer referral'),
    )
    expect(partnerBranch).not.toContain(".from('referrals')")
    expect(partnerBranch).not.toContain('.insert(')
  })

  test('v204 avgör self-referral, 180 dagar och vinnande partner före INSERT', () => {
    const sql = read('sql/v204_partner_attribution_claim.sql')
    const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.claim_partner_attribution'))
    const referralInsert = fn.indexOf('INSERT INTO public.referrals')

    expect(fn.indexOf("v_reason := 'self_referral'")).toBeGreaterThan(0)
    expect(fn.indexOf("INTERVAL '180 days'")).toBeGreaterThan(0)
    expect(fn.indexOf("v_reason := 'existing_sales_relationship'")).toBeGreaterThan(0)
    expect(fn.indexOf("v_reason := 'existing_handymate_account'")).toBeGreaterThan(0)
    expect(fn.indexOf("v_reason := 'already_attributed'")).toBeGreaterThan(0)
    expect(fn.indexOf("v_reason := 'self_referral'")).toBeLessThan(referralInsert)
    expect(fn.indexOf("INTERVAL '180 days'")).toBeLessThan(referralInsert)
    expect(fn.indexOf("v_reason := 'already_attributed'")).toBeLessThan(referralInsert)
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS referrals_one_partner_per_business')
  })

  test('RPC och beslutslogg är service-role-only', () => {
    const sql = read('sql/v204_partner_attribution_claim.sql')
    expect(sql).toContain('SECURITY DEFINER')
    expect(sql).toContain('SET search_path = public, pg_temp')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.claim_partner_attribution(TEXT, TEXT, TEXT)')
    expect(sql).toContain('FROM PUBLIC, anon, authenticated')
    expect(sql).toContain('TO service_role')
    expect(sql).toContain('REVOKE ALL ON TABLE public.partner_attribution_decision FROM PUBLIC, anon, authenticated')
  })

  test('leadsbyrå-API:t skapar aldrig ekonomiska placeholder-rader', () => {
    const route = read('app/api/partners/referral/route.ts')
    expect(route).toContain('referral_code')
    expect(route).toContain("agreement_version !== AGREEMENT_VERSION")
    expect(route).toContain("attribution_status: 'pending_signup'")
    expect(route).not.toContain(".from('referrals')")
    expect(route).not.toContain('referred_business_id: trackingId')
  })
})

test.describe('Partner Launch Gate — en sammanhängande pengakedja', () => {
  const priceIds = new Set(['price_professional', 'price_professional_yearly'])
  const monthlyInvoice = {
    id: 'in_partner_launch_gate',
    currency: 'sek',
    amount_paid: 599_500,
    total_excluding_tax: 599_500,
    subscription_details: { metadata: { business_id: 'biz_partner_customer', plan_id: 'professional' } },
    lines: { data: [{
      id: 'il_core',
      amount: 599_500,
      amount_excluding_tax: 599_500,
      price: { id: 'price_professional' },
      period: {
        start: Date.parse('2026-09-01T00:00:00Z') / 1000,
        end: Date.parse('2026-10-01T00:00:00Z') / 1000,
      },
    }] },
  }

  test('betalning → 20 % → partiell refund → fryst självfaktura utan differens', () => {
    const paid = classifyPaidInvoice(monthlyInvoice, { corePriceIds: priceIds })
    const paidPeriod = extractPartnerRevenueForPeriod({ partner_revenue: paid }, '2026-09')
    expect(paidPeriod).toEqual({ hasSnapshot: true, amountExVatOre: 599_500 })

    const rows = computeLedgerRows({
      tiers: [{ min: 0, rate: 0.2 }],
      legacyRate: 0.2,
      baseRateAfter: 0,
      tierMode: 'book',
      ladderMonths: 36,
    }, [{
      businessId: 'biz_partner_customer',
      referralId: 'ref_partner_customer',
      customerMonth: commissionCalendarMonth('2026-09-01T00:00:00Z', '2026-09'),
      paidExMomsSek: paidPeriod.amountExVatOre / 100,
      convertedAt: '2026-09-01T00:00:00Z',
      billingEventIds: ['evt_paid'],
    }])
    expect(rows).toHaveLength(1)
    expect(rows[0].amountSek).toBe(1_199)

    const refund = reverseRevenueSnapshot(paid, 'refund', 0.25)
    const refundPeriod = extractPartnerRevenueForPeriod({ partner_revenue: refund }, '2026-09')
    const desiredNetSek = (paidPeriod.amountExVatOre + refundPeriod.amountExVatOre) / 100
    const adjustment = reconcileCommissionBase(desiredNetSek, [{
      id: 'ledger_original',
      entryKind: 'accrual',
      baseAmountSek: rows[0].baseAmountSek,
      rate: rows[0].rate,
    }])
    expect(adjustment?.amountSek).toBe(-299.75)

    const document = buildSelfBillingDocument({
      invoiceNumber: 'SF-2026-PROOF-0001',
      invoiceDate: '2026-09-30',
      seller: {
        legalName: 'Partner Proof AB',
        organizationNumber: '556000-0000',
        registeredAddress: 'Partnergatan 1, 111 11 Stockholm',
        vatNumber: 'SE556000000001',
        email: 'ekonomi@partner-proof.se',
        vatRegistered: true,
        vatRate: 0.25,
        fTaxApproved: true,
        payoutReference: 'Bankgiro 123-4567',
      },
      buyer: {
        legalName: 'Handymate Proof AB',
        organizationNumber: '559000-0000',
        registeredAddress: 'Handymategatan 1, 111 11 Stockholm',
        vatNumber: 'SE559000000001',
        email: 'ekonomi@handymate.se',
      },
      rows: [
        { customerName: 'Kundbolaget', period: '2026-09', customerMonth: 1, baseSek: 5_995, rate: 0.2, commissionSek: 1_199, kind: 'accrual' },
        { customerName: 'Kundbolaget', period: '2026-09', customerMonth: 1, baseSek: -1_498.75, rate: 0.2, commissionSek: -299.75, kind: 'adjustment' },
      ],
    })
    expect(document.subtotalSek).toBe(899.25)
    expect(document.vatSek).toBe(224.81)
    expect(document.totalSek).toBe(1_124.06)
  })

  test('årsplan periodiseras, churn pausar inte klockan och månad 37 ger 0 %', () => {
    const yearly = classifyPaidInvoice({
      ...monthlyInvoice,
      amount_paid: 5_995_000,
      total_excluding_tax: 5_995_000,
      lines: { data: [{
        ...monthlyInvoice.lines.data[0],
        amount: 5_995_000,
        amount_excluding_tax: 5_995_000,
        price: { id: 'price_professional_yearly' },
        period: {
          start: Date.parse('2026-09-01T00:00:00Z') / 1000,
          end: Date.parse('2027-09-01T00:00:00Z') / 1000,
        },
      }] },
    }, { corePriceIds: priceIds })
    expect(yearly.lines[0].allocations).toHaveLength(12)
    expect(yearly.lines[0].allocations.reduce((sum, item) => sum + item.amountExVatOre, 0)).toBe(5_995_000)

    expect(commissionCalendarMonth('2026-09-01T00:00:00Z', '2029-08')).toBe(36)
    expect(commissionCalendarMonth('2026-09-01T00:00:00Z', '2029-09')).toBe(37)
    const tail = computeLedgerRows({
      tiers: [{ min: 0, rate: 0.2 }], legacyRate: 0.2, baseRateAfter: 0, tierMode: 'book', ladderMonths: 36,
    }, [{
      businessId: 'biz_tail', referralId: 'ref_tail', customerMonth: 37,
      paidExMomsSek: 5_995, convertedAt: '2026-09-01T00:00:00Z', billingEventIds: ['evt_tail'],
    }])
    expect(tail[0].rate).toBe(0)
    expect(tail[0].amountSek).toBe(0)
  })
})

test.describe('Partner Launch Gate — avtalsenlig slututbetalning', () => {
  test('självfakturan och partnerns läsvägar använder business_configs verkliga namnkolumn', () => {
    expect(billingNameFixSql).toContain("NULLIF(b.business_name, '')")
    expect(billingNameFixSql).not.toContain('b.company_name')

    for (const file of [
      'app/api/partners/dashboard/route.ts',
      'app/api/admin/partners/commission/route.ts',
      'lib/partners/webhook.ts',
    ]) {
      const source = read(file)
      expect(source).toContain('business_name')
      expect(source).not.toContain('company_name')
    }
  })

  test('ordinarie underlag behåller 500-kronorsgränsen men explicit slututbetalning får passera', () => {
    expect(finalPayoutSql).toContain('IF v_subtotal < 500 AND NOT p_is_final_payout THEN')
    expect(finalPayoutSql).toContain("RAISE EXCEPTION 'Minsta ordinarie utbetalning är 500 kr'")
    expect(finalPayoutSql).toContain('p_is_final_payout AND v_final_reason IS NULL')
    expect(finalPayoutSql).toContain("'isFinalPayout', p_is_final_payout")
  })

  test('bara service role kan skapa underlaget och den gamla signaturen tas bort', () => {
    const signature = 'create_partner_self_billing_batch(UUID, TEXT, JSONB, TEXT, BOOLEAN, TEXT)'
    expect(finalPayoutSql).toContain('DROP FUNCTION IF EXISTS public.create_partner_self_billing_batch(UUID, TEXT, JSONB, TEXT)')
    expect(finalPayoutSql).toContain(`REVOKE ALL ON FUNCTION public.${signature}`)
    expect(finalPayoutSql).toContain(`GRANT EXECUTE ON FUNCTION public.${signature}`)
  })

  test('API och adminyta kräver ett uttryckligt skäl', () => {
    const api = read('app/api/admin/partners/commission/route.ts')
    const ui = read('app/admin/components/PartnerCommissionModal.tsx')
    expect(api).toContain("error: 'Skäl krävs för slututbetalning'")
    expect(api).toContain('finalPayoutReason')
    expect(ui).toContain('Skapa slutunderlag')
    expect(ui).toContain('final_payout_reason: reason')
  })
})
