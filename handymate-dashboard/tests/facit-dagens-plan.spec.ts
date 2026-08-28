/**
 * Facit: "Dagens plan" på startsidan — dina uppgifter i dag + Lars tips globalt (2026-08-28).
 *   npx playwright test tests/facit-dagens-plan.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { suggestHomeTips, homeTipPriority, MAX_HOME_TIPS, MAX_HOME_TIPS_PER_PROJECT } from '../lib/tasks/lars-tips-batch'
import type { TipInput } from '../lib/tasks/lars-tips'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const bas: TipInput = {
  todayIso: '2026-08-28', stageId: 'ps-01', status: 'planning', startDate: '2026-09-03', endDate: '2026-09-20', completedAt: null,
  name: 'Badrumsrenovering', description: null, jobType: null,
  bookingCount: 0, upcomingBookingCount: 0, materialCount: 0, milestoneCount: 0, checklistCount: 0, lastTimeEntryDate: null,
  hasRot: false, customerPropertyDesignation: null, customerPersonalNumber: null, serialPendingInstallations: [],
  jobbpassStatus: 'none', jobbpassNotified: false, openTaskTitles: [], dismissedKeys: [],
}

test.describe('rena regler för startsidan', () => {
  test('prioritet: passerat slut → besök i dag → närmast start → övrigt', () => {
    expect(homeTipPriority({ ...bas, endDate: '2026-08-20' }, null)).toBe(0)
    expect(homeTipPriority(bas, '10:00')).toBe(1)
    expect(homeTipPriority(bas, null)).toBe(2 + 6)
    expect(homeTipPriority({ ...bas, startDate: null, endDate: null }, null)).toBe(99)
  })

  test('max tre totalt, max två per projekt, besök i dag prefixar varför-raden och sorteras upp', () => {
    const inputs = new Map<string, TipInput>([
      ['pA', { ...bas, startDate: '2026-09-08' }],                        // start om 11 dagar → bara startmöte
      ['pB', { ...bas, upcomingBookingCount: 1, startDate: '2026-09-05' }], // besök i dag (startmöte tystas), material kvar
      ['pC', { ...bas, startDate: '2026-08-30' }],                        // start om 2 dagar → tre regler, max två
    ])
    const meta = new Map([
      ['pA', { name: 'A', project_number: 'P-1', bookingToday: null }],
      ['pB', { name: 'B', project_number: 'P-2', bookingToday: '10:00' }],
      ['pC', { name: 'C', project_number: 'P-3', bookingToday: null }],
    ])
    const tips = suggestHomeTips(inputs, meta)
    expect(tips.length).toBe(MAX_HOME_TIPS)
    expect(tips[0].project_id).toBe('pB')
    expect(tips[0].reason).toBe('Besök i dag 10:00 — inga materialrader, start om 8 dagar')
    expect(tips[1].project_id).toBe('pC')
    expect(tips.filter(t => t.project_id === 'pC').length).toBe(MAX_HOME_TIPS_PER_PROJECT)
    expect(tips.map(t => t.project_id)).toEqual(['pB', 'pC', 'pC'])
    expect(tips.every(t => t.project_number)).toBe(true)
  })

  test('avvisade och täckta tips tystar även på startsidan; inga projekt → tomt', () => {
    const inputs = new Map<string, TipInput>([['p', { ...bas, dismissedKeys: ['boka_startmote', 'bestall_material', 'planera_delmoment'] }]])
    expect(suggestHomeTips(inputs, new Map([['p', { name: 'x', project_number: null, bookingToday: null }]]))).toEqual([])
    expect(suggestHomeTips(new Map(), new Map())).toEqual([])
  })
})

test.describe('kopplingen', () => {
  test('rutten läser bara, batchar, respekterar rollgränsen och svarar med uppgifter + tips', () => {
    const r = kod('app/api/tips/home/route.ts')
    expect(r).toContain("export const dynamic = 'force-dynamic'")
    expect(r).toContain('loadTipInputs(')
    expect(r).toContain('suggestHomeTips(')
    expect(r).toContain('resolveTaskScope(')
    expect(r).toContain('.filter(t => canSeeTask(t, scope))')
    expect(r).toContain("from('project_assignment')")
    expect(r).not.toMatch(/\.insert\(|\.update\(|\.delete\(|anthropic|openai|sendSms/i)
    const b = kod('lib/tasks/lars-tips-batch.ts')
    expect(b).toContain(".in('project_id', ids)")
    expect(b).not.toMatch(/anthropic|openai/i)
  })

  test('startsidan monterar DagensPlanExtra i "Dagens plan"; komponenten skriver bara via befintliga rutter', () => {
    const home = kod('components/jarvis/JarvisHome.tsx')
    const card = home.slice(home.indexOf('<RailCard title="Dagens plan"'), home.indexOf('</RailCard>', home.indexOf('<RailCard title="Dagens plan"')))
    expect(card).toContain('<DagensPlanExtra />')
    const c = kod('components/jarvis/DagensPlanExtra.tsx')
    expect(c).toContain("fetch('/api/tips/home')")
    expect(c).toContain("fetch('/api/tasks', { method: 'PUT'")
    expect(c).toContain('fetch(`/api/projects/${tip.project_id}/tips`')
    expect(c).toContain('Dina uppgifter i dag')
    expect(c).toContain('Lars tipsar')
    expect(c).toContain("agentKey=\"lars\"")
    // Tyst vid fel/tomt — aldrig en påhittad rad
    expect(c).toContain('if (!loaded || (tasks.length === 0 && tips.length === 0)) return null')
  })
})
