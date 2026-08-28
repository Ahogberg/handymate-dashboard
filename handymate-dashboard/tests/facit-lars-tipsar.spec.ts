/**
 * Facit: "Lars tipsar" — deterministiska uppgiftstips ur steg och data (2026-08-28).
 *   npx playwright test tests/facit-lars-tipsar.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { suggestProjectTasks, allaTips, coveredByOpenTask, MAX_TIPS_PER_PROJECT, type TipInput } from '../lib/tasks/lars-tips'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const bas: TipInput = {
  todayIso: '2026-08-28', stageId: 'ps-01', status: 'planning', startDate: '2026-09-03', endDate: '2026-09-20', completedAt: null,
  name: 'Badrumsrenovering — Storgatan 3', description: null, jobType: null,
  bookingCount: 0, upcomingBookingCount: 0, materialCount: 0, milestoneCount: 0, checklistCount: 0, lastTimeEntryDate: null,
  hasRot: false, customerPropertyDesignation: null, customerPersonalNumber: null, serialPendingInstallations: [],
  jobbpassStatus: 'none', jobbpassNotified: false, openTaskTitles: [], dismissedKeys: [],
}

test.describe('reglerna säger bara det datat säger', () => {
  test('kontrakt, start om 6 dagar, inget bokat, inget material → startmöte + material — och aldrig fler än två', () => {
    const tips = suggestProjectTasks(bas)
    expect(tips.map(t => t.key)).toEqual(['boka_startmote', 'bestall_material'])
    expect(tips[0].reason).toBe('Start om 6 dagar, inget besök bokat')
    expect(tips[1].reason).toBe('Inga materialrader, start om 6 dagar')
    expect(allaTips(bas).length).toBeGreaterThan(MAX_TIPS_PER_PROJECT)
    expect(MAX_TIPS_PER_PROJECT).toBe(2)
  })

  test('ett bokat besök tystar startmötet; material tystar materialtipset; delmoment nära start', () => {
    expect(allaTips({ ...bas, upcomingBookingCount: 1 }).map(t => t.key)).not.toContain('boka_startmote')
    expect(allaTips({ ...bas, materialCount: 3 }).map(t => t.key)).not.toContain('bestall_material')
    expect(allaTips({ ...bas, startDate: '2026-09-15' }).map(t => t.key)).not.toContain('planera_delmoment')
    expect(allaTips(bas).map(t => t.key)).toContain('planera_delmoment')
  })

  test('ROT utan fastighetsbeteckning; egenkontroll bara för våtrum/el i pågående fas; tid; slutbesiktning', () => {
    const rot = allaTips({ ...bas, hasRot: true, customerPersonalNumber: '19800101-1234' }).find(t => t.key === 'rot_uppgifter')
    expect(rot?.title).toBe('Hämta fastighetsbeteckning för ROT-avdraget')
    expect(allaTips({ ...bas, stageId: 'ps-03', status: 'active' }).map(t => t.key)).toContain('starta_egenkontroll')
    expect(allaTips({ ...bas, stageId: 'ps-03', status: 'active', name: 'Måla fasaden' }).map(t => t.key)).not.toContain('starta_egenkontroll')
    expect(allaTips({ ...bas, stageId: 'ps-01' }).map(t => t.key)).not.toContain('starta_egenkontroll')
    const tid = allaTips({ ...bas, stageId: 'ps-03', status: 'active', lastTimeEntryDate: '2026-08-24' }).find(t => t.key === 'rapportera_tid')
    expect(tid?.reason).toBe('Senaste tidrapport 4 dagar sedan')
    expect(allaTips({ ...bas, stageId: 'ps-03', status: 'active', lastTimeEntryDate: '2026-08-27' }).map(t => t.key)).not.toContain('rapportera_tid')
    const bes = allaTips({ ...bas, stageId: 'ps-04', status: 'active', endDate: '2026-08-26' }).find(t => t.key === 'boka_slutbesiktning')
    expect(bes?.reason).toBe('Planerat slut 2 dagar sedan, ingen besiktning bokad')
  })

  test('avslutat projekt: bara jobbpass-tipset, och bara när kunden inte meddelats', () => {
    const done = { ...bas, status: 'completed', completedAt: '2026-08-27T10:00:00Z', jobbpassStatus: 'published' as const }
    expect(allaTips(done).map(t => t.key)).toEqual(['jobbpass_meddela'])
    expect(allaTips({ ...done, jobbpassNotified: true })).toEqual([])
    expect(allaTips({ ...done, jobbpassStatus: 'draft' })).toEqual([])
  })

  test('serienummer "komplettera senare" ur installationsregistret', () => {
    const t = allaTips({ ...bas, stageId: 'ps-05', status: 'active', serialPendingInstallations: ['Värmepump'] }).find(x => x.key.startsWith('serienummer_'))
    expect(t?.title).toBe('Komplettera serienumret på värmepump')
  })

  test('dedup: avvisade tips och öppna uppgifter med liknande titel tystar', () => {
    expect(suggestProjectTasks({ ...bas, dismissedKeys: ['boka_startmote'] }).map(t => t.key)).toEqual(['bestall_material', 'planera_delmoment'])
    expect(suggestProjectTasks({ ...bas, openTaskTitles: ['Beställ MATERIAL till badrummet'] }).map(t => t.key)).toEqual(['boka_startmote', 'planera_delmoment'])
    expect(coveredByOpenTask(['startmöte'], ['Boka startmote med Anna'])).toBe(true)
    expect(coveredByOpenTask(['startmöte'], ['Ring Anna'])).toBe(false)
  })

  test('inget att säga → tomt, aldrig en påhittad rad', () => {
    expect(suggestProjectTasks({ ...bas, startDate: null, endDate: null })).toEqual([])
  })
})

test.describe('kopplingen', () => {
  test('rutten räknar ur data, skriver aldrig automatiskt; accept skapar uppgift + minns; blocket visar max två', () => {
    const r = kod('app/api/projects/[id]/tips/route.ts')
    expect(r).toContain('suggestProjectTasks(')
    expect(r).toContain("export const dynamic = 'force-dynamic'")
    expect(r).not.toMatch(/anthropic|openai|sendSms|sendPortalNotification/i)
    // GET skapar inget
    const get = r.slice(r.indexOf('export async function GET'), r.indexOf('export async function POST'))
    expect(get).not.toMatch(/\.insert\(|\.update\(|\.delete\(/)
    expect(r).toContain("from('project_tip_dismissal')")
    expect(kod('sql/v177_project_tip_dismissal.sql')).toContain('UNIQUE (project_id, tip_key)')
    const b = kod('components/projects/ProjectTasksBlock.tsx')
    expect(b).toContain('Lars tipsar')
    expect(b).toContain('Inte aktuellt')
    expect(b).toContain("agentKey=\"lars\"")
    expect(kod('app/dashboard/projects/[id]/page.tsx')).toContain('/tips`)')
  })
})
