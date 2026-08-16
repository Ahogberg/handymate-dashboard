/**
 * Facit för inställningarnas sex områden (etapp 2, 2026-08-07).
 *
 * ═══ VAD SOM SKYDDAS ═══
 *
 * En omstrukturering från 27 menyval till sex områden har exakt ett katastrofalt
 * felläge: **en inställning tappas bort**. Den finns kvar i koden, sparar fortfarande
 * data, men går inte längre att nå från något gränssnitt.
 *
 * Det var precis det tillstånd omstruktureringen skulle rätta. Elva sidor var
 * olänkade från hubben, och `email-templates` gick inte att nå från någonstans i
 * hela appen.
 *
 * Testet nedan går igenom `app/dashboard/settings/` på disk och kräver att varje
 * rutt antingen har en plats i ett område eller är uttryckligen lanseringsdold.
 * Bygger någon en ny inställningssida utan att ge den en hemvist blir det rött.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/settings-areas.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  SETTINGS_AREAS,
  allEntries,
  visibleAreas,
  primaryCount,
} from '../lib/settings/areas'
import { isLaunchHidden, launchGateForPath } from '../lib/launch-visibility'

const ROOT = path.resolve(__dirname, '..')

/** Rutterna som faktiskt finns på disk under settings/. */
function settingsRoutes(): string[] {
  const dir = path.join(ROOT, 'app/dashboard/settings')
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => `/dashboard/settings/${e.name}`)
}

test.describe('strukturen', () => {
  test('exakt sex områden — listan växer inte', () => {
    // Nya inställningar hamnar INUTI ett område. Blir det sju har någon gjort
    // om den gamla hubben, som växte varje gång någon byggde något.
    expect(SETTINGS_AREAS).toHaveLength(6)
  })

  test('varje område har nyckel, namn, en rad och ikon', () => {
    const trasiga = SETTINGS_AREAS.filter(a => !a.key || !a.label?.trim() || !a.tagline?.trim() || !a.icon)
    expect(trasiga.map(a => a.key || '(utan nyckel)')).toEqual([])
  })

  test('inga dubbletter på områdesnyckel', () => {
    const nycklar = SETTINGS_AREAS.map(a => a.key)
    expect(new Set(nycklar).size).toBe(nycklar.length)
  })

  test('varje område har 2–4 grupper', () => {
    // Fler än fyra och området är en ny lång lista — precis det vi flydde från.
    const fel = SETTINGS_AREAS.filter(a => a.groups.length < 1 || a.groups.length > 5)
    expect(fel.map(a => a.key)).toEqual([])
  })
})

test.describe('posterna', () => {
  test('inga dubbletter på id', () => {
    const ids = allEntries().map(e => e.id)
    const sedda = new Set<string>()
    const dubbletter = ids.filter(id => (sedda.has(id) ? true : (sedda.add(id), false)))
    expect(dubbletter, 'samma post ligger i två områden').toEqual([])
  })

  test('varje post har etikett och förklaring', () => {
    const utan = allEntries().filter(e => !e.label?.trim() || !e.desc?.trim())
    expect(utan.map(e => e.id), 'en post utan förklaring tvingar till gissning').toEqual([])
  })

  test('förklaringen är i klartext, inte ett fältnamn', () => {
    // "min_job_value_sek" hör inte hemma i en kundvänd etikett.
    const tekniska = allEntries().filter(e => /_[a-z]+_|[a-z]+_[a-z]+/.test(e.desc) || /_/.test(e.label))
    expect(tekniska.map(e => e.id)).toEqual([])
  })

  test('länkposter pekar på dashboard-rutter', () => {
    const fel = allEntries().filter(e => e.href && !e.href.startsWith('/dashboard/'))
    expect(fel.map(e => e.id)).toEqual([])
  })
})

test.describe('ingenting tappas bort', () => {
  test('varje settings-rutt har en plats eller är lanseringsdold', () => {
    // Kärntestet. Elva sidor var olänkade innan; en av dem gick inte att nå
    // från någonstans i hela appen.
    const placerade = new Set(allEntries().map(e => e.href).filter(Boolean) as string[])
    const hemlösa = settingsRoutes().filter(r => {
      if (placerade.has(r)) return false
      if (isLaunchHidden(launchGateForPath(r))) return false
      return true
    })
    expect(hemlösa, 'rutter utan hemvist — bygg in dem i ett område eller lanseringsdölj dem').toEqual([])
  })

  test('varje inbyggd flik från den gamla hubben finns kvar', () => {
    // Flik-id:n som settings/page.tsx renderar innehåll för. Försvinner ett här
    // blir dess formulär oåtkomligt trots att det fortfarande sparar data.
    const GAMLA_FLIKAR = [
      'company', 'hours', 'invoice', 'phone', 'subscription',
      'time', 'economics', 'pipeline',
      'ai', 'autopilot', 'integrations', 'preferences',
    ]
    const ids = new Set(allEntries().map(e => e.id))
    const tappade = GAMLA_FLIKAR.filter(f => !ids.has(f))
    expect(tappade, 'inbyggda flikar utan plats i den nya hubben').toEqual([])
  })

  test('inget lanseringsdolt syns', () => {
    const dolda = allEntries().filter(e => e.href && isLaunchHidden(launchGateForPath(e.href)))
    expect(dolda.map(e => e.id), 'dold funktion har smugit in i hubben').toEqual([])
  })
})

test.describe('dubbleringarna är utpekade, inte gömda', () => {
  test('varje supersededBy pekar på en post som faktiskt finns', () => {
    // Fyra funktioner har två gränssnitt. Båda ligger kvar tills innehållet
    // slagits ihop — men det ska stå vilken som är sanningen.
    const hrefs = new Set(allEntries().map(e => e.href).filter(Boolean) as string[])
    const trasiga = allEntries().filter(e => e.supersededBy && !hrefs.has(e.supersededBy))
    expect(trasiga.map(e => e.id), 'pekar på en sida som inte finns i hubben').toEqual([])
  })

  test('en post är aldrig både sanningskälla och ersatt', () => {
    const ersatta = allEntries().filter(e => e.supersededBy)
    const fel = ersatta.filter(e => e.href)
    expect(fel.map(e => e.id)).toEqual([])
  })
})

test.describe('rollskydd och synlighet', () => {
  test('bolagsprofil och intern timkostnad är ägargrindade', () => {
    // Moms, bokslut och vad en timme kostar dig är inget en montör ska se i
    // förbifarten.
    const ids = allEntries().filter(e => e.ownerOnly).map(e => e.id)
    expect(ids).toContain('_link_bolagsprofil')
    expect(ids).toContain('_link_internal_costs')
    expect(ids).toContain('_link_business_twin_data')
  })

  test('en montör ser inte de ägargrindade posterna', () => {
    const ids = allEntries(visibleAreas({ isOwnerOrAdmin: false })).map(e => e.id)
    expect(ids).not.toContain('_link_bolagsprofil')
    expect(ids).not.toContain('_link_internal_costs')
    expect(ids).not.toContain('_link_business_twin_data')
  })

  test('ägaren ser allt som inte är lanseringsdolt', () => {
    const synliga = visibleAreas({ isOwnerOrAdmin: true })
    expect(synliga).toHaveLength(6)
    expect(allEntries(synliga).length).toBeGreaterThan(20)
  })

  test('tomma grupper och områden faller bort av sig själva', () => {
    for (const a of visibleAreas({ isOwnerOrAdmin: false })) {
      expect(a.groups.length, `${a.key} har en tom grupp`).toBeGreaterThan(0)
      for (const g of a.groups) expect(g.entries.length).toBeGreaterThan(0)
    }
  })
})

test.describe('avancerat', () => {
  test('det avancerade är en minoritet i varje område', () => {
    // Ligger merparten under Avancerat har grupperingen misslyckats.
    for (const a of SETTINGS_AREAS) {
      const alla = a.groups.flatMap(g => g.entries).length
      expect(primaryCount(a), `${a.key} gömmer för mycket`).toBeGreaterThan(alla / 2)
    }
  })

  test('minst ett område har avancerade poster', () => {
    expect(allEntries().some(e => e.advanced)).toBe(true)
  })
})
