import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { deriveBrainOverview, scheduledFollowupCount } from '../lib/jarvis/brain-overview'

const root = path.resolve(__dirname, '..')
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

test('femlägesadaptern skiljer laddning från okända källor', () => {
  const loading = deriveBrainOverview({ handledVerified: undefined, missionState: 'loading', missionActive: false, waitingFollowups: null, decisions: undefined, moneyCases: undefined })
  expect(loading.every(cell => cell.value === 'Läser läget…')).toBe(true)
  const cells = deriveBrainOverview({ handledVerified: null, missionState: 'unavailable', missionActive: false, waitingFollowups: null, decisions: null, moneyCases: null })
  expect(cells).toHaveLength(5)
  expect(cells.every(cell => cell.value === 'Läget kunde inte läsas')).toBe(true)
  expect(cells.map(cell => cell.value).join(' ')).not.toContain('Inga beslut')
})

test('adaptern skiljer sparat uppdrag, väntande uppföljningar och begränsade listor', () => {
  const cells = Object.fromEntries(deriveBrainOverview({ handledVerified: 4, missionState: 'known', missionActive: true, waitingFollowups: 2, decisions: 15, moneyCases: 3 }).map(cell => [cell.label, cell.value]))
  expect(cells['Arbetar med']).toBe('Aktivt uppdrag – öppna för aktuellt läge')
  expect(cells['Arbetar med']).not.toMatch(/kör|utför/)
  expect(cells['Väntar på']).toBe('2 planerade uppföljningar i uppdraget')
  expect(cells['Behöver dig']).toBe('15 visade beslut')
  expect(cells['Hanterat']).toBe('4 visade verifierade resultat')
  expect(cells['Pengar']).toBe('3 synliga pengakategorier')
  expect(cells['Pengar']).not.toContain('kr')
})

test('känt tomt uppdragsläge påstår inte en global nolla för väntande arbete', () => {
  const cells = Object.fromEntries(deriveBrainOverview({ handledVerified: 0, missionState: 'known', missionActive: false, waitingFollowups: null, decisions: 0, moneyCases: 0 }).map(cell => [cell.label, cell.value]))
  expect(cells['Arbetar med']).toBe('Inget aktivt uppdrag')
  expect(cells['Väntar på']).toBe('Inget aktivt uppdrag')
})

test('bara faktiskt schemalagda uppföljningar räknas som väntande', () => {
  expect(scheduledFollowupCount(null)).toBeNull()
  expect(scheduledFollowupCount({ followups: [
    { state: 'scheduled' }, { state: 'prepared' }, { state: 'completed' }, { state: 'failed' }, { state: 'cancelled' },
  ] })).toBe(1)
  expect(scheduledFollowupCount({ followups: [] })).toBe(0)
})

test('beslutsstatus kräver både kön och NBA inom aktuell företagsscope', () => {
  const home = read('components/jarvis/JarvisHome.tsx')
  expect(home).toContain('const decisionsKnown = queueKnown && nbaKnown')
  expect(home).toContain('businessScopeRef.current === requestedBusinessId')
  expect(home).toContain("throw new Error('invalid approvals payload')")
  expect(home).toContain('setQueueKnown(false)')
  expect(home).toContain('setNbaKnown(false)')
  expect(home).toContain('setNbaLoaded(false)')
  expect(home).toContain('const decisionsLoaded = queueLoaded && nbaLoaded')
  expect(home).toContain('data?.recommendation === null')
  const page = read('app/dashboard/page.tsx')
  expect(page).toContain("key={`${business.business_id}:${user?.id || ''}`}")
})

test('aktivitetsläsningen bevisar bara exakta utfall och redovisar källornas fullständighet', () => {
  const route = read('app/api/automations/activity/route.ts')
  expect(route).toContain("export const dynamic = 'force-dynamic'")
  expect(route).toContain("'Cache-Control': 'no-store'")
  expect(route).toContain("automation_type === 'veckorapport'")
  expect(route).toContain("a.status === 'delivered'")
  expect(route).toContain("select('id, channel, message, status, created_at')")
  expect(route).not.toMatch(/communication_log'[\s\S]{0,300}ai_reason/)
  expect(route).toContain('verified: false')
  for (const source of ['rules: ruleErr', 'pipeline: pipelineError', 'communication: commError']) expect(route).toContain(source)
})

test('hero visar läsfel i stället för evig skeleton', () => {
  const hero = read('components/jarvis/home/MatteHero.tsx')
  expect(hero).toContain('heroFailed')
  expect(hero).toContain('Läget kunde inte läsas. Försök igen.')
  expect(hero).toContain('missionError')
})
