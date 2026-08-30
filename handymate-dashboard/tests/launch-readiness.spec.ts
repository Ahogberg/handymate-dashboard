import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  evaluateBillingPlans,
  evaluateLaunchEnvironment,
  evaluateStorageBuckets,
  LAUNCH_ENVIRONMENT_GROUPS,
  MANUAL_LAUNCH_PROOFS,
  REQUIRED_STORAGE_BUCKETS,
  SELLABLE_BILLING_PLAN_IDS,
} from '../lib/launch/readiness'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test.describe('lanseringsmiljön', () => {
  test('grönmarkerar aldrig en grupp om en obligatorisk nyckel saknas', () => {
    const env = Object.fromEntries(
      LAUNCH_ENVIRONMENT_GROUPS.flatMap((group) => group.variables).map((key) => [key, 'configured']),
    )
    delete env.STRIPE_WEBHOOK_SECRET

    const checks = evaluateLaunchEnvironment(env)
    expect(checks.find((check) => check.key === 'env_payments')).toMatchObject({
      status: 'blocked',
      missing: ['STRIPE_WEBHOOK_SECRET'],
    })
    expect(checks.find((check) => check.key === 'env_core')?.status).toBe('pass')
  })

  test('returnerar bara status och saknade variabelnamn — aldrig hemliga värden', () => {
    const secret = 'must-never-leave-the-server'
    const env = Object.fromEntries(
      LAUNCH_ENVIRONMENT_GROUPS.flatMap((group) => group.variables).map((key) => [key, secret]),
    )
    expect(JSON.stringify(evaluateLaunchEnvironment(env))).not.toContain(secret)
  })
})

test.describe('körande databas och leverantörsbevis', () => {
  test('alla säljbara månads- och årsplaner måste ha riktiga Stripe price-id:n', () => {
    const incomplete = SELLABLE_BILLING_PLAN_IDS.map((plan_id) => ({
      plan_id,
      stripe_price_id: plan_id === 'business_yearly' ? null : `price_${plan_id}`,
    }))
    expect(evaluateBillingPlans(incomplete)).toMatchObject({
      status: 'blocked',
      missing: ['business_yearly'],
    })
    expect(evaluateBillingPlans(incomplete.map((plan) => ({
      ...plan,
      stripe_price_id: plan.stripe_price_id ?? 'price_business_yearly',
    }))).status).toBe('pass')
  })

  test('runtime-buckets måste finnas — en tabellmigration kan inte ersätta dem', () => {
    const incomplete = REQUIRED_STORAGE_BUCKETS.filter((bucket) => bucket !== 'meeting-audio')
    expect(evaluateStorageBuckets(incomplete)).toMatchObject({
      status: 'blocked',
      missing: ['meeting-audio'],
    })
  })

  test('externa leverantörer och fysisk mobil förblir manuella stationer', () => {
    expect(MANUAL_LAUNCH_PROOFS.map((proof) => proof.key)).toEqual(expect.arrayContaining([
      'proof_stripe',
      'proof_lisa',
      'proof_email',
      'proof_google',
      'proof_ios',
      'proof_fortnox',
    ]))
    expect(MANUAL_LAUNCH_PROOFS.every((proof) => proof.status === 'manual')).toBe(true)
  })
})

test.describe('adminruttens säkerhets- och sanningskontrakt', () => {
  const route = read('app/api/admin/launch-readiness/route.ts')

  test('är superadmin-grindad, dynamisk och ocachad', () => {
    expect(route).toContain('isAdmin(request)')
    expect(route).toContain("return NextResponse.json({ error: 'Forbidden' }, { status: 403 })")
    expect(route).toContain("export const dynamic = 'force-dynamic'")
    expect(route).toContain("'Cache-Control': 'no-store'")
  })

  test('probar de senaste lanseringskritiska migrationerna mot riktig databas', () => {
    for (const key of [
      'schema_support',
      'schema_deal_documents',
      'schema_installations',
      'schema_project_numbers',
      'schema_project_tips',
      'schema_widget_truth',
      'schema_lead_number',
    ]) {
      expect(route).toContain(`key: '${key}'`)
    }
    expect(route).toContain(".from(probe.table).select(probe.columns).limit(1)")
  })

  test('läser verkliga billing_plan-rader och Supabase Storage', () => {
    expect(route).toContain(".from('billing_plan')")
    expect(route).toContain(".select('plan_id,stripe_price_id')")
    expect(route).toContain('supabase.storage.listBuckets()')
  })
})

test('publika health-checken kan inte servera en gammal grön status', () => {
  const health = read('app/api/health/route.ts')
  expect(health).toContain("export const dynamic = 'force-dynamic'")
  expect(health).toContain("'Cache-Control': 'no-store'")
  expect(health).toContain('new Date().toISOString()')
})

test('publika lanseringsrökprovet är read-only och testar token- och cron-felvägar', () => {
  const smoke = read('scripts/launch-public-smoke.mjs')
  expect(smoke).toContain("method: 'GET'")
  expect(smoke).not.toMatch(/method:\s*['\"](?:POST|PUT|PATCH|DELETE)['\"]/)
  expect(smoke).toContain('/api/quotes/public/__launch_probe_invalid__')
  expect(smoke).toContain('/api/portal/__launch_probe_invalid__')
  expect(smoke).toContain('/api/jobbpass/public/__launch_probe_invalid__')
  expect(smoke).toContain('/api/cron/check-overdue')
  expect(smoke).toContain("allowed: [401]")
  expect(smoke).toContain('ageMs < 5 * 60 * 1000')
  expect(read('package.json')).toContain('"launch:smoke": "node scripts/launch-public-smoke.mjs"')
})
