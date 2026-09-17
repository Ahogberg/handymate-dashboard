/**
 * Facit: rivning rad 2.20 (2026-09-17) — "Spara som mall" i headern och
 * detaljsidans egen inline-modal slås ihop till EN väg, "Spara som upplägg
 * för jobbtypen", via SaveJobStandardFromQuote → /api/job-types/quote-setup
 * → lib/quotes/job-standard-server.ts (writeJobStandard).
 *
 * Källskanning, ingen browser/session. Se
 * tasks/rapport-rivning-bcd-2026-09-17.md för motivering och den rättelse
 * som föregick denna rad (kolumnen quotes.job_type fanns hela tiden —
 * bara detaljsidans TypeScript-typ saknade fältet).
 *
 *   ./node_modules/.bin/playwright test tests/rivning-2-20-mall-upplagg.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const finns = (p: string) => fs.existsSync(path.join(ROOT, p))

const BUILDER = read('app/dashboard/quotes/_shared/QuoteBuilder.tsx')
const EDIT_VIEW = read('app/dashboard/quotes/_shared/QuoteEditView.tsx')
const MODAL = read('app/dashboard/quotes/_shared/QuoteSaveTemplateModal.tsx')
const DETAIL_PAGE = read('app/dashboard/quotes/[id]/page.tsx')
const DETAIL_TYPES = read('app/dashboard/quotes/[id]/types.ts')
const DETAIL_HEADER = read('app/dashboard/quotes/[id]/components/QuoteHeader.tsx')
const LOAD_EDIT = read('app/dashboard/quotes/_shared/loadEditQuote.ts')

test.describe('det fria mallnamnet är borta ur alla tre anropare', () => {
  test('saveAsTemplate/templateName/savingTemplate och /api/quote-templates-POST borta', () => {
    // Matchar KOD (deklaration/anrop/JSX-prop), inte kommentarer — filerna
    // nämner de gamla namnen i sina egna "det här ersätter X"-
    // rivningskommentarer, vilket är historik, inte ett kvarvarande beroende.
    for (const src of [BUILDER, EDIT_VIEW, MODAL, DETAIL_PAGE]) {
      expect(src).not.toMatch(/\b(function|const|let) saveAsTemplate\b/)
      expect(src).not.toMatch(/\bonSave=\{saveAsTemplate\}/)
      expect(src).not.toMatch(/\b(const|let) \[templateName/)
      expect(src).not.toMatch(/\btemplateName=\{templateName\}/)
      expect(src).not.toMatch(/\b(const|let) \[savingTemplate/)
    }
    // BUILDER anropar fortfarande /api/quote-templates med PATCH för att öka
    // en malls usage_count när en BEFINTLIG mall VÄLJS (handleNewTemplateSelect)
    // — en helt annan, orörd väg. Bara den fria SPARNINGEN (POST med ett namn)
    // är borttagen.
    expect(DETAIL_PAGE).not.toContain("fetch('/api/quote-templates'")
    expect(BUILDER).not.toMatch(/fetch\('\/api\/quote-templates',\s*\{\s*method: 'POST'/)
  })

  test('/api/quote-templates-routen och mallistan i Inställningar rörs INTE (rad 3.10 kräver Andreas)', () => {
    expect(finns('app/api/quote-templates/route.ts')).toBe(true)
    expect(finns('app/dashboard/settings/quote-templates/page.tsx')).toBe(true)
  })
})

test.describe('EN väg: QuoteSaveTemplateModal (SaveJobStandardFromQuote)', () => {
  test('modalen har bara jobbtyp-vägen kvar, inget mallnamn-fält', () => {
    expect(MODAL).toContain('SaveJobStandardFromQuote')
    expect(MODAL).not.toContain('Mallnamn')
    expect(MODAL).not.toMatch(/<input/)
  })

  test('header (create/edit) OCH detaljsidan monterar samma delade modal', () => {
    for (const src of [BUILDER, EDIT_VIEW, DETAIL_PAGE]) {
      expect(src).toMatch(/<QuoteSaveTemplateModal[\s/>]/)
    }
    expect(DETAIL_PAGE).toContain("import { QuoteSaveTemplateModal } from '@/app/dashboard/quotes/_shared/QuoteSaveTemplateModal'")
  })

  test('saknad jobbtyp visar "Välj jobbtyp först" i stället för att spara utan koppling', () => {
    expect(MODAL).toContain('Välj jobbtyp först')
    expect(MODAL).toContain('jobType && items')
  })
})

test.describe('jobbtypen trådas till alla tre ytor', () => {
  test('detaljsidans Quote-typ och API-svaret bär redan job_type — bara typen saknade fältet', () => {
    expect(DETAIL_TYPES).toContain('job_type?: string | null')
    expect(DETAIL_PAGE).toContain('quote?.job_type')
  })

  test('redigeraren läser jobbtypen från den redan sparade offerten (loadEditQuote.ts)', () => {
    expect(LOAD_EDIT).toContain('jobType: string | null')
    expect(LOAD_EDIT).toContain('jobType: quote.job_type || null')
    expect(BUILDER).toContain('setQuoteJobType(loaded.jobType)')
    expect(EDIT_VIEW).toContain('quoteJobType: string | null')
    const mountIdx = BUILDER.indexOf('<QuoteEditView')
    const propsBlock = BUILDER.slice(mountIdx, BUILDER.indexOf('/>', mountIdx))
    expect(propsBlock).toContain('quoteJobType={quoteJobType}')
  })

  test('ingen schemaändring — quotes.job_type är en befintlig kolumn (sql/v7_pricing.sql)', () => {
    expect(read('sql/v7_pricing.sql')).toContain('ADD COLUMN IF NOT EXISTS job_type TEXT')
  })
})

test.describe('knapptexten byter namn med mekaniken', () => {
  test('"Spara som mall" → "Spara som upplägg" i header och detaljsidans meny', () => {
    expect(read('app/dashboard/quotes/_shared/QuoteBuilderHeader.tsx')).toContain('Spara som upplägg')
    expect(DETAIL_HEADER).toContain('Spara som upplägg')
  })
})

test.describe('kontraktsgrinden kör facit lokalt och i CI', () => {
  test('registrerad i package.json och contracts.yml', () => {
    expect(JSON.parse(read('package.json')).scripts['test:contracts']).toContain('tests/rivning-2-20-mall-upplagg.spec.ts')
    expect(fs.readFileSync(path.join(ROOT, '..', '.github/workflows/contracts.yml'), 'utf8')).toContain('tests/rivning-2-20-mall-upplagg.spec.ts')
  })
})
