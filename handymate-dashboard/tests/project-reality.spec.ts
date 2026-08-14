/**
 * Facit för Projektverklighet (Business Twin-epiken, 2026-08-14).
 *
 * ═══ DET SOM VAKTAS ═══
 *
 * `deriveProjectReality` (lib/projects/project-reality.ts) är en KOMPOSITION
 * — den får aldrig räkna själv. Om den börjar räkna om marginal eller
 * fasstatus har vi återskapat exakt den splittring derive-lifecycle.ts och
 * compute-economics.ts en gång löste: flera källor som kan säga olika saker.
 * deriveProjectReality är IO (den anropar Supabase), så den testas här via
 * källskanning i stället för att mocka en klient — samma anda som de andra
 * IO-funktionerna i den här kodbasen testas indirekt via sina rena
 * beroenden.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/project-reality.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const FILE = 'lib/projects/project-reality.ts'

test.describe('deriveProjectReality — kompositionen räknar aldrig själv', () => {
  const s = read(FILE)

  test('anropar computeProjectEconomics', () => {
    expect(s).toContain('computeProjectEconomics')
  })

  test('anropar deriveProjectLifecycle', () => {
    expect(s).toContain('deriveProjectLifecycle')
  })

  test('innehåller ingen egen marginal-uträkning (marginal_pct =)', () => {
    expect(s).not.toContain('marginal_pct =')
  })

  test('innehåller ingen egen avrundning (Math.round()', () => {
    expect(s).not.toContain('Math.round(')
  })

  test('innehåller ingen egen procent-uträkning (* 100)', () => {
    expect(s).not.toContain('* 100')
  })

  test('select:ar bara status från invoice-tabellen (lifecycle behöver inget mer)', () => {
    expect(s).toContain(".from('invoice')")
    expect(s).toContain(".select('status')")
  })
})

test.describe('ProjectReality — fält utan kanonisk källa smyger inte in', () => {
  const s = read(FILE)

  // Dessa fält föreslogs under planeringen men saknar en kanonisk källa idag
  // (ingen tabell/härledning äger dem). Att lägga till dem här utan en sådan
  // källa är exakt den scope-glidning derive-lifecycle.ts varnar för i sitt
  // eget filhuvud ("det som inte lagras kan inte drifta").
  test('innehåller inte plannedProgress', () => {
    expect(s).not.toContain('plannedProgress')
  })

  test('innehåller inte forecast', () => {
    expect(s).not.toContain('forecast')
  })

  test('innehåller inte unresolvedPromises', () => {
    expect(s).not.toContain('unresolvedPromises')
  })
})

test.describe('deriveProjectReality — null-kontraktet', () => {
  const s = read(FILE)

  test('return null förekommer minst två gånger (saknat projekt + null economics)', () => {
    const matches = s.match(/return null/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })
})
