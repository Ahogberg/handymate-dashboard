/**
 * Facit för användartaket och värdepunkterna (Andreas-beslut 2026-08-09).
 *
 * Firman höjdes 3 → 5 användare — och taket, som tidigare var REN COPY
 * (inbjudningsrutten räknade aldrig), upprätthålls nu där copyn lovar det.
 *
 *   npx playwright test tests/anvandartaket.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { USER_LIMITS, getUserLimit } from '../lib/feature-gates'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('taket är en regel, inte en text', () => {
  test('Firman rymmer 5, Storfirman obegränsat, okänd plan faller ALDRIG till obegränsat', () => {
    expect(USER_LIMITS.professional).toBe(5)
    expect(USER_LIMITS.business).toBeNull()
    expect(getUserLimit('påhittad' as any)).toBe(3)
  })

  test('inbjudningsrutten räknar aktiva medlemmar mot taket', () => {
    const s = read('app/api/team/invite/route.ts')
    expect(s).toContain('getUserLimit(')
    expect(s).toContain("eq('is_active', true)")
    // Räkningen sker FÖRE varje skapande/återaktivering.
    const tak = s.indexOf('getUserLimit(')
    const skapande = s.indexOf('Kolla om email redan finns')
    expect(tak).toBeLessThan(skapande)
  })

  test('beskedet vid fullt tak säger vägen framåt', () => {
    const s = read('app/api/team/invite/route.ts')
    expect(s).toContain('Uppgradera till Storfirman')
    expect(s).toContain('{ status: 403 }')
  })
})

test.describe('copyn och regeln säger samma siffra', () => {
  test('alla "Upp till"-texter matchar USER_LIMITS.professional', () => {
    // 2026-08-26 (feature-gates-konsolideringen): copyn interpolerar numera
    // FIRMAN_FACTS.users — som via getPlanCommercialFacts → getUserLimit är
    // BUNDEN till USER_LIMITS per konstruktion. Det är STARKARE än den
    // gamla bokstavssträngen ("Upp till 5 användare") som facitet letade
    // efter: siffran kan inte längre driftas isär ens av ett slarvigt
    // copy-byte. Facitet låser nu interpolationsformen + att inga
    // hårdkodade användartal smugit tillbaka.
    for (const fil of [
      'app/onboarding/components/Step5Activate.tsx',
      'app/dashboard/settings/billing/page.tsx',
    ]) {
      const s = read(fil)
      expect(s, `${fil} interpolerar inte enkällans användartal`).toContain('_FACTS.users} användare')
      expect(s, `${fil} har kvar gamla treans copy`).not.toContain('Upp till 3 användare')
      expect(s, `${fil} har en hårdkodad femma igen`).not.toContain('Upp till 5 användare')
    }
  })

  test('gränssnittstexterna runt taket följer med (1–5, fler än fem, från 6)', () => {
    const s = read('app/onboarding/components/Step5Activate.tsx')
    expect(s).toContain('För firmor med 1–5 personer')
    expect(s).toContain('Fler än fem som behöver logga in')
    expect(s).toContain('Från 6 anställda och uppåt')
  })
})

test.describe('värdepunkterna är utfall, inte funktioner', () => {
  test('Firmans fyra utfallsrader är på plats', () => {
    const s = read('app/onboarding/components/Step5Activate.tsx')
    expect(s).toContain('Kunden får svar inom 30 sekunder')
    expect(s).toContain('ROT-avdraget rätt räknat')
    expect(s).toContain('fakturan skapad. Inget glöms')
    expect(s).toContain('Teamet föreslår utskicket som fyller den')
    // Funktionslistan är borta — avatarerna visar redan teamet.
    expect(s).not.toContain("'Hela AI-teamet — sex medarbetare', 'Missade samtal fångas 24/7'")
  })

  test('30-sekunderslöftet finns bara där det redan var etablerat', () => {
    // Samma siffra som teamintrot använder — ett löfte, en formulering.
    const intro = read('app/onboarding/components/Step1MeetTheTeam.tsx')
    expect(intro).toContain('30 sekunder')
  })
})
