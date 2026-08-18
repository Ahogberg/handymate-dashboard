/**
 * Facit-tester för Snabboffertens inlärning (etapp D, 2026-08-06).
 *
 * Trösklarna är rena funktioner just för att de ska gå att pröva utan
 * webbläsare — och för att de är lätta att få fel på ett sätt ingen märker:
 * en off-by-one på skip-tröskeln gör bara att sekvensen försvinner en offert
 * för tidigt, vilket ser ut som en slump snarare än som en bugg.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/quick-preferences.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  shouldSkipSequence,
  shouldAskPreferred,
  SKIP_SEQUENCE_AFTER,
  ASK_PREFERRED_AFTER,
  ESCAPE_LABELS,
  type EscapeRoute,
} from '../lib/quotes/quick-preferences'
import fs from 'fs'
import path from 'path'

test.describe('när sekvensen slutar vara startläget', () => {
  test('de första fyra offerterna får hela sekvensen', () => {
    for (let i = 0; i < SKIP_SEQUENCE_AFTER; i++) {
      expect(shouldSkipSequence(i), `efter ${i} offerter`).toBe(false)
    }
  })

  test('femte offerten landar i översikten', () => {
    expect(shouldSkipSequence(SKIP_SEQUENCE_AFTER)).toBe(true)
  })

  test('och alla därefter', () => {
    expect(shouldSkipSequence(40)).toBe(true)
  })

  test('en trasig eller nollställd räknare ger sekvensen, inte översikten', () => {
    // Fail-soft-riktningen spelar roll: en ny användare som får översikten
    // direkt har aldrig sett granskningen och vet inte att den finns.
    expect(shouldSkipSequence(0)).toBe(false)
  })
})

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

test.describe('trösklarna hänger ihop', () => {
  test('frågan kommer FÖRE sekvensen slutar visas', () => {
    // Annars hade vi frågat "vill du alltid börja så här?" om ett flöde
    // hantverkaren redan slutat se.
    expect(ASK_PREFERRED_AFTER).toBeLessThan(SKIP_SEQUENCE_AFTER)
  })
})

test.describe('vägarna ut ur Snabbofferten', () => {
  const routes: EscapeRoute[] = ['editor', 'template']

  test('varje väg har en svensk etikett som går att sätta in i en mening', () => {
    // Frågan lyder "Vill du alltid börja <etikett>?" — etiketten måste alltså
    // vara en fras, inte ett systemnamn.
    for (const route of routes) {
      const label = ESCAPE_LABELS[route]
      expect(label?.length, `${route} saknar etikett`).toBeGreaterThan(0)
      expect(label.startsWith('i ') || label.startsWith('med '), `"${label}" läser sig inte i meningen`).toBe(true)
    }
  })

  test('räknarna är oberoende — tre mallval frågar inte om editorn', () => {
    // Trösklarna är per väg. Skulle de dela räknare hade tre mallval plus noll
    // editorbesök triggat frågan om editorn, vilket vore obegripligt.
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

  test('mallen är en riktig knapp bredvid Bygg utkast', () => {
    expect(intake).toContain('Använd en mall')
    // Fortfarande skyddad av hasContent — en mall efter AI-bygge raderar arbete.
    expect(intake).toContain('{!hasContent && (')
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
