import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Facit: offertflödets helskärmsytor ligger ÖVER de flytande hjälparna.
 *
 * ═══ VARFÖR REGELN FINNS ═══
 *
 * Andreas klickprov 2026-09-18 på telefon: i intaget satt Matte-bubblans
 * porträtt precis bredvid mikrofonknappen i textrutans nedre högra hörn. Det
 * såg ut som två mikrofoner, och bubblan täckte en del av ytan.
 *
 * Orsaken var inte en tabbe i en fil utan ett kapplöpningslopp mellan två
 * filer: intaget är `fixed inset-0 z-50`, Jobbkompisen är
 * `fixed bottom-6 right-6 z-50`, och Jobbkompisen renderas EFTER {children} i
 * app/dashboard/layout.tsx. Vid samma z-nivå avgör DOM-ordningen, och då
 * vinner alltid bubblan. <main> sätter varken z-index eller transform, så de
 * konkurrerar i samma stackningskontext.
 *
 * ═══ VARFÖR DET HÄR FACIT FINNS ═══
 *
 * En helskärmsyta som är helskärm på papperet men inte i webbläsaren är exakt
 * den sortens fel som ingen källskanning hittar: båda filerna är rimliga var
 * för sig. Provet mäter därför RELATIONEN — det läser bubblans nivå ur dess
 * egen fil i stället för att hårdkoda 50, så att den som höjer bubblan i
 * morgon får veta det här i stället för hos en hantverkare.
 *
 * Taket är lika viktigt: radsheetsen (z-[70]) och Toast öppnas OVANPÅ de här
 * ytorna och måste fortsätta göra det.
 *
 * Kör: npx playwright test tests/facit-helskarm-over-bubblan.spec.ts --no-deps
 */

const ROOT = path.resolve(__dirname, '..')
const las = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

/** Helskärmsytorna i offertflödet — de som täcker hela rutan. */
const HELSKARMAR = [
  'app/dashboard/quotes/new/components/quick/QuickIntake.tsx',
  'app/dashboard/quotes/new/components/quick/QuickBuilding.tsx',
  'components/quotes/IntakeQuestionFlow.tsx',
]

/** De flytande hjälparna som bor i dashboardens layout, utanför <main>. */
const FLYTANDE = [
  'components/Jobbkompisen.tsx',
  'components/FeedbackWidget.tsx',
]

/** Tailwinds z-50 och z-[60] ger båda ett tal; plocka ut det. */
function zTal(klass: string): number | null {
  const m = /^z-(?:\[(\d+)\]|(\d+))$/.exec(klass)
  return m ? Number(m[1] ?? m[2]) : null
}

/** Nivån på det element som bär `fixed` i en fil — högsta fixed-lagret. */
function fixedNivaer(kod: string): number[] {
  const ut: number[] = []
  for (const m of Array.from(kod.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g))) {
    const klasser = (m[1] ?? m[2] ?? '').split(/\s+/)
    if (!klasser.includes('fixed')) continue
    for (const k of klasser) {
      const n = zTal(k)
      if (n !== null) ut.push(n)
    }
  }
  return ut
}

test('varje helskärmsyta i offertflödet ligger över de flytande hjälparna', () => {
  // Bubblans nivå läses ur bubblans EGEN fil. Hårdkodad 50 hade tystnat i
  // samma stund som någon höjde den — och felet hade sett likadant ut.
  const hjalparTak = Math.max(...FLYTANDE.flatMap(f => fixedNivaer(las(f))))
  expect(hjalparTak, 'ingen flytande hjälpare har en z-nivå — läser provet fel fil?').toBeGreaterThan(0)

  const foerLaaga = HELSKARMAR
    .map(f => ({ f, niva: Math.max(...fixedNivaer(las(f))) }))
    .filter(({ niva }) => !(niva > hjalparTak))
    .map(({ f, niva }) => `${f} (z=${niva}, hjälparna når z=${hjalparTak})`)

  expect(foerLaaga, `helskärmsytor som de flytande hjälparna lägger sig över:\n${foerLaaga.join('\n')}`).toEqual([])
})

test('helskärmsytorna ligger UNDER radsheetsen — de ska fortfarande öppnas ovanpå', () => {
  // Utan det här taket "löser" nästa person samma bugg genom att skruva upp
  // helskärmen tills radeditorn hamnar bakom den i stället.
  const sheets = ['components/quotes/document/RowEditSheet.tsx', 'components/quotes/document/AddRowSheet.tsx']
  const sheetGolv = Math.min(...sheets.flatMap(f => fixedNivaer(las(f))))
  const foerHoega = HELSKARMAR
    .map(f => ({ f, niva: Math.max(...fixedNivaer(las(f))) }))
    .filter(({ niva }) => niva >= sheetGolv)
    .map(({ f, niva }) => `${f} (z=${niva}, sheetsen ligger på z=${sheetGolv})`)
  expect(foerHoega, `helskärmsytor som skymmer radsheetsen:\n${foerHoega.join('\n')}`).toEqual([])
})

test('Jobbkompisen ligger fortfarande utanför <main> — annars mäter provet fel sak', () => {
  // Hela felet bygger på att bubblan är syskon till <main> och renderas efter
  // {children}. Flyttas den in i <main> byter problemet skepnad, och då ska
  // det här provet säga till i stället för att fortsätta vakta en relation
  // som inte längre är den som avgör.
  const layout = las('app/dashboard/layout.tsx')
  const barn = layout.indexOf('{children}')
  const bubbla = layout.indexOf('<Jobbkompisen />')
  expect(barn, '{children} hittades inte i layouten').toBeGreaterThan(0)
  expect(bubbla, '<Jobbkompisen /> hittades inte i layouten').toBeGreaterThan(0)
  expect(bubbla, 'Jobbkompisen renderas inte längre efter {children}').toBeGreaterThan(barn)
})
