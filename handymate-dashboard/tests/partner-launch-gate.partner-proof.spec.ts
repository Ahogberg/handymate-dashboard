/**
 * Partner Launch Gate mot riktig databas.
 *
 * Körs ALDRIG av standardsviten. Kräver två uttryckligt disponibla testkonton
 * i `.env.integration` och den extra spärren:
 *   PARTNER_TEST_ALLOW_DB_WRITES=YES_PARTNER_DISPOSABLE_ACCOUNTS
 *
 * Kör: npm run proof:partner
 *
 * Testet skickar inget, anropar inte Stripe och rör inga riktiga partners.
 * Det skapar egna partner-/GTМ-/referral-/liggarrader, använder v204:s riktiga
 * RPC samt v193/v194:s riktiga självfakturerings-RPC:er och städar allt i
 * finally. De två testföretagens `referred_by` måste vara NULL från början.
 */
import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Saknar ${name} i .env.integration`)
  return value
}

const config = {
  url: required('TENANT_TEST_SUPABASE_URL'),
  serviceKey: required('TENANT_TEST_SUPABASE_SERVICE_ROLE_KEY'),
  expectedRef: required('TENANT_TEST_EXPECTED_PROJECT_REF'),
  allowWrites: required('PARTNER_TEST_ALLOW_DB_WRITES'),
  businessA: required('TENANT_A_BUSINESS_ID'),
  businessB: required('TENANT_B_BUSINESS_ID'),
}

if (config.allowWrites !== 'YES_PARTNER_DISPOSABLE_ACCOUNTS') {
  throw new Error('Säkerhetsspärren saknas: PARTNER_TEST_ALLOW_DB_WRITES måste vara YES_PARTNER_DISPOSABLE_ACCOUNTS')
}
if (config.businessA === config.businessB) throw new Error('Partnerbeviset kräver två olika testföretag')
if (new URL(config.url).hostname.split('.')[0] !== config.expectedRef) {
  throw new Error('Supabase-projektet matchar inte TENANT_TEST_EXPECTED_PROJECT_REF')
}

const run = `plg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const code = (suffix: string) => `P-${suffix.toUpperCase()}-${run.slice(-6).toUpperCase()}`

test('partnerkedjan: claim → konflikt → 180 dagar → självfaktura → betald', async () => {
  const db: SupabaseClient = createClient(config.url, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const partnerIds: string[] = []
  const gtmIds: string[] = []
  const batchIds: string[] = []

  const { data: businesses, error: businessError } = await db
    .from('business_config')
    .select('business_id, contact_email, org_number, referred_by')
    .in('business_id', [config.businessA, config.businessB])
  if (businessError) throw new Error(businessError.message)
  if ((businesses || []).length !== 2) throw new Error('Båda disponibla testföretagen måste finnas')
  const businessA = businesses!.find(row => row.business_id === config.businessA)!
  const businessB = businesses!.find(row => row.business_id === config.businessB)!
  if (!businessA.contact_email || !businessB.contact_email) throw new Error('Testföretagen måste ha contact_email')
  if (businessA.referred_by || businessB.referred_by) {
    throw new Error('Testföretagens referred_by måste vara NULL — testet skriver aldrig över verklig attribution')
  }

  const { error: gateError } = await db.from('partner_attribution_decision').select('id').limit(0)
  const { error: payoutGateError } = await db.from('partner_payout_batch').select('is_final_payout').limit(0)
  test.skip(
    !!gateError || !!payoutGateError,
    `v204/v205 saknas i databasen: ${gateError?.message || payoutGateError?.message || 'partnergrinden kan inte läsas'}`,
  )

  async function createPartner(suffix: string, email: string) {
    const referralCode = code(suffix)
    const { data, error } = await db.from('partners').insert({
      email,
      name: `${run} ${suffix}`,
      company: `${run} AB`,
      password_hash: 'partner-proof-no-login',
      referral_code: referralCode,
      referral_url: `https://app.handymate.se/registrera?ref=${referralCode}`,
      status: 'active',
      agreement_version: '1.0',
      agreement_hash: run.padEnd(64, '0').slice(0, 64),
      agreement_accepted_at: new Date().toISOString(),
      agreement_accepted_ip: '127.0.0.1',
      commission_tiers: [{ min: 0, rate: 0.2 }],
      base_rate_after: 0,
      tier_mode: 'book',
      ladder_months: 36,
      self_billing_legal_name: `${run} ${suffix} AB`,
      self_billing_org_number: `556${Math.floor(1000000 + Math.random() * 8999999)}`,
      self_billing_registered_address: 'Testgatan 1, 111 11 Stockholm',
      self_billing_vat_number: `SE556${Math.floor(1000000 + Math.random() * 8999999)}01`,
      self_billing_vat_registered: true,
      self_billing_vat_rate: 0.25,
      self_billing_f_tax_approved: true,
      self_billing_email: email,
      payout_bankgiro: '123-4567',
    }).select('id, referral_code').single()
    if (error) throw new Error(`Partner ${suffix}: ${error.message}`)
    partnerIds.push(data.id)
    return data as { id: string; referral_code: string }
  }

  async function claim(businessId: string, referralCode: string) {
    const { data, error } = await db.rpc('claim_partner_attribution', {
      p_business_id: businessId,
      p_referral_code: referralCode,
      p_required_agreement_version: '1.0',
    })
    if (error) throw new Error(`claim_partner_attribution: ${error.message}`)
    return data as { accepted: boolean; reason: string; partner_id: string | null; referral_id: string | null; idempotent: boolean }
  }

  try {
    const self = await createPartner('SELF', businessA.contact_email)
    const first = await createPartner('FIRST', `${run}.first@example.invalid`)
    const second = await createPartner('SECOND', `${run}.second@example.invalid`)

    const selfResult = await claim(config.businessA, self.referral_code)
    expect(selfResult).toMatchObject({ accepted: false, reason: 'self_referral' })

    const accepted = await claim(config.businessA, first.referral_code)
    expect(accepted).toMatchObject({ accepted: true, reason: 'accepted', idempotent: false })
    const repeated = await claim(config.businessA, first.referral_code)
    expect(repeated).toMatchObject({ accepted: true, reason: 'accepted', idempotent: true })
    const tooLate = await claim(config.businessA, second.referral_code)
    expect(tooLate).toMatchObject({ accepted: false, reason: 'already_attributed' })

    const { count: aCount, error: aCountError } = await db
      .from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('referred_business_id', config.businessA)
      .eq('referrer_type', 'partner')
    if (aCountError) throw new Error(aCountError.message)
    expect(aCount).toBe(1)

    const { data: member, error: memberError } = await db
      .from('business_users').select('user_id').eq('business_id', config.businessB).limit(1).single()
    if (memberError) throw new Error(memberError.message)

    const { data: recentAccount, error: recentAccountError } = await db.from('gtm_account').insert({
      company_name: `${run} recent`,
      company_email: businessB.contact_email,
      source_name: 'partner-proof',
      source_checked_at: new Date().toISOString(),
      lawful_basis: 'inbound_request',
      retention_review_at: new Date(Date.now() + 86_400_000).toISOString(),
      contact_basis: 'inbound',
      created_by: member.user_id,
      updated_by: member.user_id,
    }).select('id').single()
    if (recentAccountError) throw new Error(recentAccountError.message)
    gtmIds.push(recentAccount.id)
    const { error: recentActivityError } = await db.from('gtm_activity').insert({
      account_id: recentAccount.id,
      admin_user_id: member.user_id,
      channel: 'email',
      outcome: 'replied',
      happened_at: new Date().toISOString(),
    })
    if (recentActivityError) throw new Error(recentActivityError.message)

    const priorRelationship = await claim(config.businessB, first.referral_code)
    expect(priorRelationship).toMatchObject({ accepted: false, reason: 'existing_sales_relationship' })

    await db.from('gtm_account').delete().eq('id', recentAccount.id)
    gtmIds.splice(gtmIds.indexOf(recentAccount.id), 1)
    const { data: oldAccount, error: oldAccountError } = await db.from('gtm_account').insert({
      company_name: `${run} old`,
      company_email: businessB.contact_email,
      source_name: 'partner-proof',
      source_checked_at: new Date().toISOString(),
      lawful_basis: 'inbound_request',
      retention_review_at: new Date(Date.now() + 86_400_000).toISOString(),
      contact_basis: 'inbound',
      created_by: member.user_id,
      updated_by: member.user_id,
    }).select('id').single()
    if (oldAccountError) throw new Error(oldAccountError.message)
    gtmIds.push(oldAccount.id)
    const { error: oldActivityError } = await db.from('gtm_activity').insert({
      account_id: oldAccount.id,
      admin_user_id: member.user_id,
      channel: 'email',
      outcome: 'replied',
      happened_at: new Date(Date.now() - 181 * 86_400_000).toISOString(),
    })
    if (oldActivityError) throw new Error(oldActivityError.message)

    const race = await Promise.all([
      claim(config.businessB, first.referral_code),
      claim(config.businessB, second.referral_code),
    ])
    expect(race.filter(row => row.accepted && !row.idempotent)).toHaveLength(1)
    expect(race.filter(row => !row.accepted && row.reason === 'already_attributed')).toHaveLength(1)
    const winner = race.find(row => row.accepted)!
    expect(winner.referral_id).toBeTruthy()

    const period = new Date().toISOString().slice(0, 7)
    const { error: activeError } = await db.from('referrals').update({
      status: 'active', converted_at: new Date().toISOString(),
    }).eq('id', winner.referral_id!)
    if (activeError) throw new Error(activeError.message)

    const { error: ledgerError } = await db.rpc('record_partner_commission_rows', {
      p_partner_id: winner.partner_id,
      p_period: period,
      p_rows: [{
        business_id: config.businessB,
        referral_id: winner.referral_id,
        customer_month: 1,
        base_amount_sek: 5_995,
        rate: 0.2,
        amount_sek: 1_199,
        rate_source: 'tier',
        tier_snapshot: { active_count: 1 },
        source_billing_event_ids: [`${run}_paid`],
        entry_kind: 'accrual',
        source_key: `partner-proof:${run}`,
      }],
    })
    if (ledgerError) throw new Error(ledgerError.message)

    const { data: batch, error: batchError } = await db.rpc('create_partner_self_billing_batch', {
      p_partner_id: winner.partner_id,
      p_period: period,
      p_buyer: {
        legalName: 'Handymate Proof AB', organizationNumber: '559000-0000',
        registeredAddress: 'Handymategatan 1, 111 11 Stockholm',
        vatNumber: 'SE559000000001', email: 'ekonomi@handymate.se',
      },
      p_actor: 'partner-proof',
      p_is_final_payout: false,
      p_final_payout_reason: null,
    })
    if (batchError) throw new Error(batchError.message)
    batchIds.push(batch.batch_id)
    expect(Number(batch.subtotal_sek)).toBe(1_199)
    expect(Number(batch.total_sek)).toBe(1_498.75)

    const { error: reviewError } = await db.rpc('review_partner_self_billing_batch', {
      p_batch_id: batch.batch_id,
      p_partner_id: winner.partner_id,
      p_decision: 'approved',
      p_reason: null,
    })
    if (reviewError) throw new Error(reviewError.message)
    const { error: paidError } = await db.rpc('mark_partner_self_billing_paid', {
      p_batch_id: batch.batch_id,
      p_paid_by: 'partner-proof',
      p_payment_reference: `${run}-bank`,
      p_paid_at: new Date().toISOString(),
    })
    if (paidError) throw new Error(paidError.message)

    const { data: paidBatch, error: paidBatchError } = await db
      .from('partner_payout_batch')
      .select('status, review_status, payment_reference, total_incl_vat_sek')
      .eq('id', batch.batch_id).single()
    if (paidBatchError) throw new Error(paidBatchError.message)
    expect(paidBatch).toMatchObject({
      status: 'paid', review_status: 'approved', payment_reference: `${run}-bank`,
    })
    expect(Number(paidBatch.total_incl_vat_sek)).toBe(1_498.75)

    // Avtalets enda undantag från 500-kronorsgränsen: ett ostridigt
    // slutbelopp får buntas först när admin uttryckligen anger slututbetalning
    // och ett skäl. Samma 100 kr ska först nekas i den ordinarie vägen.
    const { error: finalLedgerError } = await db.rpc('record_partner_commission_rows', {
      p_partner_id: winner.partner_id,
      p_period: period,
      p_rows: [{
        business_id: config.businessB,
        referral_id: winner.referral_id,
        customer_month: 1,
        base_amount_sek: 500,
        rate: 0.2,
        amount_sek: 100,
        rate_source: 'tier',
        tier_snapshot: { active_count: 1, final_proof: true },
        source_billing_event_ids: [`${run}_final`],
        entry_kind: 'accrual',
        source_key: `partner-proof-final:${run}`,
      }],
    })
    if (finalLedgerError) throw new Error(finalLedgerError.message)

    const regularSmall = await db.rpc('create_partner_self_billing_batch', {
      p_partner_id: winner.partner_id,
      p_period: period,
      p_buyer: {
        legalName: 'Handymate Proof AB', organizationNumber: '559000-0000',
        registeredAddress: 'Handymategatan 1, 111 11 Stockholm',
        vatNumber: 'SE559000000001', email: 'ekonomi@handymate.se',
      },
      p_actor: 'partner-proof',
      p_is_final_payout: false,
      p_final_payout_reason: null,
    })
    expect(regularSmall.error?.message).toContain('Minsta ordinarie utbetalning är 500 kr')

    const { data: finalBatch, error: finalBatchError } = await db.rpc('create_partner_self_billing_batch', {
      p_partner_id: winner.partner_id,
      p_period: period,
      p_buyer: {
        legalName: 'Handymate Proof AB', organizationNumber: '559000-0000',
        registeredAddress: 'Handymategatan 1, 111 11 Stockholm',
        vatNumber: 'SE559000000001', email: 'ekonomi@handymate.se',
      },
      p_actor: 'partner-proof',
      p_is_final_payout: true,
      p_final_payout_reason: 'Partner-proof: avslutat testavtal',
    })
    if (finalBatchError) throw new Error(finalBatchError.message)
    batchIds.push(finalBatch.batch_id)
    expect(finalBatch).toMatchObject({ is_final_payout: true })
    expect(Number(finalBatch.subtotal_sek)).toBe(100)

    const { data: frozenFinal, error: frozenFinalError } = await db
      .from('partner_payout_batch')
      .select('is_final_payout, final_payout_reason, document_snapshot')
      .eq('id', finalBatch.batch_id)
      .single()
    if (frozenFinalError) throw new Error(frozenFinalError.message)
    expect(frozenFinal.is_final_payout).toBe(true)
    expect(frozenFinal.final_payout_reason).toBe('Partner-proof: avslutat testavtal')
    expect(frozenFinal.document_snapshot?.isFinalPayout).toBe(true)
  } finally {
    await db.from('partner_commission_ledger').delete().in('partner_id', partnerIds)
    if (batchIds.length) await db.from('partner_payout_batch').delete().in('id', batchIds)
    await db.from('partner_attribution_decision').delete().in('business_id', [config.businessA, config.businessB]).like('referral_code', `%${run.slice(-6).toUpperCase()}`)
    await db.from('referrals').delete().in('referred_business_id', [config.businessA, config.businessB]).eq('referrer_type', 'partner')
    await db.from('business_config').update({ referred_by: null }).in('business_id', [config.businessA, config.businessB])
    for (const id of gtmIds) await db.from('gtm_account').delete().eq('id', id)
    if (partnerIds.length) await db.from('partners').delete().in('id', partnerIds)
  }
})
