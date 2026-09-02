/**
 * Facit: Branschledningen — steg 1 i Branschförståelse-programmet (2026-09-02).
 *
 * Bakgrund: `business_config.industry` var 'hantverkare' på samtliga 27
 * prod-konton (skrevs aldrig av appen), men fem AI-vägar läste den i stället
 * för `branch` som onboardingen skriver. Elektrikern presenterades som
 * "hantverkare"/"Bygg" för modellen; `specialties` skrevs men lästes aldrig;
 * företagets egna jobbtyper nådde inte prompterna; tre prompt-byggare hade
 * var sin ofullständig etikettkarta; säsongsmodulen matchade svenska
 * substrängar mot engelska ID:n (`includes('el')` → måleri = elektriker).
 *
 * Det här facitet ska FALLA om någon:
 *   - läser `industry` ur business_config i en AI-väg igen
 *   - lägger tillbaka en lokal branschkarta i en prompt-byggare
 *   - bryter alias-/etikett-kontraktet i lib/branch
 *   - tar bort branschblocket ur agent-/Matte-prompten
 *
 *   npx playwright test tests/branschledningen.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  BRANCH_IDS,
  branchCompanyNoun,
  branchLabel,
  branchWorker,
  describeBranches,
  listBranchDefinitions,
  normalizeBranch,
  resolveBusinessBranch,
} from '../lib/branch'
import { buildTradeContext, formatTradeContextBlock } from '../lib/branch/trade-context'
import { normalizeBranch as seasonGroup } from '../lib/seasonality/industry-themes'
import { defaultCategoryForIndustry } from '../lib/skv/categories'
import { resolveBranches } from '../lib/product-defaults'
import { getKnowledgeForBranch } from '../lib/knowledge-defaults'
import { normalizeTemplateBranch } from '../lib/quote-template-defaults'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

// Onboardingens TRADES-lista läses ur källan (constants.ts drar in
// lucide-react — ska inte laddas i ett facit).
function onboardingTradeIds(): string[] {
  const s = read('app/onboarding/constants.ts')
  const block = s.slice(s.indexOf('export const TRADES'), s.indexOf('export const SPECIALTIES_BY_TRADE'))
  return Array.from(block.matchAll(/id:\s*'([a-z_]+)'/g)).map(m => m[1])
}

// ── 1. Alias- och etikettkontraktet ────────────────────────────────────────

test.describe('lib/branch — en sanning för bransch', () => {
  test('alla onboardingens branscher finns i nyckelrymden', () => {
    const ids = onboardingTradeIds()
    expect(ids.length).toBeGreaterThanOrEqual(8)
    for (const id of ids) {
      expect(BRANCH_IDS as readonly string[]).toContain(id)
      expect(normalizeBranch(id)).toBe(id)
    }
  })

  test('varje definition har svensk etikett, yrkesroll och företagsform', () => {
    for (const d of listBranchDefinitions()) {
      expect(d.label.length).toBeGreaterThan(0)
      expect(d.worker.length).toBeGreaterThan(0)
      expect(d.company.length).toBeGreaterThan(0)
      // Inga engelska ID:n får läcka ut som etikett.
      expect(d.label).not.toBe(d.id)
      expect(d.worker.toLowerCase()).not.toBe(d.id)
    }
  })

  test('kända alias ur äldre kod och prod-data landar rätt', () => {
    expect(normalizeBranch('snickeri')).toBe('carpenter')   // prod-värde
    expect(normalizeBranch('bygg')).toBe('construction')
    expect(normalizeBranch('el')).toBe('electrician')
    expect(normalizeBranch('vvs')).toBe('plumber')           // inte hvac
    expect(normalizeBranch('maleri')).toBe('painter')
    expect(normalizeBranch('måleri')).toBe('painter')
    expect(normalizeBranch('Elektriker')).toBe('electrician')
  })

  test("'hantverkare' (gamla industry-defaulten) är allround — aldrig något mer specifikt", () => {
    expect(normalizeBranch('hantverkare')).toBe('other')
    expect(normalizeBranch('Hantverkare')).toBe('other')
  })

  test('fritext matchas ordvis — måleri blir inte el', () => {
    expect(normalizeBranch('Måleri AB')).toBe('painter')
    expect(normalizeBranch('Elektriker AB')).toBe('electrician')
    expect(normalizeBranch('Totalentreprenad i Nacka')).toBe('general_contractor')
    expect(normalizeBranch('Snickarns i Nacka')).toBe('carpenter')
  })

  test('okänt, tomt och null → other, aldrig ett kastat fel', () => {
    expect(normalizeBranch(null)).toBe('other')
    expect(normalizeBranch(undefined)).toBe('other')
    expect(normalizeBranch('')).toBe('other')
    expect(normalizeBranch('   ')).toBe('other')
    expect(normalizeBranch('xyzzy')).toBe('other')
  })

  test('etikettfunktionerna ger svenska ord', () => {
    expect(branchLabel('electrician')).toBe('El')
    expect(branchWorker('electrician')).toBe('Elektriker')
    expect(branchCompanyNoun('electrician')).toBe('elföretag')
    expect(branchLabel('plumber')).toBe('VVS')
    expect(branchCompanyNoun('painter')).toBe('måleriföretag')
    expect(branchWorker('hantverkare')).toBe('Allroundhantverkare')
  })

  test('resolveBusinessBranch: branch vinner, industry bara som reserv, sekundära dedupas', () => {
    expect(resolveBusinessBranch({ branch: 'electrician', industry: 'plumber' }).primary).toBe('electrician')
    expect(resolveBusinessBranch({ branch: null, industry: 'plumber' }).primary).toBe('plumber')
    expect(resolveBusinessBranch({ branch: null, industry: 'hantverkare' }).primary).toBe('other')
    expect(resolveBusinessBranch({}).primary).toBe('other')
    const r = resolveBusinessBranch({ branch: 'electrician', secondary_branches: ['electrician', 'plumber', 'vvs', 'other', 'bygg'] })
    expect(r.secondary).toEqual(['plumber', 'construction'])
  })

  test('describeBranches skriver "El (+ VVS, Bygg)"', () => {
    const r = resolveBusinessBranch({ branch: 'electrician', secondary_branches: ['plumber', 'construction'] })
    expect(describeBranches(r)).toBe('El (+ VVS, Bygg)')
    expect(describeBranches(r, 'worker')).toBe('Elektriker (+ Rörmokare, Byggare)')
    expect(describeBranches(resolveBusinessBranch({ branch: 'painter' }))).toBe('Måleri')
  })
})

// ── 2. Branschkontexten till prompterna ────────────────────────────────────

test.describe('lib/branch/trade-context — specialiteter + jobbtyper når prompten', () => {
  test('buildTradeContext läser branch, specialties och jobbtyper', () => {
    const ctx = buildTradeContext({
      branch: 'electrician',
      industry: 'hantverkare',
      secondary_branches: ['plumber'],
      specialties: ['Laddboxar', 'Solceller', 'Laddboxar', ''],
      job_types: [{ name: 'Laddbox' }, { name: 'Elcentral' }],
    })
    expect(ctx.primary).toBe('electrician')
    expect(ctx.secondary).toEqual(['plumber'])
    expect(ctx.specialties).toEqual(['Laddboxar', 'Solceller'])
    expect(ctx.jobTypes).toEqual(['Laddbox', 'Elcentral'])
  })

  test('blocket innehåller bransch, specialiteter, jobbtyper och spärren', () => {
    const block = formatTradeContextBlock(buildTradeContext({
      branch: 'electrician',
      secondary_branches: ['plumber'],
      specialties: ['Laddboxar'],
      job_types: ['Laddbox', 'Elcentral'],
    }))
    expect(block).toContain('## Bransch och inriktning')
    expect(block).toContain('Bransch: El (+ VVS)')
    expect(block).toContain('ett elföretag')
    expect(block).toContain('du hjälper en elektriker')
    expect(block).toContain('Specialiteter (valda av ägaren): Laddboxar')
    expect(block).toContain('Företagets egna jobbtyper (använd exakt dessa namn när du pratar om jobb): Laddbox, Elcentral')
    expect(block).toContain('Erbjud aldrig tjänster som ligger utanför branschen')
    expect(block).not.toContain('electrician')
  })

  test('utan jobbtyper: modellen ska fråga, inte hitta på', () => {
    const block = formatTradeContextBlock(buildTradeContext({ branch: 'painter', job_types: [] }))
    expect(block).toContain('inga jobbtyper upplagda ännu — föreslå inga egna')
  })

  test('allround utan sekundärbransch märks som ospecificerad', () => {
    const block = formatTradeContextBlock(buildTradeContext({ branch: null, industry: 'hantverkare' }))
    expect(block).toContain('allround/ej specificerad')
  })

  test('null-kontext ger tom sträng (fail-soft i prompt-vägar)', () => {
    expect(formatTradeContextBlock(null)).toBe('')
    expect(formatTradeContextBlock(undefined)).toBe('')
  })

  test('loadTradeContext läser branch/specialties + aktiva jobbtyper, aldrig industry som primärkälla', () => {
    const s = read('lib/branch/trade-context.ts')
    expect(s).toContain("select('branch, industry, secondary_branches, specialties')")
    expect(s).toContain(".from('job_types')")
    expect(s).toContain(".eq('is_active', true)")
    expect(s).toContain(".is('archived_at', null)")
  })
})

// ── 3. AI-vägarna läser branch — inte industry ────────────────────────────

const AI_VAGAR = [
  'app/api/voice/analyze/route.ts',
  'app/api/agent/trigger/tool-router.ts',
  'app/api/quotes/ai-generate/route.ts',
  'lib/quotes/suggest-quote-draft.ts',
  'lib/ata/suggest-ata-draft.ts',
  'lib/storefront/generate-content.ts',
  'app/api/quotes/templates/route.ts',
  'lib/invoices/sync-to-fortnox.ts',
  'app/api/rot-payment/eligible/route.ts',
  // Hittade av facit i första körningen: gissade 'Bygg'/'hantverkare' rakt in i prompten.
  'lib/approve-actions.ts',
  'lib/e2e-deal-flow.ts',
  'app/api/campaigns/generate-text/route.ts',
]

test.describe('AI-vägarna läser business_config.branch, aldrig industry', () => {
  for (const file of AI_VAGAR) {
    test(`${file} har ingen industry-läsning`, () => {
      const s = read(file)
      // Ingen select som hämtar industry-kolumnen.
      const selects = s.match(/\.select\((['"`])[^'"`]*\1\)/g) || []
      for (const sel of selects) {
        expect(sel, `${file}: ${sel}`).not.toMatch(/\bindustry\b/)
      }
      // Ingen fallback-kedja "x.industry || 'Bygg'" / "'hantverkare'".
      expect(s).not.toMatch(/\.industry\s*\|\|/)
      expect(s).not.toMatch(/\|\|\s*'Bygg'/)
      expect(s).not.toMatch(/\|\|\s*'hantverkare'/)
    })
  }

  test('de fem AI-vägarna hämtar branschtexten ur lib/branch', () => {
    for (const file of [
      'app/api/voice/analyze/route.ts',
      'app/api/agent/trigger/tool-router.ts',
      'app/api/quotes/ai-generate/route.ts',
      'lib/quotes/suggest-quote-draft.ts',
      'lib/ata/suggest-ata-draft.ts',
    ]) {
      const s = read(file)
      expect(s, file).toContain("from '@/lib/branch'")
      expect(s, file).toContain('resolveBusinessBranch(')
    }
  })

  test('samtalsanalysen får hela branschblocket (specialiteter + jobbtyper)', () => {
    const s = read('app/api/voice/analyze/route.ts')
    expect(s).toContain('loadTradeContext(')
    expect(s).toContain('formatTradeContextBlock(')
  })

  test('AuthenticatedBusiness bär branch/secondary_branches/specialties', () => {
    const s = read('lib/auth.ts')
    expect(s).toMatch(/branch: string \| null/)
    expect(s).toMatch(/secondary_branches: string\[\] \| null/)
    expect(s).toMatch(/specialties: unknown/)
  })
})

// ── 4. Prompt-byggarna: inga lokala kartor, branschblocket injicerat ──────

test.describe('prompt-byggarna använder lib/branch', () => {
  test('system-prompt.ts: BRANCH_NAMES borta, tradeContext injicerat', () => {
    const s = read('app/api/agent/trigger/system-prompt.ts')
    expect(s).not.toContain('BRANCH_NAMES')
    expect(s).toContain("from '@/lib/branch'")
    expect(s).toContain('tradeContext?: TradeContext | null')
    expect(s).toContain('formatTradeContextBlock(business.tradeContext)')
    expect(s).toContain('ett ${branschForetag} i')
    expect(s).not.toMatch(/\$\{branchLabel\.toLowerCase\(\)\}företag/)
  })

  test('trigger/route.ts laddar tradeContext fail-soft och skickar det in', () => {
    const s = read('app/api/agent/trigger/route.ts')
    expect(s).toContain("from '@/lib/branch/trade-context'")
    expect(s).toContain('loadTradeContext(supabase, businessId).catch(() => null)')
    expect(s).toMatch(/companyModel,\s*\n\s*tradeContext,/)
  })

  test('Matte-chatten laddar tradeContext och skriver blocket', () => {
    const s = read('app/api/matte/chat/route.ts')
    expect(s).toContain('loadTradeContext(supabase, businessId).catch(() => null)')
    expect(s).toContain('formatTradeContextBlock(ctx.tradeContext)')
  })

  test('lead- och strategi-agenten har ingen egen branchMap', () => {
    for (const file of ['lib/agent/agents/lead-agent.ts', 'lib/agent/agents/strategi-agent.ts']) {
      const s = read(file)
      expect(s, file).not.toContain('branchMap')
      expect(s, file).toContain("from '@/lib/branch'")
      expect(s, file).toContain('ett ${branschForetag}.')
    }
  })

  test('företagsmodellens promptblock skriver svensk etikett', () => {
    const s = read('lib/company/company-model.ts')
    expect(s).toContain("from '@/lib/branch'")
    expect(s).toContain('describeBranches(resolveBusinessBranch({ branch, secondary_branches: extra }))')
  })
})

// ── 5. Biblioteken och sidomodulerna går via samma alias-tabell ───────────

test.describe('bibliotek + sidomoduler normaliserar via lib/branch', () => {
  test('produktbanken: snickeri → carpenter, hantverkare → other, branch före industry', () => {
    expect(resolveBranches({ branch: 'snickeri' })).toEqual(['carpenter'])
    expect(resolveBranches({ branch: null, industry: 'hantverkare' })).toEqual(['other'])
    expect(resolveBranches({ branch: 'electrician', industry: 'plumber' })).toEqual(['electrician'])
    expect(resolveBranches({ branch: 'electrician', secondary_branches: ['electrician', 'plumber'] })).toEqual(['electrician', 'plumber'])
  })

  test('kunskapsbasen: vvs är plumber (inte hvac), måleri är painter', () => {
    expect(getKnowledgeForBranch('vvs')).toBe(getKnowledgeForBranch('plumber'))
    expect(getKnowledgeForBranch('Måleri')).toBe(getKnowledgeForBranch('painter'))
    expect(getKnowledgeForBranch('hantverkare')).toBe(getKnowledgeForBranch('other'))
    expect(read('lib/knowledge-defaults.ts')).not.toContain('BRANCH_MAPPING')
  })

  test('offertmallarna: samma alias', () => {
    expect(normalizeTemplateBranch('bygg')).toBe('construction')
    expect(normalizeTemplateBranch('snickeri')).toBe('carpenter')
    expect(normalizeTemplateBranch(null)).toBe('other')
    expect(read('lib/quote-template-defaults.ts')).not.toContain('BRANCH_ALIASES')
  })

  test('säsongsteman: engelska ID:n landar i rätt grupp, måleri blir inte el', () => {
    expect(seasonGroup('electrician')).toBe('el')
    expect(seasonGroup('plumber')).toBe('vvs')
    expect(seasonGroup('hvac')).toBe('ventilation')
    expect(seasonGroup('painter')).toBe('maleri')
    expect(seasonGroup('Måleri AB')).toBe('maleri')
    expect(seasonGroup('general_contractor')).toBe('bygg')
    expect(seasonGroup('groundworks')).toBe('mark')
    expect(seasonGroup('roofing')).toBe('tak')
    expect(seasonGroup('hantverkare')).toBe('allman')
    expect(read('lib/seasonality/industry-themes.ts')).not.toContain("includes('el')")
  })

  test('Skatteverket-kategorin: normaliserad, mark får sin kod, allround gissas aldrig', () => {
    expect(defaultCategoryForIndustry('electrician')).toBe('El')
    expect(defaultCategoryForIndustry('el')).toBe('El')
    expect(defaultCategoryForIndustry('groundworks')).toBe('MarkDraneringarbete')
    expect(defaultCategoryForIndustry('general_contractor')).toBe('Bygg')
    expect(defaultCategoryForIndustry('other')).toBeNull()
    expect(defaultCategoryForIndustry('hantverkare')).toBeNull()
    expect(defaultCategoryForIndustry(null)).toBeNull()
  })
})
