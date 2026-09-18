import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Ytkontraktet för offertflödets två designade ytor (2026-09-18).
 *
 * ═══ VARFÖR ═══
 *
 * design-sales-experience/README.md bär lärdomen: "Kanvasen exporterar
 * designen, inte våra funktionella krav." Där var det två rader som måste
 * överleva varje export — faller de bort tappas partnerns provision tyst.
 *
 * Här är insatsen högre. De här ytorna avgör vad som hamnar på en offert och
 * vad kunden betalar. Det här facit faller om en designexport tar bort något
 * i design-offertflodet/README.md. Faller det: rätta exporten, inte testet.
 *
 * Kör: npx playwright test tests/design-offertflodet-kontrakt.spec.ts --no-deps
 */

const ROOT = path.resolve(__dirname, '..')
const las = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
/** Kommentarer beskriver ofta just det som ska vaktas — mät på koden. */
const kod = (p: string) =>
  las(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const START = 'app/dashboard/quotes/new/components/quick/QuickIntake.tsx'
const FRAGOR = 'components/quotes/IntakeQuestionFlow.tsx'

test.describe('briefen finns och pekar på ytor som finns', () => {
  test('README:n namnger båda ytorna och båda filerna existerar', () => {
    const brief = las('design-offertflodet/README.md')
    expect(brief).toContain(START)
    expect(brief).toContain(FRAGOR)
    expect(fs.existsSync(path.join(ROOT, START))).toBe(true)
    expect(fs.existsSync(path.join(ROOT, FRAGOR))).toBe(true)
  })

  test('dokumentet och byggaren är märkta "rör inte" — enda radeditorn sprids inte ut', () => {
    const brief = las('design-offertflodet/README.md')
    for (const skyddad of ['components/quotes/document/QuoteDocument.tsx', 'app/dashboard/quotes/_shared/QuoteBuilder.tsx']) {
      const rad = brief.split('\n').find(l => l.includes(skyddad))
      expect(rad, `${skyddad} saknas i tabellen`).toBeTruthy()
      expect(rad, `${skyddad} är inte märkt "rör inte"`).toContain('rör inte')
    }
  })
})

test.describe('startskärmen — vad en design inte får ta bort', () => {
  const start = kod(START)

  test('exakt två vägar ut, och ingen tredje', () => {
    expect(start).toContain('Bygg utkast')
    expect(start).toContain('Bygg själv')
    // De tre borttagna vägarna. Kommer någon tillbaka är vi tillbaka i
    // "fyra knappar som landar på två ställen".
    expect(start).not.toContain('Öppna editorn direkt')
    expect(start).not.toContain('Använd en mall')
    expect(start).not.toMatch(/onSelectTemplate\s*=/)
  })

  test('kundvalet är frivilligt — ingen grind före beskrivningen', () => {
    // En tom option som förvalt värde ÄR frivilligheten: går den bort är
    // kundvalet plötsligt tvingande.
    expect(start).toMatch(/<option value="">/)
  })

  test('rösten landar redigerbar i textrutan, aldrig som en svart låda', () => {
    expect(start).toContain('Mic')
    expect(start).toMatch(/onChange=\{/)
  })

  test('"Bygg själv" döljs när offerten redan har rader', () => {
    expect(start).toContain('hasContent')
  })

  test('jobbtypsstarten renderas inuti ytan, inte bakom dess lager', () => {
    expect(start).toContain('jobTypeStart')
  })
})

test.describe('frågeflödet — vad en design inte får ta bort', () => {
  const flode = kod(FRAGOR)

  test('BINDNINGEN SYNS: varje fråga säger vad svaret ändrar', () => {
    // Den viktigaste raden i hela kontraktet. Utan den kan hantverkaren inte
    // se vilken rad ett tal hamnar på — och det var precis felet som gjorde
    // att golvytan hamnade på både golv och vägg i första versionen.
    expect(flode).toContain("{q.kind === 'number' ? 'Sätter:' : 'Kryssar:'}")
    expect(flode).toContain('Lägger in:')
    // Texten byggs ur de RIKTIGA raderna frågan pekar på, inte ur en etikett
    // någon skrivit för hand i designen.
    expect(flode).toContain('affects(q)')
  })

  test('en skärm, alla frågor — ingen guide med steg', () => {
    expect(flode).toContain('questions.map(')
    for (const guideord of ['Steg ', 'currentStep', 'stepIndex', 'nextQuestion']) {
      expect(flode, `"${guideord}" tyder på en stegguide`).not.toContain(guideord)
    }
  })

  test('varje fråga går att hoppa över, och att hoppa över lämnar upplägget orört', () => {
    expect(flode).toContain('onSkip')
    expect(flode).toContain('Hoppa över frågorna')
    expect(flode).toContain('onBack')
  })

  test('räknaren visar att det går att gå vidare utan att fylla i allt', () => {
    expect(flode).toMatch(/\{answered\} av \{questions\.length\} besvarade/)
  })

  test('valfrågans alternativ är knappar, inte en rullgardin', () => {
    const val = flode.slice(flode.indexOf("q.kind === 'choice'"))
    expect(val).toContain('<button')
    expect(val.slice(0, val.indexOf('</div>'))).not.toContain('<select')
  })

  test('rösten finns per fritextfråga och landar redigerbar', () => {
    expect(flode).toContain('useAudioRecording')
    expect(flode).toContain('/api/matte/transcribe')
  })
})

test.describe('måtten som gäller alla ytor', () => {
  test('ui-beviset renderar frågeflödet i 375 px och vaktar mot sidled-scroll', () => {
    const bevis = las('tests/intake-flow.ui.spec.ts')
    expect(bevis).toContain('width: 375')
    expect(bevis).toContain('scrollWidth')
  })

  test('briefen säger 375 px, 44 px träffyta, svenska och teal', () => {
    const brief = las('design-offertflodet/README.md')
    expect(brief).toContain('375 px')
    expect(brief).toContain('44 px')
    expect(brief).toContain('#0F766E')
    expect(brief).toMatch(/Svenska/i)
  })

  test('appens ytor ingår i samma beställning', () => {
    const brief = las('design-offertflodet/README.md')
    expect(brief).toContain('handymate-mobile')
    expect(brief).toContain('tasks/gapanalys-mobilen-2026-09-18.md')
    expect(fs.existsSync(path.join(ROOT, 'tasks/gapanalys-mobilen-2026-09-18.md'))).toBe(true)
  })
})
