import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/agents/personalities.ts'),
  'utf8',
)

test.describe('Support-agentens verktygsscope (lib/agents/personalities.ts)', () => {
  test('support finns explicit i AGENT_PERSONALITIES (fangar INTE all-fallbacken)', () => {
    expect(FILE).toContain("support: {")
  })

  test('support.allowedTools ar EN ARRAY, aldrig strangen all', () => {
    const idx = FILE.indexOf('support: {')
    expect(idx).toBeGreaterThan(-1)
    const block = FILE.slice(idx, idx + 500)
    expect(block).toMatch(/allowedTools:\s*\[/)
    expect(block).not.toMatch(/allowedTools:\s*'all'/)
  })

  test('support.allowedTools innehaller de tva nya verktygen', () => {
    const idx = FILE.indexOf('support: {')
    const block = FILE.slice(idx, idx + 500)
    expect(block).toMatch(/get_account_billing_status/)
    expect(block).toMatch(/escalate_to_handymate_team/)
  })

  test('support.allowedTools innehaller INTE create_approval_request (se spec: fel ko)', () => {
    const idx = FILE.indexOf('support: {')
    const closeIdx = FILE.indexOf('\n  },', idx)
    const block = FILE.slice(idx, closeIdx)
    expect(block).not.toMatch(/create_approval_request/)
  })

  test('support.triggers ar tom — kan bara nas via handoff i en aktiv chatt', () => {
    const idx = FILE.indexOf('support: {')
    const closeIdx = FILE.indexOf('\n  },', idx)
    const block = FILE.slice(idx, closeIdx)
    expect(block).toMatch(/triggers:\s*\[\]/)
  })
})
