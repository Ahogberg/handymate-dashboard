/**
 * Facit: projektlistan redovisar datum ärligt (projektöversikten Del A, 2026-08-26).
 *
 * Bakgrund: listan visade BARA nästa milstolpes förfallodag — start_date/
 * end_date renderades aldrig trots att API:t skickade dem, is_late räknades
 * bara bakom include=workflow som listan aldrig bad om, och inget
 * skapandeflöde satte datum ens när det VISSTE ett (bokningens dag).
 *
 *   npx playwright test tests/facit-project-list-dates.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test.describe('GET /api/projects — datumraden härleds i API:t', () => {
  const s = read('app/api/projects/route.ts')

  test('faktisk start härleds ur tidrapporternas work_date och passerade bekräftade bokningar', () => {
    expect(s).toContain("select('project_id, duration_minutes, hourly_rate, is_billable, invoiced, work_date')")
    expect(s).toContain(".in('status', ['confirmed', 'completed'])")
    expect(s).toContain(".lte('scheduled_start', new Date().toISOString())")
    expect(s, 'bokningsuppslaget läser error').toContain('if (bookingError)')
  })

  test('varje rad får dates + actual_start — alltid, inte bara med include=workflow', () => {
    const base = s.slice(s.indexOf('const base = {'), s.indexOf('if (!includeWorkflow) return base'))
    expect(base).toContain('dates: deriveProjectDates({')
    expect(base).toContain('actual_start: actualStartByProject.get(project.project_id) || null')
  })

  test('is_late är samma härledning som datumraden — ingen andra kopia', () => {
    expect(s).toContain('const isLate = base.dates.is_late')
    expect(s).not.toMatch(/new Date\(project\.end_date\)\.getTime\(\) < nowMs/)
  })
})

test.describe('projektlistan visar datumraden', () => {
  const s = read('app/dashboard/projects/page.tsx')

  test('listan ber om include=workflow', () => {
    expect(s).toContain('/api/projects?status=${filter}&include=workflow')
  })

  test('raden renderar dates.label + sublabel, och milstolpen är märkt som milstolpe', () => {
    expect(s).toContain('{project.dates.label}')
    expect(s).toContain('{project.dates.sublabel}')
    expect(s).toContain('title="Nästa milstolpe"')
  })
})

test.describe('datum sätts bara när de är KÄNDA', () => {
  test('bokningsfött projekt får start_date = bokningens dag; inget annat flöde gissar', () => {
    const helper = read('lib/projects/maybe-create-from-booking.ts')
    expect(helper).toContain('start_date: startDate')
    expect(helper).toContain("scheduledStart.slice(0, 10)")
    expect(read('app/api/bookings/route.ts')).toContain('scheduledStart: scheduled_start || null')
    // Signeringsdagen är ingen byggstart — onQuoteAccepted sätter inte längre start_date=idag.
    const engine = read('lib/project-ai-engine.ts')
    expect(engine).not.toContain("start_date: new Date().toISOString().split('T')[0]")
  })
})

test.describe('en beräkning, två ytor', () => {
  test('weekChip bor i lib/projects/derive-dates.ts och re-exporteras av ProjectStatusCard', () => {
    expect(read('lib/projects/derive-dates.ts')).toContain('export function weekChip(')
    const card = read('components/projects/ProjectStatusCard.tsx')
    expect(card).toContain("import { weekChip } from '@/lib/projects/derive-dates'")
    expect(card).toContain('export { weekChip }')
    expect(card, 'ingen egen kopia av beräkningen kvar').not.toContain('export function weekChip(')
    expect(read('lib/projects/derive-dates.ts'), 'servern får inte importera en use client-modul').not.toContain("from '@/components/")
  })

  test('detaljsidan kan redigera planerad start/slut på plats via befintlig PUT', () => {
    const twin = read('components/projects/TwinStrip.tsx')
    expect(twin).toContain('onSaveDates?: (start: string | null, end: string | null) => Promise<boolean>')
    expect(twin).toContain('type="date"')
    const page = read('app/dashboard/projects/[id]/page.tsx')
    expect(page).toContain('onSaveDates={async (start, end) => {')
    expect(page).toContain("body: JSON.stringify({ project_id: project.project_id, start_date: start, end_date: end })")
  })
})
