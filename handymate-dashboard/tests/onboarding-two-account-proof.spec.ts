import { expect, test } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test.describe('Tvåkontosbeviset — bevis, aldrig testdatamutation', () => {
  test('pre-/postflight-scriptet är strikt read-only', () => {
    const script = read('scripts/onboarding-two-account-proof.mjs')
    expect(script).toContain("--phase=")
    expect(script).toContain('PROOF_CLASSIC_BUSINESS_ID')
    expect(script).toContain('PROOF_STUDIO_BUSINESS_ID')
    expect(script).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/)
  })

  test('inga testkonton eller lösenord är hårdkodade i script eller runbook', () => {
    const combined = read('scripts/onboarding-two-account-proof.mjs') + read('docs/runbooks/TVAKONTOSBEVIS_ONBOARDING.md')
    expect(combined).not.toContain('anders1@')
    expect(combined).not.toContain('anders2@')
    expect(combined).not.toContain('KvCE2eJB')
  })

  test('runbooken kräver samma resa och ett kontrollerat verkligt utskick', () => {
    const runbook = read('docs/runbooks/TVAKONTOSBEVIS_ONBOARDING.md')
    expect(runbook).toContain('A · klassisk')
    expect(runbook).toContain('B · Setup Studio')
    expect(runbook).toContain('kontrollerad testmottagare')
    expect(runbook).toContain('sent/sent_at')
    expect(runbook).toContain('P0:')
  })
})

test.describe('Teamet i fickan — sparad post-launch-gräns', () => {
  test('programmet har tre notisklasser och återanvänder befintliga grindar', () => {
    const spec = read('docs/roadmap/TEAMET_I_FICKAN_POST_LAUNCH.md')
    expect(spec).toContain('Kräver beslut')
    expect(spec).toContain('Något viktigt har hänt')
    expect(spec).toContain('Teamuppdatering')
    expect(spec).toContain('befintliga approval- och')
    expect(spec).toContain('Ingen ny agentmotor')
  })
})
