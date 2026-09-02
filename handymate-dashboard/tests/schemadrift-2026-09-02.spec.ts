/**
 * Facit för schemadriften 2026-09-02 (sql/v209_efterslapande_kolumner.sql).
 *
 * En genomgång av alla 352 filer i sql/ mot det skarpa schemat visade att tre
 * migrationer aldrig kördes. Två fynd behövde ändras i KODEN, inte bara i
 * basen, och det är dem det här facit vaktar:
 *
 *  1. win-loss läste deal.loss_reason — ett namn som aldrig funnits. Hela
 *     skrivvägen använder lost_reason. Eftersom PostgREST underkänner HELA
 *     selecten när en kolumn är okänd gav rutten 42703 varje gång.
 *  2. communication-check bad agenten skicka SMS/email till kundernas kunder
 *     för VARJE företag, med enda spärren i en tabell som inte fanns. Felet
 *     swäljdes och alla behandlades som påslagna.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test.describe('deal: kolumnen heter lost_reason', () => {
  const src = read('app/api/analytics/win-loss/route.ts')

  test('win-loss selectar lost_reason, aldrig det påhittade loss_reason', () => {
    expect(src).toContain('lost_reason')
    // loss_reason_detail är en riktig kolumn och ska inte träffas av regeln.
    const felaktiga = src.split('\n').filter(rad =>
      /\bloss_reason\b/.test(rad) && !/loss_reason_detail/.test(rad) && !rad.trim().startsWith('//'))
    expect(felaktiga, `dessa rader läser en kolumn som inte finns: ${felaktiga.join(' | ')}`).toHaveLength(0)
  })

  test('skrivvägen är oförändrad — den har alltid använt lost_reason', () => {
    expect(read('app/api/pipeline/deals/[id]/move/route.ts')).toContain("update({ lost_reason:")
  })
})

test.describe('communication-check är fail-closed', () => {
  const src = read('app/api/cron/communication-check/route.ts')

  test('läsfel på communication_settings stoppar allt utgående', () => {
    expect(src).toContain('settingsError')
    // Felgrenen måste returnera FÖRE loopen som triggar agenten.
    const felIndex = src.indexOf('if (settingsError)')
    const triggerIndex = src.indexOf('triggerAgentInternal(')
    expect(felIndex).toBeGreaterThan(-1)
    expect(felIndex).toBeLessThan(triggerIndex)
  })

  test('kill-switchen agents_globally_paused respekteras', () => {
    expect(src).toContain('agents_globally_paused')
    expect(src).toContain("b.agents_globally_paused !== true")
  })

  test('felet swäljs aldrig igen — error läses, inte bara data', () => {
    expect(src).not.toMatch(/const \{ data: disabledSettings \} =/)
  })
})
