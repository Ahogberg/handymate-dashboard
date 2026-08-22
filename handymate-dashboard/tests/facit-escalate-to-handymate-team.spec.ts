import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const DEFS = fs.readFileSync(
  path.join(__dirname, '..', 'app/api/agent/trigger/tool-definitions.ts'),
  'utf8',
)
const ROUTER = fs.readFileSync(
  path.join(__dirname, '..', 'app/api/agent/trigger/tool-router.ts'),
  'utf8',
)

test.describe('escalate_to_handymate_team', () => {
  test('verktygsschema finns med category-enum för alla fem kategorier', () => {
    expect(DEFS).toContain('name: "escalate_to_handymate_team"')
    const idx = DEFS.indexOf('name: "escalate_to_handymate_team"')
    const block = DEFS.slice(idx, idx + 700)
    for (const cat of ['cancellation', 'refund', 'gdpr', 'bug_financial', 'human_requested']) {
      expect(block).toContain(cat)
    }
  })

  test('routern skapar en support_ticket-rad', () => {
    const idx = ROUTER.indexOf("case 'escalate_to_handymate_team'")
    expect(idx).toBeGreaterThan(-1)
    const nextCaseIdx = ROUTER.indexOf("case '", idx + 10)
    const block = ROUTER.slice(idx, nextCaseIdx > -1 ? nextCaseIdx : idx + 3000)
    expect(block).toMatch(/\.from\('support_ticket'\)/)
    expect(block).toMatch(/\.insert\(/)
  })

  test('routern anropar notifyHandymateSupportTeam', () => {
    expect(ROUTER).toContain('notifyHandymateSupportTeam')
  })

  test('routern skiljer ticket-sanning från internt larmutfall', () => {
    const idx = ROUTER.indexOf("case 'escalate_to_handymate_team'")
    const nextCaseIdx = ROUTER.indexOf("case '", idx + 10)
    const block = ROUTER.slice(idx, nextCaseIdx > -1 ? nextCaseIdx : idx + 3000)
    expect(block).toContain('alertDelivery.delivered')
    expect(block).toContain('supportEscalationCustomerMessage(alertDelivery)')
  })

  test('ett redan öppet ärende i samma tråd och kategori återanvänds', () => {
    const idx = ROUTER.indexOf("case 'escalate_to_handymate_team'")
    const nextCaseIdx = ROUTER.indexOf("case '", idx + 10)
    const block = ROUTER.slice(idx, nextCaseIdx > -1 ? nextCaseIdx : idx + 3000)
    expect(block).toMatch(/\.eq\('thread_id',\s*threadId\)/)
    expect(block).toMatch(/\.eq\('category',\s*String\(category\)\)/)
    expect(block).toMatch(/\.in\('status',\s*\['escalated',\s*'in_progress'\]\)/)
    expect(block).toContain('deduplicated: true')
  })

  test('skapar INGEN pending_approvals-rad (se spec — fel kö för detta)', () => {
    const idx = ROUTER.indexOf("case 'escalate_to_handymate_team'")
    const nextCaseIdx = ROUTER.indexOf("case '", idx + 10)
    const block = ROUTER.slice(idx, nextCaseIdx > -1 ? nextCaseIdx : idx + 1200)
    expect(block).not.toMatch(/pending_approvals/)
  })
})
