/**
 * Facit: Daniels agentrad på offertsidan (2026-09-06).
 *
 * Skiss: docs/design/skisser-2026-09-06/agentnarvaro-offert.dc.html — bara
 * "agentrad"-mönstret (marginalnotisen är utanför scope). Rena prov på
 * lib/daniel-agentrad.ts + källskanningar av montering, kvittoetikett,
 * inlärningsrutt och auth. Ingen mount, ingen DB.
 *
 *   npx playwright test tests/daniel-agentrad.spec.ts --no-deps
 */
import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import {
  AGENTRAD_MIN_SAMPLE,
  AGENTRAD_SNOOZE_MS,
  buildAgentradExamples,
  buildAgentradSentence,
  buildDecisionPreference,
  countOverruns,
  formatDeltaHours,
  formatMonthYear,
  readAgentradVisibility,
  shouldShowAgentrad,
  snoozeUntil,
  truncateLesson,
  writeAgentradState,
} from '../lib/daniel-agentrad'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

const rows = [
  { project_id: 'p1', closed_at: '2026-07-02T10:00:00Z', quoted_hours: 16, actual_hours: 25, hours_diff_pct: 56, time_learning_eligible: true },
  { project_id: 'p2', closed_at: '2026-08-14T10:00:00Z', quoted_hours: 20, actual_hours: 27.4, hours_diff_pct: 37, time_learning_eligible: true },
  { project_id: 'p3', closed_at: '2026-05-20T10:00:00Z', quoted_hours: 12, actual_hours: 12, hours_diff_pct: 0, time_learning_eligible: true },
  { project_id: 'p4', closed_at: '2026-09-01T10:00:00Z', quoted_hours: 10, actual_hours: 9, hours_diff_pct: -10, time_learning_eligible: true },
  { project_id: 'p5', closed_at: '2026-09-03T10:00:00Z', quoted_hours: 10, actual_hours: 30, hours_diff_pct: 200, time_learning_eligible: false },
  { project_id: 'p6', closed_at: null, quoted_hours: null, actual_hours: null, hours_diff_pct: null, time_learning_eligible: true },
]

test.describe('ren kärna — räkningen "N av M"', () => {
  test('bara kvalitetsgrindade utfall räknas, och bara de som faktiskt gick över', () => {
    expect(countOverruns(rows)).toEqual({ over_count: 2, sample_count: 4 })
  })

  test('alla över ger "7 av 7"', () => {
    const seven = Array.from({ length: 7 }, (_, i) => ({
      project_id: `p${i}`, quoted_hours: 16, actual_hours: 25, time_learning_eligible: true,
    }))
    expect(countOverruns(seven)).toEqual({ over_count: 7, sample_count: 7 })
  })

  test('exempelkorten: nyast avslutat först, max tre, hela timmar i deltat', () => {
    const examples = buildAgentradExamples(rows, { p1: 'Badrum Ekvägen 4', p2: 'Kök Storgatan 12', p4: null })
    expect(examples.map(e => e.project_id)).toEqual(['p4', 'p2', 'p1'])
    expect(examples[1]).toMatchObject({ name: 'Kök Storgatan 12', delta_hours: 7, quoted_hours: 20, actual_hours: 27.4 })
    expect(examples[0].name).toBe('Projekt utan namn')
    expect(examples[0].delta_hours).toBe(-1)
  })
})

test.describe('ren kärna — grinden', () => {
  const ready = { status: 'ready', show_warning: true, similar_jobs: 3, quote_status: 'draft' }

  test('utkast + varning + minst tre jobb ⇒ rad', () => {
    expect(AGENTRAD_MIN_SAMPLE).toBe(3)
    expect(shouldShowAgentrad(ready)).toBe(true)
  })

  test('skickad eller accepterad offert får ingen rad', () => {
    expect(shouldShowAgentrad({ ...ready, quote_status: 'sent' })).toBe(false)
    expect(shouldShowAgentrad({ ...ready, quote_status: 'accepted' })).toBe(false)
    expect(shouldShowAgentrad({ ...ready, quote_status: null })).toBe(false)
  })

  test('färre än tre jobb, ingen varning eller otillgänglig källa ⇒ ingen rad', () => {
    expect(shouldShowAgentrad({ ...ready, similar_jobs: 2 })).toBe(false)
    expect(shouldShowAgentrad({ ...ready, show_warning: false })).toBe(false)
    expect(shouldShowAgentrad({ ...ready, status: 'unavailable' })).toBe(false)
    expect(shouldShowAgentrad({ ...ready, status: 'insufficient' })).toBe(false)
  })
})

test.describe('ren kärna — meningen', () => {
  test('varje tal i meningen är mätt: antal, över, buffert, offertens timmar', () => {
    const sentence = buildAgentradSentence({ sample_count: 7, over_count: 7, suggested_buffer_hours: 9, quoted_hours: 16 })
    expect(sentence).toBe('Lärdom från 7 liknande jobb: 7 av 7 tog mer tid än offererat, i snitt +9 h. Den här offerten räknar med 16 h.')
  })

  test('halvtimmar skrivs med svenskt decimalkomma', () => {
    const sentence = buildAgentradSentence({ sample_count: 4, over_count: 3, suggested_buffer_hours: 4.5, quoted_hours: 18.5 })
    expect(sentence).toContain('+4,5 h')
    expect(sentence).toContain('räknar med 18,5 h')
  })

  test('lärdomen citeras bara när den finns — och kortas i raden', () => {
    const utan = buildAgentradSentence({ sample_count: 3, over_count: 3, suggested_buffer_hours: 2, quoted_hours: 8, lesson: null })
    expect(utan).not.toContain('debriefen')
    const long = 'Rivningen i äldre badrum tar alltid längre tid än man tror eftersom golvbrunnen behöver bytas och tätskiktet måste torka innan man kan gå vidare med kaklet.'
    const med = buildAgentradSentence({ sample_count: 3, over_count: 3, suggested_buffer_hours: 2, quoted_hours: 8, lesson: { project_id: 'p1', lesson_text: long, created_at: null } })
    expect(med).toContain('Från debriefen: ”')
    expect(med).toContain('…”')
    expect(truncateLesson(long).length).toBeLessThanOrEqual(121)
    expect(truncateLesson('Kort lärdom.')).toBe('Kort lärdom.')
  })

  test('deltat i korten: plus i amber, minus med riktigt minustecken, noll är noll', () => {
    expect(formatDeltaHours(9)).toBe('+9 h')
    expect(formatDeltaHours(-2)).toBe('−2 h')
    expect(formatDeltaHours(0)).toBe('±0 h')
    expect(formatMonthYear('2026-09-15T12:00:00Z')).toBe('september 2026')
    expect(formatMonthYear(null)).toBeNull()
  })

  test('den lärda preferensen är en svensk mening per val', () => {
    expect(buildDecisionPreference('lagg_till', 9)).toContain('+9 h')
    expect(buildDecisionPreference('behall', 16)).toContain('16 h')
    expect(buildDecisionPreference('behall', 16)).toMatch(/Behåller/)
  })
})

test.describe('ren kärna — snooza och avfärda', () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial))
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
      dump: () => Object.fromEntries(store),
    }
  }

  test('snooze är 24 timmar och räknas från nu', () => {
    expect(AGENTRAD_SNOOZE_MS).toBe(24 * 60 * 60 * 1000)
    expect(snoozeUntil(1_000)).toBe(1_000 + AGENTRAD_SNOOZE_MS)
  })

  test('snoozad tills tiden gått, sedan synlig igen', () => {
    const storage = memoryStorage()
    const now = Date.parse('2026-09-06T08:00:00Z')
    writeAgentradState('q1', storage, { until: snoozeUntil(now) })
    expect(storage.dump()).toEqual({ hm_daniel_rad_q1: JSON.stringify({ until: now + AGENTRAD_SNOOZE_MS }) })
    expect(readAgentradVisibility('q1', storage, now + 1)).toBe('snoozed')
    expect(readAgentradVisibility('q1', storage, now + AGENTRAD_SNOOZE_MS + 1)).toBe('visible')
    expect(readAgentradVisibility('q2', storage, now)).toBe('visible')
  })

  test('avfärdad är avfärdad — och ingen lagring eller trasig lagring ⇒ synlig', () => {
    const storage = memoryStorage({ hm_daniel_rad_q1: JSON.stringify({ dismissed: true }), hm_daniel_rad_q3: '{not json' })
    expect(readAgentradVisibility('q1', storage, Date.now())).toBe('dismissed')
    expect(readAgentradVisibility('q3', storage, Date.now())).toBe('visible')
    expect(readAgentradVisibility('q1', null, Date.now())).toBe('visible')
    const kastar = { getItem: () => { throw new Error('SecurityError') }, setItem: () => { throw new Error('SecurityError') } }
    expect(readAgentradVisibility('q1', kastar, Date.now())).toBe('visible')
    expect(() => writeAgentradState('q1', kastar, { dismissed: true })).not.toThrow()
  })
})

test.describe('källskanning — montering och kvittoetikett', () => {
  test('offertsidan monterar raden mellan QuoteHeader och dokumentgriden', () => {
    const page = read('app/dashboard/quotes/[id]/page.tsx')
    const headerStart = page.indexOf('<QuoteHeader')
    const headerEnd = page.indexOf('/>', headerStart)
    const mount = page.indexOf('<DanielAgentrad', headerEnd)
    const grid = page.indexOf('lg:grid-cols-[1fr_minmax(320px,380px)]', headerEnd)
    expect(headerStart).toBeGreaterThan(-1)
    expect(mount, 'DanielAgentrad monteras inte efter QuoteHeader').toBeGreaterThan(headerEnd)
    expect(grid, 'dokumentgriden hittades inte').toBeGreaterThan(mount)
    expect(page).toContain('quoteStatus={quote.status}')
  })

  test('komponenten använder exakt "Visa varför"/"Dölj", Snooza och Avfärda — och ingen fritextsiffra', () => {
    const src = read('app/dashboard/quotes/[id]/components/DanielAgentrad.tsx')
    expect(src).toContain("'Visa varför'")
    expect(src).toContain("'Dölj'")
    expect(src).not.toContain('Visa</')
    expect(src).toContain('Snooza')
    expect(src).toContain('aria-label="Avfärda"')
    expect(src).toContain('Så kom Daniel fram till det')
    expect(src).toContain('Ditt val lär Daniel hur du vill räkna.')
    expect(src).toContain('agentKey="daniel"')
    // Timmarna i raden är mätta ur project_outcome — ingen "Uppskattat"-pill,
    // inget pris och inga LLM-formulerade siffror.
    expect(src).not.toContain('Uppskattat')
    expect(src).not.toMatch(/\bkr\b/)
    expect(src).not.toContain('suggested_price')
  })

  test('"Lägg till" öppnar redigeraren med ?buffert= i stället för att ändra rader själv', () => {
    const src = read('app/dashboard/quotes/[id]/components/DanielAgentrad.tsx')
    expect(src).toContain('/edit?buffert=')
    expect(src).not.toContain("from('quote_items')")
    expect(src).not.toContain('quote_items.id')
    expect(src).toContain('writeAgentradState(')
    expect(src).toContain('readAgentradVisibility(')
    expect(read('lib/daniel-agentrad.ts')).toContain('`hm_daniel_rad_${quoteId}`')
  })

  test('redigeraren visar Daniels notis vid ?buffert=N utan att lägga på timmar', () => {
    const builder = read('app/dashboard/quotes/_shared/QuoteBuilder.tsx')
    expect(builder).toContain("searchParams?.get('buffert')")
    expect(builder).toContain('Lägg dem på arbetsraden.')
  })
})

test.describe('källskanning — API och inlärning', () => {
  test('intelligensrutten är force-dynamic, tenant-skopad och bär agentrad-bevisen', () => {
    const src = read('app/api/quotes/intelligence/route.ts')
    expect(src).toContain("export const dynamic = 'force-dynamic'")
    expect(src).toContain('getAuthenticatedBusiness(request)')
    expect(src).toContain('getDanielAgentradEvidence(')
    expect(src).toContain('AGENTRAD_MIN_SAMPLE')
    expect(src).toContain('analysis.show_warning')
  })

  test('bevisläsningen matchar som verklighetskontrollen (mall först, aldrig fritext) och skopar varje fråga', () => {
    const src = read('lib/daniel-agentrad-evidence.ts')
    expect(src).toContain("quote_status !== 'draft'")
    expect(src).toContain(".eq('template_id', templateId)")
    expect(src).toContain(".eq('job_type', jobType as string)")
    expect(src).toContain(".eq('calculation_version', OUTCOME_CALCULATION_VERSION)")
    expect(src).not.toContain('ilike')
    expect(src).not.toContain('textSearch')
    const scoped = (src.match(/\.eq\('business_id', businessId\)/g) || []).length
    const froms = (src.match(/\.from\('/g) || []).length
    expect(scoped, 'varje .from() ska ha ett .eq(business_id)').toBe(froms)
    expect(src).toContain(".from('project')")
    expect(src).toContain(".from('project_lesson')")
    expect(src).toContain(".order('created_at', { ascending: false })")
  })

  test('beslutsrutten skriver ett quote_price_adjusted-event via recordLearningEvent, auth + tenant', () => {
    const src = read('app/api/quotes/intelligence/decision/route.ts')
    expect(src).toContain("export const dynamic = 'force-dynamic'")
    expect(src).toContain('getAuthenticatedBusiness(request)')
    expect(src).toContain("'quote_price_adjusted'")
    expect(src).toContain("'quote',")
    expect(src).toContain('recordLearningEvent(')
    expect(src).toContain('const result = await recordLearningEvent(')
    expect(src).toContain('suggested_buffer_hours')
    expect(src).toContain('recommended_hours')
    expect(src).toContain('buildDecisionPreference(')
    expect(src).toContain(".eq('business_id', business.business_id)")
    expect(src).not.toContain('body.business_id')
    expect(src).not.toContain("from('quote_items')")
  })

  test('learning-engine tar emot learned_preference utan att ändra gamla anropare', () => {
    const src = read('lib/agent/learning-engine.ts')
    expect(src).toContain('learned?: { learnedPreference?: string; preferenceCategory?: string }')
    expect(src).toContain('learned_preference: learned.learnedPreference')
  })

  test('specen är registrerad lokalt och i CI, på samma plats', () => {
    const scripts = JSON.parse(read('package.json')).scripts
    expect(scripts['test:contracts']).toContain('tests/daniel-agentrad.spec.ts')
    expect(fs.readFileSync(path.join(ROOT, '..', '.github', 'workflows', 'contracts.yml'), 'utf8')).toContain('tests/daniel-agentrad.spec.ts')
  })
})
