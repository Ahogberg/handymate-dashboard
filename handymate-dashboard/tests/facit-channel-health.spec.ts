/**
 * Facit: Block B — sann kanalhälsa för kundinflödet (2026-08-28).
 *
 *   npx playwright test tests/facit-channel-health.spec.ts --project=chromium --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  deriveChannelHealth,
  hasVerifiedCustomerInflow,
  type ChannelHealthSignals,
  type InflowChannel,
} from '../lib/onboarding/channel-health'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const channels: InflowChannel[] = ['phone', 'email', 'web']

function derive(channel: InflowChannel, patch: Partial<ChannelHealthSignals> = {}) {
  return deriveChannelHealth(channel, { enabled: true, ...patch })
}

test('varje kanal har exakt fyra ärliga nivåer i samma sanningsordning', () => {
  for (const channel of channels) {
    expect(deriveChannelHealth(channel, { enabled: false }).state).toBe('not_enabled')
    expect(derive(channel).state).toBe('enabled_unverified')
    expect(derive(channel, {
      channel_verified_at: '2026-08-28T10:00:00.000Z',
      channel_proof: channel === 'phone' ? 'call_received' : channel === 'email' ? 'email_received' : 'widget_loaded',
    }).state).toBe('channel_verified')
    expect(derive(channel, {
      lead_exists: true,
      deal_exists: true,
      lead_verified_at: '2026-08-28T10:02:00.000Z',
    }).state).toBe('lead_verified')
  }
})

test('historiska bevis kan aldrig göra en avstängd kanal grön', () => {
  for (const channel of channels) {
    const result = deriveChannelHealth(channel, {
      enabled: false,
      channel_verified_at: '2026-08-28T10:00:00.000Z',
      lead_exists: true,
      deal_exists: true,
      lead_verified_at: '2026-08-28T10:02:00.000Z',
    })
    expect(result.state).toBe('not_enabled')
    expect(result.evidence_at).toBeNull()
  }
})

test('starkaste nivån kräver både en verifierad leadrad och en verifierad affärsrad', () => {
  for (const channel of channels) {
    const transport = {
      channel_verified_at: '2026-08-28T10:00:00.000Z',
      channel_proof: channel === 'phone' ? 'call_received' as const : channel === 'email' ? 'email_received' as const : 'widget_conversation' as const,
    }
    expect(derive(channel, { ...transport, lead_exists: true, deal_exists: false }).state)
      .toBe('channel_verified')
    expect(derive(channel, { ...transport, lead_exists: false, deal_exists: true }).state)
      .toBe('channel_verified')
    expect(derive(channel, { ...transport, lead_exists: true, deal_exists: true }).state)
      .toBe('lead_verified')
  }
})

test('samlad inflödessanning blir sann först när minst en kanal har lead + affär', () => {
  const unverified = channels.map(channel => derive(channel, {
    channel_verified_at: '2026-08-28T10:00:00.000Z',
  }))
  expect(hasVerifiedCustomerInflow(unverified)).toBe(false)
  expect(hasVerifiedCustomerInflow([
    ...unverified,
    derive('web', { lead_exists: true, deal_exists: true }),
  ])).toBe(true)
})

test('API:t är autentiserat, dynamiskt och filtrerar varje service-role-läsning på tenant', () => {
  const route = kod('app/api/onboarding/channel-health/route.ts')
  expect(route).toContain("export const dynamic = 'force-dynamic'")
  expect(route).toContain('getAuthenticatedBusiness(request)')
  expect(route).toContain("{ error: 'Inte inloggad' }, { status: 401 }")

  for (const table of [
    'business_config',
    'email_inbound_route',
    'calendar_connection',
    'gmail_imported_message',
    'storefront',
    'widget_conversation',
    'deal',
    'leads',
  ]) {
    const calls = Array.from(route.matchAll(new RegExp(`\\.from\\('${table}'\\)`, 'g')))
    expect(calls.length, `${table} läses inte`).toBeGreaterThan(0)
  }

  const tenantFilters = Array.from(route.matchAll(/\.eq\('business_id', businessId\)/g))
  const serviceRoleReads = Array.from(route.matchAll(/\.from\('/g))
  expect(tenantFilters.length, 'varje service-role-fråga måste tenantfiltreras')
    .toBe(serviceRoleReads.length)
})

test('telefonbeviset validerar testflödets exakta lead- och deal-id; inga andra rader får räcka', () => {
  const route = kod('app/api/onboarding/channel-health/route.ts')
  expect(route).toContain(".eq('id', testCall.deal_id)")
  expect(route).toContain(".eq('lead_id', testCall.lead_id)")
  expect(route).toContain(".in('lead_id', leadIds)")
  expect(route).toContain('phoneLeadExists')
  expect(route).toContain('phoneDealExists')
})

test('e-post och webb skiljer aktivering, kanalbevis och full Golden Path', () => {
  const route = kod('app/api/onboarding/channel-health/route.ts')
  expect(route).toContain(".from('email_inbound_route')")
  expect(route).toContain('last_received_at')
  expect(route).toContain(".from('gmail_imported_message')")
  expect(route).toContain(".eq('source', 'website_form')")
  expect(route).toContain(".in('source', ['email_forward', 'email_lead'])")
  expect(route).toContain('webLeadExists && webDealExists')
  expect(route).not.toContain('Kopplad')
})
