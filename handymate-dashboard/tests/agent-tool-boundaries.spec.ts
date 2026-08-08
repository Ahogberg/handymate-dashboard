/**
 * Facit för Epic 1 — Orchestration Safety Contract (Codex orkestrerings-
 * audit 2026-08-08, fynd P0.1 och P0.2).
 *
 * Två gränser som inte fanns:
 *
 * P0.2 — Chatten gav ALLA agenter hela verktygslådan. Karins och Lars
 *   avgränsningar levde bara i systemprompten, alltså i modellens goda vilja.
 *   Agent-trigger-vägen har alltid haft en riktig allowlist; chattvägen fick
 *   samma. En gräns som bara gäller på ena dörren är ingen gräns.
 *
 * P0.1 — Routern kör med service_role, så RLS gäller inte. Mutations-
 *   verktygen skrev params.customer_id rakt in i insert:en. Ett främmande
 *   id — hallucinerat eller injicerat — skapade offert/faktura/bokning/
 *   tidrad som pekar in i en ANNAN tenants kunddata. v96 stängde den
 *   klassen för läsningar; det här stänger den för skrivningar.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/agent-tool-boundaries.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const CHAT = 'app/api/matte/chat/route.ts'
const ROUTER = 'app/api/agent/trigger/tool-router.ts'

/** Kroppen för en funktion, från deklarationen till nästa toppnivådeklaration. */
function funktionskropp(källa: string, namn: string): string {
  const start = källa.indexOf(`async function ${namn}(`)
  expect(start, `hittade inte ${namn}() — har den bytt namn?`).toBeGreaterThan(-1)
  const nästa = källa.indexOf('\nasync function ', start + 10)
  return källa.slice(start, nästa === -1 ? källa.length : nästa)
}

test.describe('P0.2 — allowlisten gäller i chatten, inte bara i prompten', () => {
  const s = read(CHAT)

  test('verktygslistan filtreras per agent innan modellen ser den', () => {
    // Utan detta erbjuds Karin fortfarande create_quote; att hon "inte ska"
    // använda det är en instruktion, inte ett räcke.
    expect(s).toContain("import { getAgentTools } from '@/lib/agents/personalities'")
    expect(s).toContain('function toolsForAgent(')
    expect(s).toContain('TOOLS.filter(t => isToolAllowedForAgent(agent, t.name))')

    // ...och den filtrerade listan måste faktiskt skickas till BÅDA
    // callClaude-anropen i turloopen — ett missat anrop öppnar hela lådan igen.
    const antalTools = (s.match(/tools: agentTools/g) || []).length
    expect(antalTools, 'callClaude-anrop utan agentTools kvar').toBeGreaterThanOrEqual(2)
    expect(s, 'ofiltrerad verktygslista skickas fortfarande någonstans')
      .not.toMatch(/tools:\s*TOOLS\b/)
  })

  test('exekveringen kontrollerar allowlisten igen — listan är inte skyddet', () => {
    // Modellen kan referera ett verktygsnamn den inte fick listat (kontext-
    // rester, prompt injection). Kontrollen sitter därför FÖRE exekveringen.
    const i = s.indexOf('isToolAllowedForAgent(opts.agent, block.name)')
    expect(i, 'ingen exekveringsvakt').toBeGreaterThan(-1)
    const j = s.indexOf('executeSharedTool', i)
    expect(j, 'vakten ligger efter exekveringen').toBeGreaterThan(i)
  })

  test('samordningsverktygen är uttryckligt undantagna, inte glömda', () => {
    // Handoff måste finnas för alla — annars kan en specialist inte lämna
    // tillbaka till Matte och tråden fastnar hos fel agent.
    const block = s.slice(s.indexOf('COORDINATION_TOOLS'), s.indexOf('COORDINATION_TOOLS') + 300)
    expect(block).toContain('handoff_to_agent')
    expect(block).toContain('navigate')
  })
})

test.describe('P0.1 — tenantvakten före varje skrivning', () => {
  const s = read(ROUTER)

  test('vakten finns och är fail-closed', () => {
    const vakt = funktionskropp(s, 'assertCustomerInBusiness')
    expect(vakt).toContain(".eq('business_id', businessId)")
    // Kan kontrollen inte göras ska anropet nekas — aldrig släppas igenom.
    expect(vakt, 'DB-fel läses inte').toMatch(/if \(error\) return/)
    expect(vakt, 'saknad kund släpps igenom').toMatch(/if \(!data\) return/)
  })

  for (const fn of ['createQuote', 'createInvoice', 'createBooking', 'logTime']) {
    test(`${fn}() validerar kunden före första skrivningen`, () => {
      const kropp = funktionskropp(s, fn)
      const vakt = kropp.indexOf('assertCustomerInBusiness')
      expect(vakt, `${fn} saknar tenantvakt`).toBeGreaterThan(-1)

      const skrivning = Math.min(
        ...['.insert(', '.update(']
          .map(m => kropp.indexOf(m))
          .filter(i => i > -1)
          .concat([Number.MAX_SAFE_INTEGER])
      )
      expect(vakt, `${fn} skriver innan kunden är verifierad`).toBeLessThan(skrivning)
    })
  }

  test('updateLeadStatus knyter inte en lead till främmande kund', () => {
    const kropp = funktionskropp(s, 'updateLeadStatus')
    const vakt = kropp.indexOf('assertCustomerInBusiness')
    expect(vakt, 'ingen vakt').toBeGreaterThan(-1)
    expect(vakt).toBeLessThan(kropp.indexOf('.update('))
  })

  test('logTime accepterar inte en främmande bokning', () => {
    const kropp = funktionskropp(s, 'logTime')
    expect(kropp).toContain('Bokningen finns inte i det här företaget')
    // maybeSingle() utan null-koll var precis buggen: tyst null → främmande
    // booking_id skrevs ändå in i tidraden.
    expect(kropp).toContain('bookingErr')
  })
})
