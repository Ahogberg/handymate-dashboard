import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/agent/capabilities.ts'),
  'utf8',
)

test.describe('Support som sjunde agent (lib/agent/capabilities.ts)', () => {
  test('AgentId-unionen inkluderar support', () => {
    expect(FILE).toMatch(/export type AgentId = .*'support'/)
  })

  test('AGENT_CAPABILITIES.support finns med handoff_targets begransat till matte', () => {
    const idx = FILE.indexOf('support: {')
    expect(idx).toBeGreaterThan(-1)
    const block = FILE.slice(idx, idx + 700)
    expect(block).toMatch(/handoff_targets:\s*\['matte'\]/)
  })

  test('alla ovriga agenter har support i sin handoff_targets-lista', () => {
    for (const agent of ['lars', 'karin', 'daniel', 'hanna', 'lisa']) {
      const idx = FILE.indexOf(`${agent}: {`)
      expect(idx).toBeGreaterThan(-1)
      const nextAgentIdx = FILE.indexOf('\n\n  ', idx + 10)
      const block = FILE.slice(idx, nextAgentIdx > -1 ? nextAgentIdx : idx + 1200)
      expect(block).toMatch(/handoff_targets:\s*\[[^\]]*'support'/)
    }
  })

  test('matte.out_of_scope namner Handymate-konto/fakturering', () => {
    const idx = FILE.indexOf("matte: {")
    const block = FILE.slice(idx, idx + 1200)
    expect(block).toMatch(/Handymate-konto/)
  })
})
