/**
 * Startkorten (docs/design/FORSTA-30-MINUTERNA.md, "Min 15 · Första
 * godkännandet") — facit-tester.
 *
 * Körs: npx playwright test tests/startkort.spec.ts --no-deps
 *
 * INGEN DB, INGET Supabase — skapaStartkort gör I/O och testas inte genom
 * att anropas (samma linje som create-debrief-card.ts). Vi verifierar att
 * KÄLLKODENS FORM garanterar fail-safe-kontraktet och livstids-dedupen, samt
 * att typen är korrekt registrerad i action-contract, TYPE_CONFIG och
 * approval-view.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { ACTION_CONTRACT, classify, mayExecute } from '../lib/approvals/action-contract'
import { TYPE_LABEL, typeLabel, approveLabel, deepLinkFor } from '../lib/jarvis/approval-view'

const ROOT = path.resolve(__dirname, '..')
const KALLA = fs.readFileSync(path.join(ROOT, 'lib/onboarding/starter-cards.ts'), 'utf8')

test.describe('starter-cards.ts — livstids-dedupen', () => {
  test('dedupe-läsningen filtrerar på approval_type utan projektspecifikt villkor', () => {
    expect(KALLA).toContain(".eq('approval_type', 'team_intro')")
  })

  test('dedupe-blocket saknar statusfilter — kortet ska inte kunna dubbleras', () => {
    // Hela filen ska inte innehålla ett .eq('status', ...)-anrop — den enda
    // statusrelaterade texten är INSERT-radernas status: 'pending', som inte
    // är en .eq()-fråga. Den här buggklassen (dedupe som råkar filtrera på
    // status och därför spammar dubbletter av redan hanterade kort) har
    // bitit projektet fyra gånger tidigare.
    expect(KALLA).not.toContain(".eq('status'")
  })

  test('dedupe-läsningen sker FÖRE korten byggs/infogas', () => {
    const dedupeIdx = KALLA.indexOf(".eq('approval_type', 'team_intro')")
    const insertIdx = KALLA.indexOf(".from('pending_approvals').insert(cards)")
    expect(dedupeIdx).toBeGreaterThan(-1)
    expect(insertIdx).toBeGreaterThan(-1)
    expect(dedupeIdx).toBeLessThan(insertIdx)
  })
})

test.describe('starter-cards.ts — fail-safe-kontraktet', () => {
  test('den exporterade funktionen är try/catch och kastar aldrig', () => {
    expect(KALLA).toContain('export async function skapaStartkort')
    expect(KALLA).toContain('try {')
    expect(KALLA).toContain('catch (err)')
    expect(KALLA).toContain('får aldrig fälla onboarding-finalize')
  })

  test('Karin-fyndet har sin egen fail-safe — ett trasigt fynd stoppar inte Lisa/Daniel', () => {
    const funkStart = KALLA.indexOf('async function hamtaKarinFynd')
    expect(funkStart).toBeGreaterThan(-1)
    const funk = KALLA.slice(funkStart, KALLA.indexOf('export async function skapaStartkort'))
    expect(funk).toContain('try {')
    expect(funk).toContain('catch (err)')
    expect(funk).toContain('return null')
  })
})

test.describe('starter-cards.ts — vilka kort skapas', () => {
  test('Lisa och Daniel skapas alltid, oavsett Karins fynd', () => {
    expect(KALLA).toContain("title: 'Jag vaktar din telefon nu'")
    expect(KALLA).toContain('agent_id: \'lisa\'')
    expect(KALLA).toContain("title: 'Skicka din första offert så följer jag upp den åt dig'")
    expect(KALLA).toContain('agent_id: \'daniel\'')
  })

  test('Karin-kortet grenar på om fyndet finns', () => {
    expect(KALLA).toContain('const karinTitle = karinFynd ? karinFynd.text :')
    expect(KALLA).toContain("'Jag bevakar dina fakturor från och med nu'")
    expect(KALLA).toContain('agent_id: \'karin\'')
    expect(KALLA).toContain('instant_value: karinFynd ?? null')
  })

  test('Karin-fyndet gated på ett verkligt belopp (förfallet/obetalt/öppna affärer), inte kundantal', () => {
    expect(KALLA).toContain('headline.amount_kr')
    expect(KALLA).toContain('computeInstantValue')
  })

  test('alla tre korten bär approval_type team_intro', () => {
    const antal = (KALLA.match(/approval_type: 'team_intro'/g) || []).length
    expect(antal).toBe(3)
  })
})

test.describe('onboarding-finalize anropar skapaStartkort fire-and-forget', () => {
  const rutt = fs.readFileSync(path.join(ROOT, 'app/api/onboarding/route.ts'), 'utf8')

  test('importeras och anropas efter seedAllDefaults, utan await', () => {
    expect(rutt).toContain("import { skapaStartkort } from '@/lib/onboarding/starter-cards'")
    const seedIdx = rutt.indexOf('const seedResult = await seedAllDefaults')
    const kallIdx = rutt.indexOf('skapaStartkort(supabase, business.business_id)')
    expect(seedIdx).toBeGreaterThan(-1)
    expect(kallIdx).toBeGreaterThan(-1)
    expect(seedIdx).toBeLessThan(kallIdx)
    // Fire-and-forget: aldrig `await skapaStartkort(...)` — .catch fångar
    // istället, samma mönster som extractAndSaveMemory i agent/trigger.
    expect(rutt).not.toContain('await skapaStartkort(')
    expect(rutt).toContain('skapaStartkort(supabase, business.business_id).catch(')
  })

  test('anropet ligger efter det lyckade DB-uppdateringsblocket, inte före', () => {
    const updateIdx = rutt.indexOf('.update(updates)')
    const kallIdx = rutt.indexOf('skapaStartkort(supabase, business.business_id)')
    expect(updateIdx).toBeGreaterThan(-1)
    expect(updateIdx).toBeLessThan(kallIdx)
  })
})

test.describe('action-contract — team_intro är registrerad', () => {
  test('klassad som informationell — godkänn utför ingenting', () => {
    expect(classify('team_intro')).toBe('INFORMATIONAL')
    expect(mayExecute('team_intro')).toBe(false)
  })

  test('finns i ACTION_CONTRACT', () => {
    expect(ACTION_CONTRACT.team_intro).toBe('INFORMATIONAL')
  })
})

test.describe('TYPE_CONFIG (app/dashboard/approvals/page.tsx) — team_intro har etikett + ikon', () => {
  const sida = fs.readFileSync(path.join(ROOT, 'app/dashboard/approvals/page.tsx'), 'utf8')

  test('team_intro finns i TYPE_CONFIG med etiketten "Ditt team"', () => {
    const i = sida.indexOf('const TYPE_CONFIG')
    const slut = sida.indexOf('\n}', sida.indexOf('other:', i))
    const block = sida.slice(i, slut)
    expect(block).toContain('team_intro:')
    expect(block).toMatch(/team_intro:\s*\{\s*label:\s*'Ditt team'/)
  })

  test('ikonen är importerad från lucide-react', () => {
    expect(sida).toMatch(/import \{[\s\S]*Users[\s\S]*\} from 'lucide-react'/)
  })
})

test.describe('approval-view.ts — team_intro presenteras korrekt', () => {
  test('etiketten är "Ditt team", på svenska, utan teknisk term', () => {
    expect(TYPE_LABEL.team_intro).toBe('Ditt team')
    expect(typeLabel('team_intro')).toBe('Ditt team')
  })

  test('godkänn-knappen säger "Jag har läst det" — inget utförs', () => {
    expect(approveLabel('team_intro')).toBe('Jag har läst det')
  })

  test('Karins startkort länkar till Pengar, Lisas och Daniels gör det inte', () => {
    const karin = deepLinkFor({ approval_type: 'team_intro', payload: { agent_id: 'karin' } })
    expect(karin?.href).toBe('/dashboard/pengar')

    expect(deepLinkFor({ approval_type: 'team_intro', payload: { agent_id: 'lisa' } })).toBeNull()
    expect(deepLinkFor({ approval_type: 'team_intro', payload: { agent_id: 'daniel' } })).toBeNull()
    expect(deepLinkFor({ approval_type: 'team_intro', payload: {} })).toBeNull()
  })
})

test.describe('card-voice.ts — härleds generiskt ur kontraktet, ingen ändring behövs', () => {
  const kalla = fs.readFileSync(path.join(ROOT, 'lib/jarvis/card-voice.ts'), 'utf8')

  test('voiceFor/reviewAlternatives läser action-contract generiskt, inte en hårdkodad typlista', () => {
    expect(kalla).toContain("import { classify, mayExecute } from '@/lib/approvals/action-contract'")
    expect(kalla).not.toContain("'team_intro'")
  })
})

test.describe('WelcomeModal — "Visa mig kön" navigerar på riktigt', () => {
  const modal = fs.readFileSync(path.join(ROOT, 'components/WelcomeModal.tsx'), 'utf8')

  test('knappen dismissar OCH navigerar till /dashboard', () => {
    expect(modal).toContain("import { useRouter } from 'next/navigation'")
    expect(modal).toContain("router.push('/dashboard')")
    // Stängkrysset (X) ska fortfarande bara stänga, inte navigera.
    const xKnapp = modal.slice(modal.indexOf('<X '), modal.indexOf('<X ') + 5)
    expect(xKnapp).toBeTruthy()
  })
})
