import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const TEAM_FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/agents/team.ts'),
  'utf8',
)
const INTERACTION_FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/agents/interaction.ts'),
  'utf8',
)

test.describe('Support har en egen identitet i teamregistret', () => {
  test('support finns i TEAM-arrayen med id support', () => {
    expect(TEAM_FILE).toMatch(/id:\s*'support'/)
  })

  test('support-posten har namnet Handymate Support', () => {
    const idx = TEAM_FILE.indexOf("id: 'support'")
    expect(idx).toBeGreaterThan(-1)
    const block = TEAM_FILE.slice(idx, idx + 400)
    expect(block).toMatch(/Handymate Support/)
  })

  test('support finns i SHORT_VERB-kartan (annars faller bylinen tillbaka på Teamet/noterade)', () => {
    const idx = INTERACTION_FILE.indexOf('const SHORT_VERB')
    expect(idx).toBeGreaterThan(-1)
    const block = INTERACTION_FILE.slice(idx, idx + 300)
    expect(block).toMatch(/support:/)
  })
})
