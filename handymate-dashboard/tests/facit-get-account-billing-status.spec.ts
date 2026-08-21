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

test.describe('get_account_billing_status', () => {
  test('verktygsschema finns i tool-definitions.ts', () => {
    expect(DEFS).toContain('name: "get_account_billing_status"')
  })

  test('routern har ett case for verktyget', () => {
    expect(ROUTER).toMatch(/case 'get_account_billing_status'/)
  })

  test('implementationen ar rent lasande — ingen .update(/.insert( pa business_config i dess block', () => {
    const idx = ROUTER.indexOf("case 'get_account_billing_status'")
    expect(idx).toBeGreaterThan(-1)
    const nextCaseIdx = ROUTER.indexOf("case '", idx + 10)
    const block = ROUTER.slice(idx, nextCaseIdx > -1 ? nextCaseIdx : idx + 800)
    expect(block).not.toMatch(/business_config['"]\)\s*\n?\s*\.update\(/)
    expect(block).not.toMatch(/business_config['"]\)\s*\n?\s*\.insert\(/)
  })

  test('lases fran business_config.subscription_plan/status/trial_ends_at', () => {
    const idx = ROUTER.indexOf("case 'get_account_billing_status'")
    const block = ROUTER.slice(idx, idx + 800)
    expect(block).toMatch(/subscription_plan/)
    expect(block).toMatch(/subscription_status/)
  })
})
