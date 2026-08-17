/**
 * Facit för components/jarvis/ReaktiveringsInsikt.tsx ("Låt Matte väga in
 * det", tasks/jaunty-pondering-hummingbird.md).
 *
 * Källkodsskanning, samma stil som tests/facit-document-scale.spec.ts:s
 * DocumentScaler-tester. Kortet är MEDVETET inte GorDettaForst-mönstret
 * (godkänn/avvisa-par) — det är ett tips som handoffar in i Matte-chatten,
 * aldrig en egen direktaktion. Testet låser den skillnaden mekaniskt: de
 * vanliga beslutsknapparnas etiketter får inte förekomma, och anropet till
 * Jobbkompisens förifyllnadsmekanism (setPendingPrompt) samt den enda
 * knappens text måste finnas.
 *
 * Körs: npx playwright test tests/reaktiverings-insikt.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const src = fs.readFileSync(
  path.join(__dirname, '..', 'components', 'jarvis', 'ReaktiveringsInsikt.tsx'),
  'utf8',
)

test.describe('ReaktiveringsInsikt.tsx — bara handoff in i Matte, ingen egen direktaktion', () => {
  test('innehåller inte de vanliga beslutsknapparnas etiketter', () => {
    expect(src).not.toContain('Godkänn')
    expect(src).not.toContain('Skicka')
    expect(src).not.toContain('Avvisa')
  })

  test('handoffar via setPendingPrompt (Jobbkompisens förifyllnadsmekanism)', () => {
    expect(src).toContain('setPendingPrompt')
  })

  test('den enda knappens text är "Låt Matte väga in det"', () => {
    expect(src).toContain('Låt Matte väga in det')
  })
})
