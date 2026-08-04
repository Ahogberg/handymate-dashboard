/**
 * Smart Dispatch — facit-tester för de rena, extraherbara delarna av
 * matchningslogiken (tasks/resurs-masterplan.md, R1-C): jobbtyp→skill-
 * normalisering och specialties↔skills-källvalet. Körs:
 *   npx playwright test tests/dispatch-matching.spec.ts --no-deps
 *
 * suggestDispatch() självt (DB-anrop, poängsättning, approval-insert)
 * testas INTE här — bara de rena, exporterade byggstenarna, samma
 * upplägg som tests/tidrapport-forslag.spec.ts.
 */
import { test, expect } from '@playwright/test'
import { normalizeJobType, resolveMemberSkills } from '../lib/dispatch'

test.describe('normalizeJobType', () => {
  test('elektriker-relaterade ord → el', () => {
    expect(normalizeJobType('Elinstallation i kök')).toContain('el')
    expect(normalizeJobType('Elektriker behövs')).toContain('el')
  })

  test('VVS-relaterade ord → vvs', () => {
    expect(normalizeJobType('Rörläggning badrum')).toContain('vvs')
    expect(normalizeJobType('Vattenläcka')).toContain('vvs')
  })

  test('byggrelaterade ord → bygg', () => {
    expect(normalizeJobType('Snickare för tillbyggnad')).toContain('bygg')
    expect(normalizeJobType('Renovera kök')).toContain('bygg')
  })

  test('målningsrelaterade ord → måleri', () => {
    expect(normalizeJobType('Måla om vardagsrum')).toContain('måleri')
    expect(normalizeJobType('Tapetsera hall')).toContain('måleri')
  })

  test('takrelaterade ord → tak', () => {
    expect(normalizeJobType('Byta taktegel')).toContain('tak')
    expect(normalizeJobType('Plåtarbete')).toContain('tak')
  })

  test('markrelaterade ord → mark', () => {
    expect(normalizeJobType('Trädgårdsarbete')).toContain('mark')
    expect(normalizeJobType('Gräva för dränering')).toContain('mark')
  })

  test('golvrelaterade ord → golv', () => {
    expect(normalizeJobType('Lägga klinker')).toContain('golv')
    expect(normalizeJobType('Golvläggning')).toContain('golv')
  })

  test('okänd/tom text → allman (aldrig tom lista)', () => {
    expect(normalizeJobType('')).toEqual(['allman'])
    expect(normalizeJobType('Diverse smågrejer')).toEqual(['allman'])
  })

  test('flera matchande kategorier i samma text → alla med', () => {
    const result = normalizeJobType('Elarbete och rörläggning i badrummet')
    expect(result).toContain('el')
    expect(result).toContain('vvs')
  })

  test('case-okänsligt', () => {
    expect(normalizeJobType('ELEKTRIKER')).toContain('el')
  })
})

test.describe('resolveMemberSkills — specialties[] är sanningskällan, skills fallback', () => {
  test('specialties satt → används, skills ignoreras helt', () => {
    const result = resolveMemberSkills({ skills: ['el'], specialties: ['vvs', 'bygg'] })
    expect(result).toEqual(['vvs', 'bygg'])
  })

  test('specialties tom array → faller tillbaka på skills', () => {
    const result = resolveMemberSkills({ skills: ['el', 'vvs'], specialties: [] })
    expect(result).toEqual(['el', 'vvs'])
  })

  test('specialties saknas helt (fält finns inte) → faller tillbaka på skills', () => {
    const result = resolveMemberSkills({ skills: ['tak'] })
    expect(result).toEqual(['tak'])
  })

  test('båda tomma → tom lista, ingen krasch', () => {
    expect(resolveMemberSkills({ skills: [], specialties: [] })).toEqual([])
    expect(resolveMemberSkills({ skills: null, specialties: null })).toEqual([])
  })

  test('skills är inte en array (trasig/legacy data) → behandlas som tom, ingen krasch', () => {
    expect(resolveMemberSkills({ skills: 'el', specialties: [] })).toEqual([])
  })

  test('specialties är inte en array → faller tillbaka på skills', () => {
    expect(resolveMemberSkills({ skills: ['golv'], specialties: 'not-an-array' })).toEqual(['golv'])
  })
})
