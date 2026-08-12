/**
 * Vilka ytor läser business_config från webbläsaren — och märker de när det
 * misslyckas? (2026-08-08)
 *
 * ═══ VARFÖR FACIT OCH INTE EN GREP ═══
 *
 * Frågan "hur många sväljer felet" ställdes tre gånger under en morgon och
 * fick tre olika svar, för att den mättes med grep. Först `const { data,
 * error }` — som missar `logBusinessConfigError(yta, res.error)`. Sedan
 * `.error` — som matchar nästan varje rad i en React-fil. Ingen av siffrorna
 * gick att agera på.
 *
 * En lista som ändras beroende på hur man frågar är inte en lista. Den här
 * filen mäter en gång, med en regel, och låser resultatet.
 *
 * ═══ VARFÖR FRÅGAN BLEV AKUT ═══
 *
 * v96 lade RLS på business_config. En läsning från webbläsaren nekas nu för
 * tre grupper: den som impersonerar, döda företag, och **anställda vars
 * inbjudan aldrig kopplats till en inloggning** (`business_users.user_id IS
 * NULL`). Den sista gruppen finns hos riktiga kunder.
 *
 * För dem returnerar läsningen inget, och `logBusinessConfigError` skriver en
 * rad i en konsol ingen läser — sidan bygger vidare. På en dokumentyta
 * betyder det en offert utan logotyp eller en faktura utan bankgiro. Det
 * senare går inte att betala.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/business-config-reads.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')

function walk(dir: string, ut: string[] = []): string[] {
  if (!fs.existsSync(dir)) return ut
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next' || e.name.startsWith('.')) continue
      walk(p, ut)
    } else if (e.name.endsWith('.tsx')) ut.push(p)
  }
  return ut
}

/** Läser filen business_config från WEBBLÄSAREN? Server-komponenter med
 *  service_role rör inte RLS och är därför inte med. */
function klientLasare(): string[] {
  const ut: string[] = []
  for (const fil of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'components'))]) {
    const s = fs.readFileSync(fil, 'utf8')
    if (!s.includes("from('business_config')")) continue
    // service_role => server-sida, utanför RLS.
    if (s.includes('SUPABASE_SERVICE_ROLE_KEY')) continue
    ut.push(path.relative(ROOT, fil).replace(/\\/g, '/'))
  }
  return ut.sort()
}

/**
 * Ytor som PRODUCERAR ett dokument som lämnar huset.
 *
 * För dem räcker det inte att logga: saknas företagsuppgifterna ska sidan
 * stanna, inte bygga vidare. En ful översiktssida är en olägenhet; en faktura
 * utan bankgiro är trasig.
 */
const DOKUMENTYTOR = [
  'app/dashboard/quotes/new/page.tsx',
  'app/dashboard/quotes/[id]/edit/page.tsx',
  'app/dashboard/invoices/new/page.tsx',
  'app/dashboard/invoices/_shared/InvoiceEditor.tsx',
  'app/dashboard/orders/new/page.tsx',
]

/**
 * Ytor som bara VISAR — de får degradera tyst så länge felet loggas.
 *
 * Listan är avsiktligt explicit. En ny fil som läser business_config hamnar
 * varken här eller i DOKUMENTYTOR och gör testet rött, vilket tvingar ett
 * medvetet val i stället för en tyst tredje kategori.
 */
const VISNINGSYTOR = [
  // Matte Command Center (2026-08-12): /dashboard renderar numera JarvisHome,
  // som inte läser business_config direkt — den gamla Idag-vyn (med sina
  // business_config-läsningar) flyttade oförändrad till
  // app/dashboard/oversikt/page.tsx.
  'app/dashboard/oversikt/page.tsx',
  'app/dashboard/pipeline/page.tsx',
  'app/dashboard/invoices/[id]/page.tsx',
  'app/dashboard/quotes/[id]/page.tsx',
  'app/dashboard/settings/page.tsx',
  'app/dashboard/settings/phone/page.tsx',
  'app/dashboard/settings/quote-style/page.tsx',
  'app/dashboard/settings/website-widget/page.tsx',
  'components/widget/GuardrailsEditor.tsx',
  'components/widget/KnowledgeEditor.tsx',
]

test.describe('varje klient-läsning är klassad', () => {
  test('ingen yta står utanför de två listorna', () => {
    // Kärntestet. En ny sida som läser business_config från webbläsaren måste
    // ta ställning: producerar den ett dokument eller visar den bara?
    const kanda = new Set([...DOKUMENTYTOR, ...VISNINGSYTOR])
    const oklassade = klientLasare().filter(f => !kanda.has(f))
    expect(oklassade, 'nya klient-läsningar av business_config — klassa dem').toEqual([])
  })

  test('listorna innehåller inga döda poster', () => {
    // En yta som slutat läsa business_config ska bort ur listan, annars
    // beskriver facit en produkt som inte finns längre.
    const finns = new Set(klientLasare())
    const doda = [...DOKUMENTYTOR, ...VISNINGSYTOR].filter(f => !finns.has(f))
    expect(doda, 'listade ytor som inte längre läser business_config').toEqual([])
  })
})

test.describe('dokumentytorna märker när uppgifterna saknas', () => {
  for (const yta of DOKUMENTYTOR) {
    test(`${yta} läser felet`, () => {
      const s = fs.readFileSync(path.join(ROOT, yta), 'utf8')
      // Antingen den delade loggaren eller ett eget felnamn ur samma anrop.
      const laser = s.includes('logBusinessConfigError') || /business_?[Cc]onfig[A-Za-z]*[Ee]rror/.test(s)
      expect(laser, `${yta} sväljer felet från business_config`).toBe(true)
    })
  }
})

test.describe('den delade loggaren', () => {
  test('säger vad som går sönder, inte bara att något gick fel', () => {
    const s = fs.readFileSync(path.join(ROOT, 'lib/business/quote-surface-select.ts'), 'utf8')
    expect(s).toContain('logBusinessConfigError')
    // Meddelandet ska nämna konsekvensen — annars går det inte att bedöma
    // allvaret i en logg klockan sju på morgonen.
    expect(s.toLowerCase()).toContain('betaluppgifter')
  })

  test('spärrytan finns och förklarar konsekvensen på svenska', () => {
    const s = fs.readFileSync(path.join(ROOT, 'components/business/ConfigUnavailableNotice.tsx'), 'utf8')
    expect(s).toContain('bankgiro')
    expect(s).toContain('Försök igen')
    // Inga tekniska termer mot slutanvändaren (CLAUDE.md).
    expect(s).not.toMatch(/RLS|policy|payload|business_config kunde/i)
  })
})
