/**
 * Facit: användartaket är BORTA för Firman och Storfirman (Andreas-beslut
 * 2026-09-01). Planerna differentierar numera ENDAST på volym (samtal/SMS),
 * aldrig på antal människor. Ersätter 2026-08-09-facitet, som låste 3 → 5.
 * 'starter' är ett tyst legacy-/nedgraderingsläge (inte en publik plan) —
 * dess tak (3) rörs inte.
 *
 *   npx playwright test tests/anvandartaket.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { USER_LIMITS, getUserLimit } from '../lib/feature-gates'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('taket är borta för båda betalplanerna', () => {
  test('Firman och Storfirman är obegränsade, okänd plan faller ALDRIG till obegränsat', () => {
    expect(USER_LIMITS.professional).toBeNull()
    expect(USER_LIMITS.business).toBeNull()
    expect(getUserLimit('påhittad' as any)).toBe(3)
  })

  test('team_members/users-metadatan i FEATURE_GATES är synkad med USER_LIMITS', () => {
    // lib/feature-gates.ts säger själv att USER_LIMITS är kanonisk och att
    // dessa två gate-poster ska hållas synkade med den för hand.
    const s = read('lib/feature-gates.ts')
    const teamMembers = s.slice(s.indexOf("key: 'team_members'"), s.indexOf("key: 'users'"))
    expect(teamMembers).toContain('{ starter: 3, professional: null, business: null }')
    const users = s.slice(s.indexOf("key: 'users',"))
    expect(users.slice(0, 200)).toContain('{ starter: 3, professional: null, business: null }')
  })

  test('inbjudningsrutten räknar aldrig aktiva medlemmar mot Firman eller Storfirman', () => {
    // Samma nollcheck som redan skyddade Storfirman skyddar nu Firman också
    // — ingen ny kod, bara en ny konstant. Räkningsblocket lever kvar och
    // gäller fortfarande fullt ut för 'starter' (tyst legacy-läge).
    const s = read('app/api/team/invite/route.ts')
    expect(s).toContain('getUserLimit(')
    expect(s).toContain('if (anvandartak !== null)')
    expect(s).toContain("eq('is_active', true)")
  })
})

test.describe('copyn har inget kvar av det gamla taket', () => {
  test('inga hårdkodade användartal eller headcount-gränser i planvalen', () => {
    for (const fil of [
      'app/onboarding/components/Step5Activate.tsx',
      'app/dashboard/settings/billing/page.tsx',
    ]) {
      const s = read(fil)
      expect(s, `${fil} har en hårdkodad femma`).not.toContain('Upp till 5 användare')
      expect(s, `${fil} har kvar gamla treans copy för Firman`).not.toContain('Upp till 3 användare')
      expect(s, `${fil} interpolerar fortfarande FIRMAN_FACTS.users i en "Upp till"-text`).not.toMatch(/Upp till \$\{FIRMAN_FACTS\.users\}/)
    }
  })

  test('gammal headcount-copy i onboarding är borta', () => {
    const s = read('app/onboarding/components/Step5Activate.tsx')
    expect(s, '1–5-personer-copy kvar').not.toContain('1–5 personer')
    expect(s, '"fler än fem"-copy kvar').not.toContain('fler än fem')
    expect(s, '"från 6 anställda"-copy kvar').not.toContain('Från 6 anställda')
    // Nya, volymbaserade formuleringarna finns i stället.
    expect(s).toContain('Räcker gott och väl för de flesta firmor')
    expect(s).toContain('Ringer och smsar ni mycket?')
  })

  test('"Obegränsade användare" säljs inte längre som Storfirman-poäng', () => {
    for (const fil of [
      'app/onboarding/components/Step5Activate.tsx',
      'app/dashboard/settings/billing/page.tsx',
    ]) {
      expect(read(fil), `${fil} har kvar "Obegränsade användare"`).not.toContain('Obegränsade användare')
    }
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
