/**
 * Facit: rivning paket C — verktygen (2026-09-17, rad 2.12–2.17).
 *
 * Källskanning, ingen browser/session — låser att de sex borttagna/
 * ihopslagna ytorna faktiskt är borta (inte bara oanvända) och att det som
 * ersatte dem finns på plats. Se tasks/plan-rivning-bcd-2026-09-17.md och
 * tasks/rapport-rivning-bcd-2026-09-17.md för motivering per rad.
 *
 *   ./node_modules/.bin/playwright test tests/rivning-c-verktygen.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const finns = (p: string) => fs.existsSync(path.join(ROOT, p))

const BUILDER = read('app/dashboard/quotes/_shared/QuoteBuilder.tsx')
const EDIT_VIEW = read('app/dashboard/quotes/_shared/QuoteEditView.tsx')

test.describe('2.12 — QuoteNewAIHelper bort, AI-vägen är intaget', () => {
  test('komponenten är raderad och inte importerad', () => {
    expect(finns('app/dashboard/quotes/new/components/QuoteNewAIHelper.tsx')).toBe(false)
    expect(BUILDER).not.toContain("from '../new/components/QuoteNewAIHelper'")
    expect(BUILDER).not.toMatch(/<QuoteNewAIHelper[\s/>]/)
  })

  test('tomrutans "beskriv jobbet"-länk öppnar intaget (setQuickMode)', () => {
    const idx = BUILDER.indexOf('onOpenAiHelp={')
    expect(idx, 'onOpenAiHelp skickas inte in i QuoteDocumentSurface').toBeGreaterThan(-1)
    expect(BUILDER.slice(idx, idx + 60)).toContain("setQuickMode('intake')")
  })

  test('applyAiResult nås fortfarande av Snabbofferten (buildQuickDraft)', () => {
    expect(BUILDER).toContain('function applyAiResult(quote: any)')
    expect(BUILDER).toContain('function buildQuickDraft()')
    const idx = BUILDER.indexOf('async function buildQuickDraft()')
    const body = BUILDER.slice(idx, BUILDER.indexOf('\n  }\n', idx))
    expect(body).toContain('applyAiResult(data.quote)')
  })
})

test.describe('2.13 — QuotePackageComparison bort', () => {
  test('komponenten är raderad och inte monterad', () => {
    expect(finns('components/quotes/QuotePackageComparison.tsx')).toBe(false)
    for (const src of [BUILDER, EDIT_VIEW]) {
      expect(src).not.toMatch(/<QuotePackageComparison[\s/>]/)
      expect(src).not.toContain("from '@/components/quotes/QuotePackageComparison'")
    }
  })

  test('de rena paketfunktionerna (lib/quotes/package-comparison.ts) lever kvar', () => {
    expect(finns('lib/quotes/package-comparison.ts')).toBe(true)
  })
})

test.describe('2.14 — VisitRuleEditor + /api/quotes/visit-rule bort, ersatt av en seedad fråga', () => {
  test('komponenten och API-rutten är raderade', () => {
    expect(finns('components/quotes/VisitRuleEditor.tsx')).toBe(false)
    expect(finns('app/api/quotes/visit-rule/route.ts')).toBe(false)
    expect(finns('app/api/quotes/visit-rule')).toBe(false)
    for (const src of [BUILDER, EDIT_VIEW]) {
      expect(src).not.toMatch(/<VisitRuleEditor[\s/>]/)
      expect(src).not.toContain("from '@/components/quotes/VisitRuleEditor'")
    }
  })

  test('lib/quotes/visit-rule.ts lever kvar — lib/ai-quote-generator.ts läser fortfarande sparade regler', () => {
    expect(finns('lib/quotes/visit-rule.ts')).toBe(true)
    const generator = read('lib/ai-quote-generator.ts')
    expect(generator).toContain("from '@/lib/quotes/visit-rule'")
    expect(generator).toContain('readVisitRule(')
  })

  test('seedIntakeQuestions ger en fritextfråga om besök, efter branschpaketet, före den öppna frågan', () => {
    const src = read('lib/quotes/intake-questions.ts')
    expect(src).toContain("id: uniqueId('planerade_besok', taken)")
    expect(src).toContain('Hur många besök räknar du med?')
    const packIdx = src.indexOf('pack?.questions.forEach')
    const besokIdx = src.indexOf("uniqueId('planerade_besok'")
    const paverkarIdx = src.indexOf("uniqueId('paverkar_tiden'")
    expect(packIdx).toBeGreaterThan(-1)
    expect(besokIdx).toBeGreaterThan(packIdx)
    expect(paverkarIdx).toBeGreaterThan(besokIdx)
  })
})

test.describe('2.15 — QuoteQuickstartCard bort (dödkod, monterades ingenstans)', () => {
  test('komponenten och typen är raderade', () => {
    expect(finns('app/dashboard/quotes/_shared/QuoteQuickstartCard.tsx')).toBe(false)
    expect(BUILDER).not.toContain('QuoteQuickstartCard')
    expect(BUILDER).not.toContain('QuickstartRow')
  })
})

test.describe('2.16 — completeness-chipraden bort, QuoteSection-typen flyttad', () => {
  test('QuoteCompletenessStrip och lib/quotes/quote-completeness.ts är raderade', () => {
    expect(finns('app/dashboard/quotes/_shared/QuoteCompletenessStrip.tsx')).toBe(false)
    expect(finns('lib/quotes/quote-completeness.ts')).toBe(false)
  })

  test('header och bottenfält tar inte längre emot completenessSummaries/hasQuoteContent som props', () => {
    const header = read('app/dashboard/quotes/_shared/QuoteBuilderHeader.tsx')
    const bottomBar = read('app/dashboard/quotes/_shared/QuoteBuilderBottomBar.tsx')
    // Källskannar KOD (prop-deklaration/JSX-montering), inte kommentarer —
    // filerna nämner de gamla namnen i sina egna "det här ersätter X"-
    // rivningskommentarer, vilket är historik, inte ett kvarvarande kontrakt.
    for (const src of [header, bottomBar]) {
      expect(src).not.toMatch(/completenessSummaries[?:]/)
      expect(src).not.toMatch(/hasQuoteContent[?:]/)
      expect(src).not.toMatch(/<QuoteCompletenessStrip[\s/>]/)
    }
    expect(BUILDER).not.toMatch(/completenessSummaries=\{/)
    expect(BUILDER).not.toMatch(/\bconst hasQuoteContent\b/)
    expect(EDIT_VIEW).not.toMatch(/completenessSummaries=\{/)
    expect(EDIT_VIEW).not.toMatch(/\bconst hasQuoteContent\b/)
  })

  test('QuoteSection-typen flyttade till useQuoteSectionNavigation.ts — scrollToSection fungerar fortfarande', () => {
    const nav = read('app/dashboard/quotes/_shared/useQuoteSectionNavigation.ts')
    expect(nav).toContain("export type QuoteSection =")
    expect(nav).not.toContain("from '@/lib/quotes/quote-completeness'")
    const surface = read('app/dashboard/quotes/_shared/QuoteDocumentSurface.tsx')
    expect(surface).toContain("import type { QuoteSection } from './useQuoteSectionNavigation'")
    expect(BUILDER).toContain('const scrollToSection = useQuoteSectionNavigation()')
  })

  test('Skicka-knappens orsakstext ("Välj kund först") finns kvar oförändrad', () => {
    expect(BUILDER).toContain("'Välj kund först'")
  })
})

test.describe('2.17 — fyra ytor blir en: "Matte säger"', () => {
  test('de tre gamla ytorna är raderade', () => {
    for (const p of [
      'app/dashboard/quotes/new/components/DanielsBedomning.tsx',
      'app/dashboard/quotes/new/components/QuoteNewEfterkalkylBanner.tsx',
      'app/dashboard/quotes/new/components/QuoteNewPriceWarningsBanner.tsx',
    ]) expect(finns(p), `${p} ska vara raderad`).toBe(false)
    expect(BUILDER).not.toMatch(/<DanielsBedomning[\s/>]/)
    expect(BUILDER).not.toMatch(/<QuoteNewEfterkalkylBanner[\s/>]/)
    expect(BUILDER).not.toMatch(/<QuoteNewPriceWarningsBanner[\s/>]/)
  })

  test('MatteSager monteras exakt en gång och tar emot alla fyra datakällor', () => {
    expect(finns('app/dashboard/quotes/new/components/MatteSager.tsx')).toBe(true)
    const mounts = BUILDER.match(/<MatteSager[\s/>]/g) || []
    expect(mounts).toHaveLength(1)
    const idx = BUILDER.indexOf('<MatteSager')
    const propsBlock = BUILDER.slice(idx, BUILDER.indexOf('/>', idx))
    for (const prop of ['aiBedomning', 'priceWarnings', 'efterkalkylInsight', 'danielBufferHours']) {
      expect(propsBlock, `${prop} skickas inte till MatteSager`).toContain(prop)
    }
  })

  test('MatteSager renderar ingenting när inget finns (ingen ny AI-logik, bara en yta)', () => {
    const src = read('app/dashboard/quotes/new/components/MatteSager.tsx')
    expect(src).toContain('if (!hasAnything) return null')
    // Ingen ny fetch/AI-anrop härifrån — bara presentation av redan
    // beräknad data (samma props som de fyra gamla ytorna tog emot).
    expect(src).not.toContain('fetch(')
  })
})

// Rad 2.20 ("Spara som mall" → "Spara som upplägg för jobbtypen") har eget
// facit, tests/rivning-2-20-mall-upplagg.spec.ts, och en egen commit —
// se tasks/rapport-rivning-bcd-2026-09-17.md.
