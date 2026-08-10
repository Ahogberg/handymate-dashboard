/**
 * Uppföljningskontraktet — godkända uppföljningar måste LANDA någonstans.
 *
 * Bakgrund (tasks/rapport-human-followup-queue.md, 2026-08-10): godkända
 * follow_up/callback/reminder-förslag svarade "Uppföljning schemalagd!" men
 * raden skrevs till human_followup_queue — en kö som ingen vy, cron eller
 * kod någonsin läste. Auto-approve-vägen var värst: ingen människa hade ens
 * sett förslaget som "schemalades".
 *
 * Kontraktet: createFollowUp skriver till TASKSYSTEMET (ytan hantverkaren
 * faktiskt använder), med visibility 'team' — v42-regeln gör en rad utan
 * skapare/tilldelad med 'private' osynlig för ALLA, vilket hade återskapat
 * läckan inuti tasksystemet.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/followup-landar.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')

const FILER = [
  'lib/approve-actions.ts',
  'app/api/suggestions/approve/route.ts',
]

for (const fil of FILER) {
  const källa = fs.readFileSync(path.join(ROOT, fil), 'utf8')
  const fn = källa.slice(källa.indexOf('function createFollowUp'))
  const insertBlock = fn.slice(0, fn.indexOf('return { success: true }'))

  test.describe(fil, () => {
    test('skriver aldrig till kön ingen läser', () => {
      expect(källa).not.toContain('human_followup_queue')
    })

    test('uppföljningen landar i tasksystemet', () => {
      expect(insertBlock).toContain(".from('task')")
    })

    test("visibility är 'team' — annars syns AI-uppföljningen inte för någon", () => {
      expect(insertBlock).toContain("visibility: 'team'")
    })

    test("prioriteten mappas till task-schemats CHECK — 'normal' får inte läcka igenom", () => {
      expect(insertBlock).not.toContain('priority: suggestion.priority')
      expect(insertBlock).toContain("'medium'")
    })
  })
}
