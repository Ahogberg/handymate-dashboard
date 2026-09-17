/**
 * Facit-tester för Snabboffertens inlärning (etapp D, 2026-08-06).
 *
 * ═══ HISTORIK (Fas 1, offert-omtaget 2026-08-31) ═══
 *
 * Den här filen testade tidigare ÄVEN "sekvensen" (`shouldSkipSequence`/
 * `SKIP_SEQUENCE_AFTER`) — tröskeln som skippade en tvingad steg-för-steg-
 * granskning efter fem genomförda snabbofferter. Den granskningen och dess
 * skip-tröskel är borttagna (grundaren konstaterade att granskningen inte
 * fungerade i praktiken), så de testerna är BORTTAGNA, inte bara flyttade.
 *
 * Kvar: startläges-inlärningen ("vill du alltid börja här?") — en helt
 * orättvänd, fortsatt legitim preferens, oförändrad i sak.
 *
 * Trösklarna är rena funktioner just för att de ska gå att pröva utan
 * webbläsare.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/quick-preferences.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  shouldAskPreferred,
  ASK_PREFERRED_AFTER,
  ESCAPE_LABELS,
  type EscapeRoute,
} from '../lib/quotes/quick-preferences'
import fs from 'fs'
import path from 'path'

test.describe('frågan om standardväg ställs EN gång', () => {
  test('ställs exakt vid tröskeln', () => {
    expect(shouldAskPreferred(ASK_PREFERRED_AFTER, false)).toBe(true)
  })

  test('inte före', () => {
    expect(shouldAskPreferred(ASK_PREFERRED_AFTER - 1, false)).toBe(false)
  })

  test('inte efter — annars tjatar den tills någon svarar', () => {
    // Med >= i stället för === hade frågan kommit tillbaka varje gång, vilket
    // är precis den sortens tjat som får folk att sluta läsa dialoger.
    expect(shouldAskPreferred(ASK_PREFERRED_AFTER + 1, false)).toBe(false)
    expect(shouldAskPreferred(99, false)).toBe(false)
  })

  test('aldrig om den redan ställts', () => {
    expect(shouldAskPreferred(ASK_PREFERRED_AFTER, true)).toBe(false)
  })
})

test.describe('vägarna ut ur Snabbofferten', () => {
  const routes: EscapeRoute[] = ['editor']

  test('varje väg har en svensk etikett som går att sätta in i en mening', () => {
    // Frågan lyder "Vill du alltid börja <etikett>?" — etiketten måste alltså
    // vara en fras, inte ett systemnamn.
    for (const route of routes) {
      const label = ESCAPE_LABELS[route]
      expect(label?.length, `${route} saknar etikett`).toBeGreaterThan(0)
      expect(label.startsWith('i ') || label.startsWith('med '), `"${label}" läser sig inte i meningen`).toBe(true)
    }
  })

  test('räknaren är per väg — tre av något annat frågar inte om editorn', () => {
    // Trösklarna är per väg. En delad räknare hade triggat frågan om editorn
    // av något som inte var editorbesök, vilket vore obegripligt.
    expect(shouldAskPreferred(ASK_PREFERRED_AFTER, false)).toBe(true)
    expect(shouldAskPreferred(0, false)).toBe(false)
  })

  test('ett NEJ räknas som svar — frågan kommer inte tillbaka', () => {
    // markAskedPreferred sätts oavsett hur hantverkaren svarade. Att fråga om
    // igen efter ett nej är exakt det tjat vi försöker undvika.
    expect(shouldAskPreferred(ASK_PREFERRED_AFTER, true)).toBe(false)
  })
})

test.describe('vägvalet är förstklassigt — inte en hjälte och två fotnoter (2026-08-10)', () => {
  // Andreas fynd: "Öppna fullständiga editorn" låg som grå fotnot under en
  // jättelik inaktiverad knapp. Vakterna läser källan så rymningarna inte
  // smygflyttas tillbaka till botten.
  const intake = fs.readFileSync(
    path.resolve(__dirname, '..', 'app/dashboard/quotes/new/components/quick/QuickIntake.tsx'),
    'utf8',
  )

  test('editorlänken ligger i headern — FÖRE textrutan, inte under knappen', () => {
    const editorLank = intake.indexOf('Öppna editorn direkt')
    const textruta = intake.indexOf('<textarea')
    expect(editorLank, 'editorlänken saknas').toBeGreaterThan(-1)
    expect(editorLank, 'editorlänken har flyttat under textrutan igen').toBeLessThan(textruta)
  })

  test('mallknappen är BORTA — jobbtypsremsan är valet av upplägg (2026-09-17)', () => {
    // Andreas: "blir det inte dubbelt?" Två dörrar till samma upplägg var en
    // dörr för mycket. Remsan ligger redan ovanför textrutan.
    expect(intake).not.toContain('Använd en mall')
    expect(intake).not.toContain('onUseTemplate')
    // Bygg själv är fortfarande skyddad av hasContent.
    expect(intake).toContain('{!hasContent && (')
    // Och 'template' är inte längre en väg ut.
    const prefs = fs.readFileSync(path.resolve(__dirname, '..', 'lib/quotes/quick-preferences.ts'), 'utf8')
    expect(prefs).toContain("export type StartMode = 'quick' | 'editor'")
    expect(prefs).not.toMatch(/template: 'med en mall'/)
  })

  test('exempelchips fyller rutan och försvinner när något står där', () => {
    expect(intake).toContain('EXEMPEL.map(')
    expect(intake).toContain("!value.trim() && !isRecording && !transcribing")
  })

  test('den inaktiverade knappen förklarar sig', () => {
    // Texten bytte lydelse i dbe859ae (2026-08-17, Bygg själv-knappen) —
    // regeln är oförändrad: den inaktiverade primärknappen ska förklara
    // sig, inte stå stum.
    expect(intake).toContain('Beskriv jobbet — eller bygg själv')
  })
})
