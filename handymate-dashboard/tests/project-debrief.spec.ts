/**
 * Project Debrief Capture (2026-08-12) — facit-tester.
 *
 * Körs: npx playwright test tests/project-debrief.spec.ts --no-deps
 *
 * Testar:
 *   - byggDebriefFragor (lib/debrief/build-debrief-questions.ts): den rena
 *     frågegenereringen ur efterkalkyl-deltat, ingen AI.
 *   - action-contract: project_debrief är registrerad som EXECUTABLE_ACTION.
 *   - create-debrief-card.ts: livstids-dedupen saknar VERKLIGEN ett
 *     statusfilter — den buggklassen (dedup som råkar filtrera på status
 *     och därför spammar dubbletter av redan hanterade kort) har bitit
 *     projektet tre gånger tidigare.
 *
 * INGEN DB, INGET Supabase — skapandet av kortet (som gör I/O) testas inte
 * här, bara den rena frågelogiken och källkodens form.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { byggDebriefFragor } from '../lib/debrief/build-debrief-questions'
import { ACTION_CONTRACT, classify, mayExecute } from '../lib/approvals/action-contract'

const ROOT = path.resolve(__dirname, '..')

test.describe('byggDebriefFragor — frågorna härleds ur deltat, ingen AI', () => {
  test('>10% timmar ger tidsfrågan', () => {
    const fragor = byggDebriefFragor({ hours_diff_pct: 15, amount_diff_pct: 0 })
    expect(fragor[0]).toBe('Vad tog längre tid än planerat?')
  })

  test('<=10% timmar ger den neutrala tidsfrågan', () => {
    const fragor = byggDebriefFragor({ hours_diff_pct: 4, amount_diff_pct: 0 })
    expect(fragor[0]).toBe('Stämde tidsuppskattningen?')
  })

  test('null timmar räknas som "inte över tröskeln"', () => {
    const fragor = byggDebriefFragor({ hours_diff_pct: null, amount_diff_pct: 0 })
    expect(fragor[0]).toBe('Stämde tidsuppskattningen?')
  })

  test('negativt belopp (<-10%) ger marginalfrågan', () => {
    const fragor = byggDebriefFragor({ hours_diff_pct: 0, amount_diff_pct: -25 })
    expect(fragor[1]).toBe('Vad åt av marginalen?')
  })

  test('belopp inom tröskeln ger INTE marginalfrågan', () => {
    const fragor = byggDebriefFragor({ hours_diff_pct: 0, amount_diff_pct: -5 })
    expect(fragor[1]).not.toBe('Vad åt av marginalen?')
  })

  test('alltid exakt 3 frågor', () => {
    expect(byggDebriefFragor({ hours_diff_pct: 50, amount_diff_pct: -50 })).toHaveLength(3)
    expect(byggDebriefFragor({ hours_diff_pct: 0, amount_diff_pct: 0 })).toHaveLength(3)
    expect(byggDebriefFragor({ hours_diff_pct: null, amount_diff_pct: null })).toHaveLength(3)
  })

  test('sista frågan är alltid den öppna', () => {
    const a = byggDebriefFragor({ hours_diff_pct: 30, amount_diff_pct: -30 })
    const b = byggDebriefFragor({ hours_diff_pct: 0, amount_diff_pct: 0 })
    expect(a[2]).toBe('Något att göra annorlunda nästa gång?')
    expect(b[2]).toBe('Något att göra annorlunda nästa gång?')
  })
})

test.describe('action-contract — project_debrief är registrerad', () => {
  test('klassad som utförande', () => {
    expect(classify('project_debrief')).toBe('EXECUTABLE_ACTION')
    expect(mayExecute('project_debrief')).toBe(true)
  })

  test('finns i ACTION_CONTRACT', () => {
    expect(ACTION_CONTRACT.project_debrief).toBe('EXECUTABLE_ACTION')
  })

  test('har en egen case-hanterare i approvals-rutten', () => {
    const rutt = fs.readFileSync(path.join(ROOT, 'app/api/approvals/[id]/route.ts'), 'utf8')
    expect(rutt).toContain("case 'project_debrief':")
  })
})

test.describe('create-debrief-card.ts — livstids-dedupen', () => {
  const kalla = fs.readFileSync(path.join(ROOT, 'lib/debrief/create-debrief-card.ts'), 'utf8')

  test('dedupe-läsningen filtrerar på approval_type + project_id', () => {
    expect(kalla).toContain(".eq('approval_type', 'project_debrief')")
    expect(kalla).toContain(".contains('payload', { project_id: projekt.project_id })")
  })

  test('dedupe-blocket saknar statusfilter — kortet ska inte kunna dubbleras', () => {
    // Hela filen ska inte innehålla ett .eq('status', ...)-anrop — den enda
    // statusrelaterade raden är INSERT-objektets `status: 'pending'`-fält,
    // som inte är en .eq()-fråga.
    expect(kalla).not.toContain(".eq('status'")
  })

  test('kortet skapas aldrig med kastande kod — hela funktionen är try/catch', () => {
    expect(kalla).toContain('export async function skapaDebriefKort')
    expect(kalla).toContain('try {')
    expect(kalla).toContain('catch (err)')
  })
})
