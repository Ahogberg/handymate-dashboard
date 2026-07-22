/**
 * Serviceavtal-motorn v1 — facit-tester för de rena kärnfunktionerna.
 * Körs: npx playwright test tests/serviceavtal.spec.ts --no-deps
 * Mönster: tests/kapacitet.spec.ts.
 */
import { test, expect } from '@playwright/test'
import { addIntervalMonths, pickBestWeek, type WeekCapacityCandidate } from '../lib/agreements/schedule'
import {
  matchAgreementTypesByKeywords,
  buildFallbackAvtalSms,
  buildHaikuUserMessage,
  parseAndValidateHaikuResponse,
  AVTAL_FORSLAG_SMS_MAX_LENGTH,
} from '../lib/agents/hanna/avtal-forslag'
import { priceExclVat, priceInclVatPerVisit } from '../lib/agreements/pricing'
import {
  computeSweepBudget,
  MAX_NEW_PER_SWEEP,
  pickLatestPerCustomer,
  summarizeSweepResult,
  type KundbasSweepResult,
  type RawActivityRow,
} from '../lib/agents/hanna/kundbas-svep'

test.describe('addIntervalMonths — nästa-besöks-beräkning', () => {
  test('vanligt fall: +1 månad inom samma år', () => {
    expect(addIntervalMonths('2026-01-15', 1)).toBe('2026-02-15')
  })

  test('månadsskifte: 31 jan + 1 månad klamras till feb (icke-skottår, 28 dagar)', () => {
    expect(addIntervalMonths('2026-01-31', 1)).toBe('2026-02-28')
  })

  test('skottår: 31 jan + 1 månad klamras till 29 feb 2028', () => {
    expect(addIntervalMonths('2028-01-31', 1)).toBe('2028-02-29')
  })

  test('årsskifte: december + 1 månad → januari nästa år', () => {
    expect(addIntervalMonths('2026-12-15', 1)).toBe('2027-01-15')
  })

  test('flera månader samtidigt över årsskifte + klamring: 30 nov + 3 månader → 28 feb (icke-skottår)', () => {
    expect(addIntervalMonths('2026-11-30', 3)).toBe('2027-02-28')
  })

  test('helt år (12 månader): samma dag, nästa år', () => {
    expect(addIntervalMonths('2026-12-15', 12)).toBe('2027-12-15')
  })

  test('två år (24 månader)', () => {
    expect(addIntervalMonths('2026-08-15', 24)).toBe('2028-08-15')
  })

  test('31-dagarsmånad → 31-dagarsmånad: ingen klamring behövs', () => {
    expect(addIntervalMonths('2026-03-31', 12)).toBe('2027-03-31')
  })

  test('36 månader (takgenomgångsintervallet i katalogen)', () => {
    expect(addIntervalMonths('2026-01-10', 36)).toBe('2029-01-10')
  })
})

test.describe('pickBestWeek — Lars-cronens veckoval', () => {
  test('väljer veckan med flest lediga timmar bland tre kandidater', () => {
    const candidates: WeekCapacityCandidate[] = [
      { week_start: '2026-08-03', open_hours: 5 },   // föregående vecka
      { week_start: '2026-08-10', open_hours: 12 },  // målveckan
      { week_start: '2026-08-17', open_hours: 20 },  // nästa vecka — tunnast
    ]
    expect(pickBestWeek(candidates, '2026-08-10')).toBe('2026-08-17')
  })

  test('målveckan vinner om den redan har mest lediga timmar', () => {
    const candidates: WeekCapacityCandidate[] = [
      { week_start: '2026-08-03', open_hours: 5 },
      { week_start: '2026-08-10', open_hours: 25 },
      { week_start: '2026-08-17', open_hours: 8 },
    ]
    expect(pickBestWeek(candidates, '2026-08-10')).toBe('2026-08-10')
  })

  test('okänd kapacitet (null) ignoreras — väljer bland de kända', () => {
    const candidates: WeekCapacityCandidate[] = [
      { week_start: '2026-08-03', open_hours: null },
      { week_start: '2026-08-10', open_hours: 10 },
      { week_start: '2026-08-17', open_hours: null },
    ]
    expect(pickBestWeek(candidates, '2026-08-10')).toBe('2026-08-10')
  })

  test('alla okonfigurerade (null) → faller tillbaka på målveckan', () => {
    const candidates: WeekCapacityCandidate[] = [
      { week_start: '2026-08-03', open_hours: null },
      { week_start: '2026-08-10', open_hours: null },
      { week_start: '2026-08-17', open_hours: null },
    ]
    expect(pickBestWeek(candidates, '2026-08-10')).toBe('2026-08-10')
  })

  test('tom kandidatlista → faller tillbaka på målveckan', () => {
    expect(pickBestWeek([], '2026-08-10')).toBe('2026-08-10')
  })

  test('lika open_hours → närmast målveckan vinner', () => {
    const candidates: WeekCapacityCandidate[] = [
      { week_start: '2026-08-03', open_hours: 15 },
      { week_start: '2026-08-10', open_hours: 15 },
      { week_start: '2026-08-17', open_hours: 15 },
    ]
    expect(pickBestWeek(candidates, '2026-08-10')).toBe('2026-08-10')
  })

  test('endast en kandidat känd (t.ex. föregående vecka) → den väljs oavsett', () => {
    const candidates: WeekCapacityCandidate[] = [
      { week_start: '2026-08-03', open_hours: 3 },
      { week_start: '2026-08-10', open_hours: null },
      { week_start: '2026-08-17', open_hours: null },
    ]
    expect(pickBestWeek(candidates, '2026-08-10')).toBe('2026-08-03')
  })

  test('open_hours=0 räknas som känt (tätbokad vecka) — väljs bara om ingen bättre finns', () => {
    const candidates: WeekCapacityCandidate[] = [
      { week_start: '2026-08-03', open_hours: 0 },
      { week_start: '2026-08-10', open_hours: 0 },
    ]
    // Lika (båda 0) → närmast målveckan (2026-08-10 = målveckan själv, avstånd 0)
    expect(pickBestWeek(candidates, '2026-08-10')).toBe('2026-08-10')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Etapp 2 — Hannas AI-matchning (lib/agents/hanna/avtal-forslag.ts) +
// pris-inkl-moms (lib/agreements/pricing.ts). Cron-loopen och Haiku-
// anropet självt (matchViaHaiku) testas INTE här — de kräver en riktig
// Supabase-klient respektive Anthropic-API.
// ═══════════════════════════════════════════════════════════════════════

test.describe('priceInclVatPerVisit / priceExclVat', () => {
  test('summerar kvantitet × styckpris exkl. moms', () => {
    const items = [
      { quantity: 1, unit_price: 800 },
      { quantity: 2, unit_price: 100 },
    ]
    expect(priceExclVat(items)).toBe(1000)
  })

  test('lägger på 25% moms och avrundar till närmaste krona', () => {
    const items = [{ quantity: 1, unit_price: 799 }]
    // 799 * 1.25 = 998.75 → 999
    expect(priceInclVatPerVisit(items)).toBe(999)
  })

  test('saknad kvantitet defaultar till 1', () => {
    const items = [{ unit_price: 400 }]
    expect(priceExclVat(items)).toBe(400)
  })

  test('tom/null price_items → 0', () => {
    expect(priceExclVat(null)).toBe(0)
    expect(priceInclVatPerVisit(undefined)).toBe(0)
    expect(priceExclVat([])).toBe(0)
  })
})

test.describe('matchAgreementTypesByKeywords — fallback utan LLM', () => {
  const catalog = [
    { type_id: 'sat_varmepump', match_keys: ['värmepump', 'värmepumpsservice'] },
    { type_id: 'sat_vatrum', match_keys: ['våtrum', 'badrum'] },
    { type_id: 'sat_tak', match_keys: ['tak', 'takarbete'] },
  ]

  test('hittar match via case-insensitive innehåll i projekttitel', () => {
    const matches = matchAgreementTypesByKeywords('Byte av VÄRMEPUMP i villa', catalog)
    expect(matches).toEqual(['sat_varmepump'])
  })

  test('hittar flera matcher, max 2', () => {
    const bigCatalog = [
      { type_id: 'a', match_keys: ['badrum'] },
      { type_id: 'b', match_keys: ['tak'] },
      { type_id: 'c', match_keys: ['badrum'] }, // matchar också men vi stannar vid 2
    ]
    const matches = matchAgreementTypesByKeywords('Badrumsrenovering med nytt tak', bigCatalog)
    expect(matches.length).toBe(2)
    expect(matches).toEqual(['a', 'b'])
  })

  test('ingen träff → tom lista', () => {
    expect(matchAgreementTypesByKeywords('Målning av fasad', catalog)).toEqual([])
  })

  test('tom sökstäng → tom lista (kraschar inte)', () => {
    expect(matchAgreementTypesByKeywords('', catalog)).toEqual([])
  })

  test('katalogpost utan match_keys ignoreras säkert', () => {
    const catalogWithNulls = [{ type_id: 'x', match_keys: null }]
    expect(matchAgreementTypesByKeywords('värmepump', catalogWithNulls)).toEqual([])
  })
})

test.describe('buildFallbackAvtalSms — deterministisk mall-text', () => {
  test('följer specens exakta mall', () => {
    const sms = buildFallbackAvtalSms({
      customerFirstName: 'Anna Andersson',
      projectTitle: 'värmepumpsbyte',
      typeName: 'Värmepumpsservice',
      intervalMonths: 12,
      priceInclVat: 999,
      businessName: 'Svensson Bygg',
    })
    expect(sms).toBe(
      'Hej Anna! Nu när värmepumpsbyte är klart: vi erbjuder Värmepumpsservice ' +
        'var 12:e månad (999 kr/besök). Svara JA så lägger vi upp det. /Svensson Bygg',
    )
  })

  test('kund utan namn → generisk hälsning', () => {
    const sms = buildFallbackAvtalSms({
      customerFirstName: null,
      projectTitle: 'takarbete',
      typeName: 'Takinspektion',
      intervalMonths: 36,
      priceInclVat: 1500,
      businessName: 'Taksmeden',
    })
    expect(sms.startsWith('Hej!')).toBe(true)
    expect(sms).not.toContain('Hej !')
  })

  test('saknat företagsnamn faller tillbaka på "oss"', () => {
    const sms = buildFallbackAvtalSms({
      customerFirstName: 'Erik',
      projectTitle: 'jobbet',
      typeName: 'Service',
      intervalMonths: 12,
      priceInclVat: 500,
      businessName: null,
    })
    expect(sms).toContain('/oss')
  })

  test('aldrig längre än 300 tecken även med extremt långa fält', () => {
    const sms = buildFallbackAvtalSms({
      customerFirstName: 'Erik',
      projectTitle: 'A'.repeat(200),
      typeName: 'B'.repeat(200),
      intervalMonths: 12,
      priceInclVat: 999,
      businessName: 'C'.repeat(100),
    })
    expect(sms.length).toBeLessThanOrEqual(AVTAL_FORSLAG_SMS_MAX_LENGTH)
  })

  test('nämner pris och intervall — aldrig hittepå-siffror', () => {
    const sms = buildFallbackAvtalSms({
      customerFirstName: 'Erik',
      projectTitle: 'värmepumpsbyte',
      typeName: 'Värmepumpsservice',
      intervalMonths: 6,
      priceInclVat: 1234,
      businessName: 'Testbolaget',
    })
    expect(sms).toContain('1234 kr/besök')
    expect(sms).toContain('var 6:e månad')
  })
})

test.describe('parseAndValidateHaikuResponse — JSON-validering + type_id-filtrering', () => {
  const validIds = ['sat_a', 'sat_b']

  test('giltigt svar → matches + sms behålls', () => {
    const raw = '{"matches": ["sat_a"], "sms": "Hej! Vill du teckna avtal? /Företaget"}'
    const result = parseAndValidateHaikuResponse(raw, validIds)
    expect(result).not.toBeNull()
    expect(result?.matches).toEqual(['sat_a'])
    expect(result?.sms).toBe('Hej! Vill du teckna avtal? /Företaget')
  })

  test('kastar bort type_id som inte finns i katalogen (behåller resten)', () => {
    const raw = '{"matches": ["sat_a", "sat_hittepa"], "sms": "Hej!"}'
    const result = parseAndValidateHaikuResponse(raw, validIds)
    expect(result?.matches).toEqual(['sat_a'])
  })

  test('tom matches-lista är ett giltigt AI-beslut (respekteras, INTE null)', () => {
    const raw = '{"matches": [], "sms": "Inget att erbjuda just nu."}'
    const result = parseAndValidateHaikuResponse(raw, validIds)
    expect(result).not.toBeNull()
    expect(result?.matches).toEqual([])
  })

  test('begränsar till max 2 matches även om AI:n skickar fler', () => {
    const raw = '{"matches": ["sat_a", "sat_b", "sat_a"], "sms": "Hej!"}'
    const result = parseAndValidateHaikuResponse(raw, validIds)
    expect(result?.matches.length).toBeLessThanOrEqual(2)
  })

  test('trasig JSON → null (utlöser fallback)', () => {
    expect(parseAndValidateHaikuResponse('inte json alls', validIds)).toBeNull()
    expect(parseAndValidateHaikuResponse('{"matches": [sat_a]}', validIds)).toBeNull()
  })

  test('saknad sms-fält → null', () => {
    const raw = '{"matches": ["sat_a"]}'
    expect(parseAndValidateHaikuResponse(raw, validIds)).toBeNull()
  })

  test('matches som inte är en array → null', () => {
    const raw = '{"matches": "sat_a", "sms": "Hej!"}'
    expect(parseAndValidateHaikuResponse(raw, validIds)).toBeNull()
  })

  test('tom/null input → null', () => {
    expect(parseAndValidateHaikuResponse(null, validIds)).toBeNull()
    expect(parseAndValidateHaikuResponse('', validIds)).toBeNull()
  })

  test('extraherar JSON även med omkringliggande text/preamble', () => {
    const raw = 'Här är mitt svar:\n{"matches": ["sat_b"], "sms": "Hej!"}\nHoppas det hjälper!'
    const result = parseAndValidateHaikuResponse(raw, validIds)
    expect(result?.matches).toEqual(['sat_b'])
  })

  test('trunkerar SMS längre än 300 tecken istället för att kasta ut svaret', () => {
    const longSms = 'A'.repeat(350)
    const raw = JSON.stringify({ matches: ['sat_a'], sms: longSms })
    const result = parseAndValidateHaikuResponse(raw, validIds)
    expect(result).not.toBeNull()
    expect(result!.sms.length).toBeLessThanOrEqual(AVTAL_FORSLAG_SMS_MAX_LENGTH)
  })
})

test.describe('buildHaikuUserMessage — prompt-byggaren (ren funktion)', () => {
  test('innehåller aldrig-hitta-på-pris-regeln och katalogens exakta priser', () => {
    const msg = buildHaikuUserMessage({
      projectTitle: 'Värmepumpsbyte',
      itemDescriptions: ['Demontering gammal pump', 'Installation ny pump'],
      catalog: [
        { type_id: 'sat_a', name: 'Värmepumpsservice', description: 'Årlig service', interval_months: 12, priceInclVat: 999 },
      ],
      customerFirstName: 'Anna',
      businessName: 'Svensson Bygg',
    })
    expect(msg).toContain('ALDRIG hitta på eller ändra pris eller intervall')
    expect(msg).toContain('999 kr/besök')
    expect(msg).toContain('sat_a')
    expect(msg).toContain('Värmepumpsbyte')
    expect(msg).toContain('Demontering gammal pump')
    expect(msg).toContain('{"matches"')
  })

  test('tomma offertrader → placeholder istället för kraschat innehåll', () => {
    const msg = buildHaikuUserMessage({
      projectTitle: 'Okänt jobb',
      itemDescriptions: [],
      catalog: [],
      customerFirstName: null,
      businessName: null,
    })
    expect(msg).toContain('inga offertrader tillgängliga')
  })

  test('begränsar radbeskrivningar till max 15 i prompten', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Rad ${i + 1}`)
    const msg = buildHaikuUserMessage({
      projectTitle: 'Stort jobb',
      itemDescriptions: many,
      catalog: [],
      customerFirstName: null,
      businessName: null,
    })
    expect(msg).toContain('Rad 15')
    expect(msg).not.toContain('Rad 16')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Etapp 2.5 — "Väck kundbasen"-svepet (lib/agents/hanna/kundbas-svep.ts).
// Svep-loopen självt (DB-anrop + Haiku) testas INTE här — bara de rena
// kärnfunktionerna: batch-takets beräkning + kandidat-sorteringen.
// ═══════════════════════════════════════════════════════════════════════

test.describe('computeSweepBudget — batch-takets beräkning', () => {
  test('inga pending → full budget (10)', () => {
    expect(computeSweepBudget(0)).toBe(MAX_NEW_PER_SWEEP)
    expect(computeSweepBudget(0)).toBe(10)
  })

  test('4 pending → 6 nya tillåts (specens exakta exempel)', () => {
    expect(computeSweepBudget(4)).toBe(6)
  })

  test('taket exakt uppnått (10 pending) → 0 nya', () => {
    expect(computeSweepBudget(10)).toBe(0)
  })

  test('fler pending än taket (15) → aldrig negativt, 0 nya', () => {
    expect(computeSweepBudget(15)).toBe(0)
  })

  test('1 pending → 9 nya', () => {
    expect(computeSweepBudget(1)).toBe(9)
  })
})

test.describe('pickLatestPerCustomer — kandidat-sorteringen', () => {
  function row(overrides: Partial<RawActivityRow>): RawActivityRow {
    return {
      customer_id: 'cust_1',
      activity_at: '2026-01-01T00:00:00.000Z',
      title: 'jobbet',
      source: 'project',
      project_id: 'proj_1',
      quote_id: null,
      ...overrides,
    }
  }

  test('en rad per kund, sorterad senaste aktivitet först', () => {
    const rows: RawActivityRow[] = [
      row({ customer_id: 'a', activity_at: '2026-01-01T00:00:00.000Z' }),
      row({ customer_id: 'b', activity_at: '2026-03-01T00:00:00.000Z' }),
      row({ customer_id: 'c', activity_at: '2026-02-01T00:00:00.000Z' }),
    ]
    const result = pickLatestPerCustomer(rows)
    expect(result.map((r) => r.customer_id)).toEqual(['b', 'c', 'a'])
  })

  test('kund med både projekt och offert → väljer den FÄRSKASTE av de två', () => {
    const rows: RawActivityRow[] = [
      row({ customer_id: 'a', source: 'project', activity_at: '2026-01-01T00:00:00.000Z', title: 'Gammalt jobb' }),
      row({ customer_id: 'a', source: 'quote', activity_at: '2026-06-01T00:00:00.000Z', title: 'Ny offert', quote_id: 'q_1', project_id: null }),
    ]
    const result = pickLatestPerCustomer(rows)
    expect(result.length).toBe(1)
    expect(result[0].source).toBe('quote')
    expect(result[0].title).toBe('Ny offert')
  })

  test('äldre offert vs nyare projekt → projektet vinner', () => {
    const rows: RawActivityRow[] = [
      row({ customer_id: 'a', source: 'quote', activity_at: '2026-01-01T00:00:00.000Z', quote_id: 'q_1', project_id: null }),
      row({ customer_id: 'a', source: 'project', activity_at: '2026-05-01T00:00:00.000Z', project_id: 'proj_9' }),
    ]
    const result = pickLatestPerCustomer(rows)
    expect(result[0].source).toBe('project')
    expect(result[0].project_id).toBe('proj_9')
  })

  test('tom lista → tom lista', () => {
    expect(pickLatestPerCustomer([])).toEqual([])
  })

  test('flera kunder, oberoende av inbördes radordning i input', () => {
    const rows: RawActivityRow[] = [
      row({ customer_id: 'x', activity_at: '2025-01-01T00:00:00.000Z' }),
      row({ customer_id: 'y', activity_at: '2026-08-01T00:00:00.000Z' }),
      row({ customer_id: 'x', activity_at: '2026-07-01T00:00:00.000Z' }), // senare rad för x, ska vinna
    ]
    const result = pickLatestPerCustomer(rows)
    expect(result.map((r) => r.customer_id)).toEqual(['y', 'x'])
    expect(result.find((r) => r.customer_id === 'x')?.activity_at).toBe('2026-07-01T00:00:00.000Z')
  })
})

test.describe('summarizeSweepResult — svensk klarspråks-sammanfattning', () => {
  function baseResult(overrides: Partial<KundbasSweepResult>): KundbasSweepResult {
    return {
      business_id: 'biz_1',
      candidates_total: 0,
      candidates_evaluated: 0,
      created: 0,
      skipped_active_agreement: 0,
      skipped_recent: 0,
      skipped_no_phone: 0,
      skipped_no_match: 0,
      ai_calls: 0,
      ai_fallback_used: 0,
      cost_usd: 0,
      usage: { input_tokens: 0, output_tokens: 0 },
      errors: 0,
      no_catalog: false,
      already_at_cap: false,
      pending_before: 0,
      ...overrides,
    }
  }

  test('tom katalog → tydlig uppmaning', () => {
    const msg = summarizeSweepResult(baseResult({ no_catalog: true }))
    expect(msg).toContain('katalog')
  })

  test('redan vid taket → nämner antal pending', () => {
    const msg = summarizeSweepResult(baseResult({ already_at_cap: true, pending_before: 10 }))
    expect(msg).toContain('10')
  })

  test('inga kandidater alls → ärligt besked', () => {
    const msg = summarizeSweepResult(baseResult({ candidates_total: 0 }))
    expect(msg).toBe('Inga kunder med avslutade projekt eller accepterade offerter hittades.')
  })

  test('kandidater fanns men alla skippades → orsaker i klarspråk', () => {
    const msg = summarizeSweepResult(
      baseResult({
        candidates_total: 20,
        skipped_active_agreement: 3,
        skipped_no_phone: 2,
        skipped_no_match: 5,
      }),
    )
    expect(msg).toContain('3 har redan ett aktivt avtal')
    expect(msg).toContain('2 saknar telefonnummer')
    expect(msg).toContain('5 matchade ingen tjänst i katalogen')
  })
})
