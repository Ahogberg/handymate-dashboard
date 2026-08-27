/**
 * Facit: POST /api/onboarding/first-action — första verifierade handlingen
 * (2026-08-27). Källskanning, browserlöst.
 *
 *   npx playwright test tests/first-action-route.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const route = kod('app/api/onboarding/first-action/route.ts')
const scanRoute = kod('app/api/onboarding/company-scan/route.ts')
const picker = kod('lib/onboarding/first-action.ts')
const karinLib = kod('lib/invoice-reminder-card.ts')
const danielLib = kod('lib/agents/daniel/quote-follow-up-card.ts')
const danielCron = kod('app/api/cron/quote-follow-up/route.ts')

test.describe('rutten är ägargrindad exakt som skanningen', () => {
  test('auth → getCurrentUser → see_financials → 403, och force-dynamic', () => {
    expect(route).toContain('getAuthenticatedBusiness(request)')
    expect(route).toContain("hasPermission(currentUser, 'see_financials')")
    expect(route).toContain("{ status: 403 }")
    expect(route).toContain("export const dynamic = 'force-dynamic'")
    expect(route).toContain('export async function POST(')
    expect(route).not.toContain('export async function GET(')
  })

  test('skannings-GET:en förblir read-only — skrivningen bor i POST', () => {
    expect(scanRoute).not.toContain('.insert(')
    expect(scanRoute).not.toContain('.update(')
    expect(route).toContain('pickFirstAction(')
  })
})

test.describe('en väljare, cronarnas byggare, ingen modell', () => {
  test('kortet skapas via samma byggare som cronarna', () => {
    expect(route).toContain('createInvoiceReminderCard(supabase, {')
    expect(route).toContain('createQuoteFollowUpCard(supabase, {')
    expect(route).toContain('composeReminderStep({')
    expect(route).toContain('loadReminderConfig(supabase, businessId)')
    // Daniels text: oöppnad vs öppnad offert — aldrig "inte hunnit titta" på en öppnad
    expect(route).toContain('action.opened ? buildOpenedQuoteFollowUpMessage(namnArgs) : buildUnopenedNudgeMessage(namnArgs)')
  })

  test('ingen modell, inga tokens — helt deterministiskt', () => {
    for (const s of [route, picker, karinLib, danielLib]) {
      expect(s).not.toContain('api.anthropic.com')
      expect(s).not.toContain('messages.create(')
      expect(s).not.toContain('@anthropic-ai/sdk')
    }
  })

  test('livstidsdedup på markören, utan statusfilter (startkortsregeln)', () => {
    expect(route).toContain("const FIRST_ACTION_SOURCE = 'company_scan'")
    // Next.js route-validering: inga värde-exporter utöver handlers/config
    expect(route).not.toMatch(/^export const (?!dynamic)/m)
    const dedup = route.slice(route.indexOf('// ── 1. Livstidsdedup'), route.indexOf('// ── 2. Raderna'))
    expect(dedup).toContain(".contains('payload', { first_action_source: FIRST_ACTION_SOURCE })")
    expect(dedup).not.toContain(".eq('status'")
    // Markören + copyn följer med i kortets payload
    expect(route).toContain('const extraPayload = { first_action_source: FIRST_ACTION_SOURCE, first_action: svar }')
  })

  test('alla fel degraderar till { kind: null } med driftlarm — kunden ser aldrig ett fel', () => {
    for (const kalla of ['first-action:dedupe-read', 'first-action:rows-read', 'first-action:customers-read', 'first-action:karin-card', 'first-action:daniel-card', 'first-action:unexpected']) {
      expect(route, `${kalla} saknas`).toContain(`'${kalla}'`)
    }
    expect(route).toContain('const ingen = (): NextResponse => NextResponse.json({ kind: null }')
  })

  test('ingen push och inget första-händelse-SMS — ägaren sitter framför skärmen', () => {
    expect(route).not.toContain('/api/push/send')
    expect(route).not.toContain('sendFirstEventSms')
  })
})

test.describe('Daniels kort delar dedup-nyckel med cronen', () => {
  test("båda deduppar pending send_sms på payload.related_id, båda sätter agent_id 'daniel' och autonomy_key", () => {
    expect(danielLib).toContain(".contains('payload', { related_id: quote.quote_id })")
    expect(danielCron).toContain(".contains('payload', { related_id: q.quote_id })")
    for (const s of [danielLib, danielCron]) {
      expect(s).toContain("agent_id: 'daniel'")
      expect(s).toContain("autonomy_key: 'quote_followup_sms'")
      expect(s).toContain("approval_type: 'send_sms'")
    }
    // Lib:en bär dessutom quote_id + customer_name för kvittots länk och kortets kontextrad
    expect(danielLib).toContain('quote_id: quote.quote_id')
    expect(danielLib).toContain('customer_name: customer.name ?? null')
  })

  test('morgoncronens agentväg hoppar offerter med ett send_sms-kort senaste 168 h — inget andra SMS dagen efter', () => {
    expect(danielCron).toContain("import { filterOutConflicting, UNOPENED_CONFLICT_WINDOW_HOURS } from '@/lib/agents/daniel/unopened-quotes'")
    expect(danielCron).toContain('const items = filterOutConflicting(allaItems, konflikter)')
    expect(danielCron).toContain("if (typeof rid === 'string') konflikter.add(rid)")
    // Konfliktläsningen sker FÖRE grupperingen och utan statusfilter (skickat eller väntande — båda räknas)
    const konflikt = danielCron.indexOf('// 3.5 Konflikt-avoidance')
    expect(konflikt).toBeGreaterThan(-1)
    expect(konflikt).toBeLessThan(danielCron.indexOf('// 4. Group candidates by business'))
    const block = danielCron.slice(konflikt, danielCron.indexOf('// 4. Group candidates by business'))
    expect(block).not.toContain(".eq('status'")
  })
})
