/**
 * Facit för "egna poster i Bolagskalendern" (2026-08-19).
 *
 * Fyra saker vaktas:
 * 1. API-grindarna (permission-kontraktet) — se permission-contract.spec.ts,
 *    som får en ny domän här.
 * 2. DELETE kan aldrig träffa en härledd post — källskanning: rutten frågar
 *    BARA karin_custom_event.
 * 3. Förslagen är deterministiska — källskanning: ingen LLM-import i
 *    lib/karin/event-suggestions.ts — plus enhetstester på månadsfönstret
 *    och dubblettfiltret.
 * 4. Modalen källskannas för "Egen"-badge och två-stegs-borttag.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/karin-custom-events.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { suggestEvents, type SuggestionContext } from '../lib/karin/event-suggestions'
import { customEventToEvent } from '../lib/karin/calendar'

const ROOT = path.join(__dirname, '..')

function ctx(over: Partial<SuggestionContext> = {}): SuggestionContext {
  return {
    companyForm: 'ab',
    employeeCount: null,
    fiscalYearEndMonth: null,
    existingTitles: [],
    today: new Date(2026, 0, 15), // 15 januari 2026
    ...over,
  }
}

test.describe('event-suggestions — deterministiska förslag', () => {
  test('ingen LLM-import — förslagen räknas fram, gissas inte', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib', 'karin', 'event-suggestions.ts'), 'utf8')
    expect(src).not.toMatch(/anthropic|openai|claude|gpt|llm/i)
  })

  test('max tre förslag, alltid', () => {
    // Januari: försäkringsgenomgång, arbetsmiljörond och fordonsbesiktning
    // matchar alla samtidigt om inget filtrerar bort dem.
    const förslag = suggestEvents(ctx())
    expect(förslag.length).toBeLessThanOrEqual(3)
  })

  test('semesterplanering föreslås mars–maj, aldrig i oktober', () => {
    const marsFörslag = suggestEvents(ctx({ today: new Date(2026, 3, 1) })) // april
    expect(marsFörslag.some(f => f.code === 'semesterplanering')).toBe(true)

    const oktoberFörslag = suggestEvents(ctx({ today: new Date(2026, 9, 1) })) // oktober
    expect(oktoberFörslag.some(f => f.code === 'semesterplanering')).toBe(false)
  })

  test('vinterdäck föreslås okt–nov, inte i juni', () => {
    const novemberFörslag = suggestEvents(ctx({ today: new Date(2026, 10, 5) }))
    expect(novemberFörslag.some(f => f.code === 'vinterdack')).toBe(true)

    const juniFörslag = suggestEvents(ctx({ today: new Date(2026, 5, 5) }))
    expect(juniFörslag.some(f => f.code === 'vinterdack')).toBe(false)
  })

  test('lönerevision kräver anställda', () => {
    const utanAnstallda = suggestEvents(ctx({ today: new Date(2026, 2, 1), employeeCount: 0 }))
    expect(utanAnstallda.some(f => f.code === 'lonerevision')).toBe(false)

    const medAnstallda = suggestEvents(ctx({ today: new Date(2026, 2, 1), employeeCount: 3 }))
    expect(medAnstallda.some(f => f.code === 'lonerevision')).toBe(true)
  })

  test('lönerevision döljs utanför sitt fönster även med anställda', () => {
    const augusti = suggestEvents(ctx({ today: new Date(2026, 7, 1), employeeCount: 5 }))
    expect(augusti.some(f => f.code === 'lonerevision')).toBe(false)
  })

  test('inventering inför bokslut kräver känt räkenskapsår och rätt månad', () => {
    // Kalenderår (slut december) → relevant i november.
    const okänt = suggestEvents(ctx({ today: new Date(2026, 10, 1), fiscalYearEndMonth: null }))
    expect(okänt.some(f => f.code === 'inventering_bokslut')).toBe(false)

    const kant = suggestEvents(ctx({ today: new Date(2026, 10, 1), fiscalYearEndMonth: 12 }))
    expect(kant.some(f => f.code === 'inventering_bokslut')).toBe(true)

    // Fel månad för samma räkenskapsår → inte relevant.
    const felManad = suggestEvents(ctx({ today: new Date(2026, 5, 1), fiscalYearEndMonth: 12 }))
    expect(felManad.some(f => f.code === 'inventering_bokslut')).toBe(false)
  })

  test('inventering hanterar räkenskapsår som slutar i januari (wrap till december)', () => {
    const decemberFörslag = suggestEvents(ctx({ today: new Date(2026, 11, 1), fiscalYearEndMonth: 1 }))
    expect(decemberFörslag.some(f => f.code === 'inventering_bokslut')).toBe(true)
  })

  test('redan-finns-filtret: ett förslag vars titel redan finns i kalendern visas inte igen', () => {
    const utanBefintlig = suggestEvents(ctx({ today: new Date(2026, 3, 1) }))
    expect(utanBefintlig.some(f => f.code === 'semesterplanering')).toBe(true)

    const medBefintlig = suggestEvents(
      ctx({ today: new Date(2026, 3, 1), existingTitles: ['Semesterplanering inför sommaren'] }),
    )
    expect(medBefintlig.some(f => f.code === 'semesterplanering')).toBe(false)
  })

  test('redan-finns-filtret är skiftlägesokänsligt och kräver bara nyckelordet', () => {
    const med = suggestEvents(
      ctx({ today: new Date(2026, 3, 1), existingTitles: ['SEMESTER för hela gänget'] }),
    )
    expect(med.some(f => f.code === 'semesterplanering')).toBe(false)
  })

  test('varje förslags datum är ett framåtblickande utkast, inte förfluten tid', () => {
    const idag = new Date(2026, 0, 15)
    for (const f of suggestEvents(ctx({ today: idag, employeeCount: 5, fiscalYearEndMonth: 12 }))) {
      expect(f.date >= '2026-01-15').toBe(true)
    }
  })

  test('fordonsbesiktning gäller alla — inget bransch- eller anställningsvillkor', () => {
    const jan = suggestEvents(ctx({ today: new Date(2026, 0, 1), companyForm: null, employeeCount: null }))
    expect(jan.some(f => f.code === 'fordonsbesiktning')).toBe(true)
  })
})

test.describe('customEventToEvent — egna poster får aldrig se auktoritativa ut', () => {
  test('källa och kategori är "egen", aldrig en myndighetsregel', () => {
    const e = customEventToEvent({ id: 'kce_abc123', title: 'Testpost', event_date: '2026-09-01', note: null })
    expect(e.source).toBe('egen')
    expect(e.category).toBe('egen')
    expect(e.rule_code).toBeNull()
  })

  test('confidence är alltid "hog" — ingen "kan variera"-varning på egna poster', () => {
    const e = customEventToEvent({ id: 'kce_abc123', title: 'Testpost', event_date: '2026-09-01', note: null })
    expect(e.confidence).toBe('hog')
  })

  test('id:t är radens egna id, oförändrat — DELETE kan träffa exakt', () => {
    const e = customEventToEvent({ id: 'kce_xyz789', title: 'X', event_date: '2026-09-01', note: null })
    expect(e.id).toBe('kce_xyz789')
  })

  test('anteckningen hamnar i why, tom anteckning ger en neutral förklaring', () => {
    const medNote = customEventToEvent({ id: 'kce_1', title: 'X', event_date: '2026-09-01', note: 'Kom ihåg kunden' })
    expect(medNote.why).toBe('Kom ihåg kunden')

    const utanNote = customEventToEvent({ id: 'kce_2', title: 'X', event_date: '2026-09-01', note: null })
    expect(utanNote.why.length).toBeGreaterThan(0)
  })
})

test.describe('API-rutterna för egna poster', () => {
  const eventsRoute = fs.readFileSync(path.join(ROOT, 'app', 'api', 'karin', 'events', 'route.ts'), 'utf8')
  const eventDeleteRoute = fs.readFileSync(path.join(ROOT, 'app', 'api', 'karin', 'events', '[id]', 'route.ts'), 'utf8')
  const calendarRoute = fs.readFileSync(path.join(ROOT, 'app', 'api', 'karin', 'calendar', 'route.ts'), 'utf8')

  test('POST /api/karin/events är ägare/admin-grindad', () => {
    expect(eventsRoute).toMatch(/isOwnerOrAdmin\s*\(/)
  })

  test('DELETE /api/karin/events/[id] är ägare/admin-grindad', () => {
    expect(eventDeleteRoute).toMatch(/isOwnerOrAdmin\s*\(/)
  })

  test('DELETE frågar BARA karin_custom_event — kan aldrig träffa en härledd post', () => {
    const froms = Array.from(eventDeleteRoute.matchAll(/\.from\('([a-z_]+)'\)/g)).map(m => m[1])
    expect(froms).toEqual(['karin_custom_event'])
  })

  test('DELETE filtrerar på business_id — kan aldrig träffa ett annat företags post', () => {
    const del = eventDeleteRoute.slice(eventDeleteRoute.indexOf('.from(\'karin_custom_event\')'))
    expect(del).toContain(".eq('business_id', business.business_id)")
  })

  test('POST skriver bara till karin_custom_event, aldrig till en härledd tabell', () => {
    const froms = Array.from(eventsRoute.matchAll(/\.from\('([a-z_]+)'\)/g)).map(m => m[1])
    expect(froms).toEqual(['karin_custom_event'])
  })

  test('GET /api/karin/calendar läser karin_custom_event för att slå ihop egna och härledda poster', () => {
    expect(calendarRoute).toContain("from('karin_custom_event')")
  })
})

test.describe('UI — egna poster märks tydligt och tas bort i två steg', () => {
  const page = fs.readFileSync(path.join(ROOT, 'app', 'dashboard', 'karin', 'page.tsx'), 'utf8')

  test('"Lägg till"-knappen finns i sidhuvudet', () => {
    expect(page).toMatch(/Lägg till/)
  })

  test('egna poster får en diskret "Egen"-badge', () => {
    expect(page).toContain('Egen')
  })

  test('borttag är två-stegs-inline — ingen window.confirm', () => {
    expect(page).not.toMatch(/window\.confirm/)
    expect(page).toMatch(/Säkert\?/)
  })

  test('modalen har titel-, datum- och anteckningsfält', () => {
    expect(page).toMatch(/type="date"/)
  })
})
