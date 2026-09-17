import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  applyIntakeAnswers, buildIntakeAnswerSet, equivalentUnit, intakeAnswersText, intakeUnitsFromRows, readIntakeAnswerSet,
  readIntakeQuestions, seedIntakeQuestions, validateIntakeQuestions, type IntakeQuestion,
} from '../lib/quotes/intake-questions'
import { fetchIntakeQuestions } from '../lib/quotes/intake-flow'

// Frågeflöde per jobbtyp (2026-09-17, Andreas: "frågeflöden per jobbtyp byggs
// först … seedade per bransch som kan redigeras, bytas ut och fyllas på").
// Facit: rena funktioner (form, seedning, svar→rader, svar→text), transporten
// (läsfel är aldrig tomma frågor) och källskanning av kopplingen: frågorna
// öppnas FÖRE upplägget läggs in, hoppa över ger upplägget orört, svaren
// sparas validerade på offerten, remsan QuoteJobTypeStart rörs inte.
// Kör: npx playwright test tests/intake-questions.spec.ts --no-deps

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const utanKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const fragor: IntakeQuestion[] = [
  { id: 'yta_m2', label: 'Hur stor yta gäller det?', kind: 'number', unit: 'm²' },
  { id: 'antal_st', label: 'Hur många stycken?', kind: 'number', unit: 'st' },
  { id: 'golvvarme', label: 'Ska det vara golvvärme?', kind: 'yesno', optionMatch: 'golvvärme' },
  { id: 'ytskikt', label: 'Vilket ytskikt?', kind: 'choice', choices: ['Kakel', 'Klinker'] },
  { id: 'ovrigt', label: 'Något som påverkar tiden?', kind: 'text' },
]

const rader = () => [
  { item_type: 'heading', description: 'Badrum', unit: '', quantity: 1 },
  { item_type: 'item', description: 'Tätskikt', unit: 'm2', quantity: 1 },
  { item_type: 'item', description: 'Kakel vägg', unit: 'M²', quantity: 1 },
  { item_type: 'item', description: 'Rivning', unit: 'tim', quantity: 8 },
  { item_type: 'item', description: 'Blandare', unit: 'st', quantity: 1 },
  { item_type: 'option', description: 'Golvvärme elektrisk', unit: 'm²', quantity: 1, option_selected: false, option_default: false },
  { item_type: 'option', description: 'Handdukstork', unit: 'st', quantity: 1, option_selected: true, option_default: true },
]

test.describe('formen — validateIntakeQuestions / readIntakeQuestions', () => {
  test('giltig lista går igenom oförändrad i innehåll', () => {
    expect(validateIntakeQuestions(fragor)).toEqual(fragor)
  })
  test('null är "aldrig redigerade", skräp är "inga frågor"', () => {
    expect(readIntakeQuestions(null)).toBeNull()
    expect(readIntakeQuestions(undefined)).toBeNull()
    expect(readIntakeQuestions('nej')).toEqual([])
    expect(readIntakeQuestions([{ id: 'x', label: 'Y', kind: 'raket' }])).toEqual([])
  })
  test('fel som avvisas: för många, dubbla nycklar, okända fält, enhet på fel typ, alternativ på fel typ', () => {
    expect(() => validateIntakeQuestions(Array.from({ length: 21 }, (_, i) => ({ id: `q${i}`, label: 'x', kind: 'text' })))).toThrow(/Högst 20/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'text' }, { id: 'a', label: 'y', kind: 'text' }])).toThrow(/nyckeln/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'text', price: 1 }])).toThrow(/okända fält/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'text', unit: 'm²' }])).toThrow(/Bara mått/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'text', choices: ['1', '2'] }])).toThrow(/Bara valfrågor/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'choice', choices: ['1'] }])).toThrow(/2–12/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'choice', choices: ['1', '1'] }])).toThrow(/dubbla/)
    expect(() => validateIntakeQuestions([{ id: 'Stor Nyckel', label: 'x', kind: 'text' }])).toThrow(/nyckel/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x'.repeat(201), kind: 'text' }])).toThrow(/200/)
  })
  test('tomt kopplat tillval sparas inte som fält', () => {
    expect(validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'yesno', optionMatch: '' }])).toEqual([{ id: 'a', label: 'x', kind: 'yesno' }])
  })
})

test.describe('seedningen — bransch + jobbtypens namn + enheterna i standardraderna', () => {
  test('en mängdfråga per enhet, med radens egen stavning, alias slås ihop', () => {
    const units = intakeUnitsFromRows(rader())
    expect(units).toEqual(['m2', 'tim', 'st'])
    const seeded = seedIntakeQuestions('construction', 'Renovera badrum', ['m2', 'M²', 'tim', 'st', 'kvm'])
    const numbers = seeded.filter(q => q.kind === 'number')
    expect(numbers.map(q => q.unit)).toEqual(['m2', 'tim', 'st'])
    expect(numbers.map(q => q.id)).toEqual(['yta_m2', 'timmar', 'antal_st'])
    expect(equivalentUnit('m2', 'KVM')).toBe(true); expect(equivalentUnit('m', 'm2')).toBe(false); expect(equivalentUnit('st', 'paket')).toBe(false)
  })
  test('alias till samma fråga-id hoppas när stavningen redan täckts av sameUnit', () => {
    const seeded = seedIntakeQuestions('construction', 'Renovera badrum', ['m²', 'm²', 'st'])
    expect(seeded.filter(q => q.kind === 'number')).toHaveLength(2)
  })
  test('branschpaketets frågor följer med när namnet matchar, sist en öppen fråga, högst åtta', () => {
    const seeded = seedIntakeQuestions('electrician', 'Laddbox', ['st', 'tim', 'm'])
    expect(seeded.filter(q => q.id.startsWith('paket_')).map(q => q.label)).toEqual(['Vilken modell och placering?', 'Vilken kabelväg och vilket markarbete behövs?'])
    expect(seeded[seeded.length - 1].id).toBe('paverkar_tiden')
    expect(seeded.length).toBeLessThanOrEqual(8)
    expect(seedIntakeQuestions('electrician', 'Laddbox', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'])).toHaveLength(8)
  })
  test('närliggande bransch lånar paketen; okänd bransch ger ändå mängd- och öppen fråga', () => {
    expect(seedIntakeQuestions('carpenter', 'Fönster och dörrar', []).some(q => q.id === 'paket_1')).toBe(true)
    const other = seedIntakeQuestions('other', 'Servicebesök', ['tim'])
    expect(other.map(q => q.id)).toEqual(['timmar', 'paverkar_tiden'])
  })
  test('seedade frågor är giltiga enligt formen', () => {
    expect(() => validateIntakeQuestions(seedIntakeQuestions('plumber', 'Avlopp', ['m', 'st', 'tim', 'm3', 'kg']))).not.toThrow()
  })
})

test.describe('svar → rader — applyIntakeAnswers', () => {
  test('mått sätter mängd på artikelrader med samma enhet (även stavningsvariant), aldrig på tillval eller andra enheter', () => {
    const before = rader()
    const after = applyIntakeAnswers(before, fragor, { yta_m2: '6,5', antal_st: 3 })
    expect(after.map(r => r.quantity)).toEqual([1, 6.5, 6.5, 8, 3, 1, 1])
    // Orörda rader är samma objekt — inget kopieras i onödan.
    expect(after[0]).toBe(before[0]); expect(after[3]).toBe(before[3]); expect(after[5]).toBe(before[5])
    expect(after[1]).not.toBe(before[1])
  })
  test('tomt, noll eller hoppat svar rör ingen rad', () => {
    const before = rader()
    expect(applyIntakeAnswers(before, fragor, { yta_m2: '', antal_st: 0 })).toEqual(before)
    expect(applyIntakeAnswers(before, fragor, {})).toEqual(before)
  })
  test('ja/nej med kopplat tillval kryssar matchande tillvalsrader — nej kryssar ur, utan koppling händer inget', () => {
    const ja = applyIntakeAnswers(rader(), fragor, { golvvarme: true })
    expect(ja[5].option_selected).toBe(true); expect(ja[5].option_default).toBe(true); expect(ja[6].option_selected).toBe(true)
    const nej = applyIntakeAnswers(rader(), fragor, { golvvarme: false })
    expect(nej[5].option_selected).toBe(false); expect(nej[6].option_selected).toBe(true)
    const utan = applyIntakeAnswers(rader(), [{ id: 'q', label: 'x', kind: 'yesno' }], { q: true })
    expect(utan).toEqual(rader())
  })
  test('val och fritext rör aldrig rader', () => {
    expect(applyIntakeAnswers(rader(), fragor, { ytskikt: 'Kakel', ovrigt: '12 m² extra' })).toEqual(rader())
  })
})

test.describe('svar → offert och Matte — buildIntakeAnswerSet / readIntakeAnswerSet / intakeAnswersText', () => {
  test('bara besvarade frågor sparas, i frågeordning, med enhet och normaliserat värde', () => {
    const set = buildIntakeAnswerSet('badrum', fragor, { yta_m2: '6,5', golvvarme: false, ytskikt: 'Kakel', ovrigt: '  trång trappa ' }, '2026-09-17T10:00:00.000Z')
    expect(set).toEqual({ version: 1, jobType: 'badrum', source: 'hantverkare', answeredAt: '2026-09-17T10:00:00.000Z', answers: [
      { id: 'yta_m2', label: 'Hur stor yta gäller det?', kind: 'number', unit: 'm²', value: 6.5 },
      { id: 'golvvarme', label: 'Ska det vara golvvärme?', kind: 'yesno', value: false },
      { id: 'ytskikt', label: 'Vilket ytskikt?', kind: 'choice', value: 'Kakel' },
      { id: 'ovrigt', label: 'Något som påverkar tiden?', kind: 'text', value: 'trång trappa' },
    ] })
    expect(buildIntakeAnswerSet('badrum', fragor, {})).toBeNull()
    expect(buildIntakeAnswerSet('badrum', fragor, { ytskikt: 'Marmor' })).toBeNull()
  })
  test('serverns läsning: rundtur bevarar, skräp och fel version blir null', () => {
    const set = buildIntakeAnswerSet('badrum', fragor, { yta_m2: 6, golvvarme: true, ovrigt: 'x' })
    expect(readIntakeAnswerSet(JSON.parse(JSON.stringify(set)))).toEqual(set)
    expect(readIntakeAnswerSet(null)).toBeNull()
    expect(readIntakeAnswerSet({ ...set, version: 2 })).toBeNull()
    expect(readIntakeAnswerSet({ ...set, source: 'kund' })).toBeNull()
    expect(readIntakeAnswerSet({ ...set, answers: [{ id: 'a', label: 'b', kind: 'number', value: 'sex' }] })).toBeNull()
    expect(readIntakeAnswerSet({ ...set, answers: [] })).toBeNull()
  })
  test('texten till Matte är läsbar svenska med enhet och Ja/Nej', () => {
    const set = buildIntakeAnswerSet('badrum', fragor, { yta_m2: 6.5, golvvarme: true, ovrigt: 'trång trappa' })
    expect(intakeAnswersText(set)).toBe('Uppgifter från platsbesöket:\n- Hur stor yta gäller det? 6,5 m²\n- Ska det vara golvvärme? Ja\n- Något som påverkar tiden? trång trappa')
    expect(intakeAnswersText(null)).toBe('')
  })
})

test.describe('transporten — fetchIntakeQuestions', () => {
  function transport(status: number, body: unknown) {
    const calls: { url: string; method: string }[] = []
    const fetcher = (async (url: string, options?: RequestInit) => {
      calls.push({ url, method: options?.method || 'GET' })
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch
    return { calls, fetcher }
  }
  test('läsfel är ett fel — aldrig en tom lista som hoppar förbi frågorna', async () => {
    const t = transport(503, { error: 'Kunde inte läsa frågorna. Försök igen.' })
    await expect(fetchIntakeQuestions('badrum', undefined, t.fetcher)).rejects.toThrow(/Kunde inte läsa/)
    await expect(fetchIntakeQuestions('badrum', undefined, transport(200, { questions: 'nej' }).fetcher)).rejects.toThrow()
  })
  test('läser med GET, no-store och url-kodad jobbtyp', async () => {
    const t = transport(200, { jobType: { slug: 'el & vvs', name: 'El' }, questions: [], seeded: true, units: [], canManage: false })
    const view = await fetchIntakeQuestions('el & vvs', undefined, t.fetcher)
    expect(view.questions).toEqual([])
    expect(t.calls).toEqual([{ url: '/api/job-types/intake-questions?jobType=el%20%26%20vvs', method: 'GET' }])
  })
})

test.describe('kopplingen i koden — källskanning', () => {
  test('migrationen deklarerar båda kolumnerna', () => {
    const sql = read('sql/v253_intake_questions.sql')
    expect(sql).toContain('ALTER TABLE public.job_types ADD COLUMN IF NOT EXISTS intake_questions JSONB')
    expect(sql).toContain('ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS intake_answers JSONB')
  })
  test('rutten är dynamisk, auth:ar och låser PUT till ägare/admin', () => {
    const route = utanKommentarer(read('app/api/job-types/intake-questions/route.ts'))
    expect(route).toContain("export const dynamic = 'force-dynamic'")
    expect((route.match(/getAuthenticatedBusiness\(request\)/g) || []).length).toBe(2)
    expect(route).toContain("hasPermission(user, 'see_financials')")
    expect(route).toContain('isOwnerOrAdmin(user)) return NextResponse.json')
    expect(route).toContain("'Cache-Control': 'no-store'")
  })
  test('servern: frågor utan sparad lista seedas, skrivning validerar och null återställer', () => {
    const server = utanKommentarer(read('lib/quotes/intake-questions-server.ts'))
    expect(server).toContain('stored ?? seedIntakeQuestions(trade, job.name, units)')
    expect(server).toContain('seeded: stored === null')
    expect(server).toContain("body.questions === null ? null : validateIntakeQuestions(body.questions)")
    expect(server).toContain(".eq('is_active', true)")
  })
  test('offertstarten: frågorna hämtas EFTER verifieringen och FÖRE upplägget läggs in; hoppa över ger upplägget orört', () => {
    const builder = utanKommentarer(read('app/dashboard/quotes/_shared/QuoteBuilder.tsx'))
    const start = builder.indexOf('async function applyJobTypeStart(')
    const block = builder.slice(start, builder.indexOf('function leaveIntakeFlow'))
    const verify = block.indexOf('canApplyJobTypeStart(before, jobStartSnapshot.current)')
    const fetch = block.indexOf('await fetchIntakeQuestions(start.selection.jobTypeSlug, signal)')
    const open = block.indexOf("setQuickMode('fragor')")
    const apply = block.indexOf('handleNewTemplateSelect(start.template, start.products)')
    expect(verify).toBeGreaterThan(-1); expect(fetch).toBeGreaterThan(verify); expect(open).toBeGreaterThan(fetch); expect(apply).toBeGreaterThan(open)
    expect(block).toContain('if (intake.questions.length > 0) {')
    expect(block).toContain('applyIntakeAnswers(verified.template.default_items ?? [], answered.questions, answered.answers)')
    expect(block).toContain('setIntakeAnswers(set)')
    expect(block).toContain('intakeAnswersText(set)')
    // Fullskärmsläget: hoppa över = null-svar, tillbaka = lämna flödet.
    expect(builder).toContain("if (quickMode === 'fragor' && pendingIntake)")
    expect(builder).toContain('onSkip={() => applyVerifiedJobTypeStart(pendingIntake.start, null)}')
    expect(builder).toContain('onBack={leaveIntakeFlow}')
    // Svaren följer med i sparning och återställning.
    expect(builder).toContain('intakeAnswers,\n            dealId: dealIdFromQuery')
    expect(builder).toContain('setIntakeAnswers(c.intakeAnswers ?? null)')
  })
  test('svaren sparas validerade på offerten, bara i create-läge', () => {
    const payload = utanKommentarer(read('app/dashboard/quotes/_shared/buildQuotePayload.ts'))
    const create = payload.indexOf("if (input.mode === 'create')")
    expect(payload.indexOf('intake_answers: input.intakeAnswers ?? null')).toBeGreaterThan(create)
    expect(utanKommentarer(read('app/api/quotes/route.ts'))).toContain('intake_answers: readIntakeAnswerSet(body.intake_answers)')
  })
  test('remsan QuoteJobTypeStart (testlåst) och fritextintaget rörs inte av flödet', () => {
    expect(read('components/onboarding/QuoteJobTypeStart.tsx')).not.toMatch(/intake-questions|intake-flow|IntakeQuestionFlow/)
    expect(read('app/dashboard/quotes/new/components/quick/QuickIntake.tsx')).not.toMatch(/intake-questions|intake-flow|IntakeQuestionFlow/)
  })
  test('editorn bor i uppsättningsytan (onboarding + Inställningar → Jobbtyper) och kan återställa till förslagen', () => {
    const setup = utanKommentarer(read('components/onboarding/JobTypeQuoteSetup.tsx'))
    expect(setup).toContain('<JobTypeQuestionsEditor jobTypeSlug={job.slug} jobTypeName={job.name} canManage={data.canManage}')
    const editor = utanKommentarer(read('components/onboarding/JobTypeQuestionsEditor.tsx'))
    expect(editor).toContain('void persist(null)')
    expect(editor).toContain('validateIntakeQuestions(drafts.map(fromDraft))')
  })
  test('kontraktsgrinden kör facit lokalt och i CI', () => {
    expect(JSON.parse(read('package.json')).scripts['test:contracts']).toContain('tests/intake-questions.spec.ts')
    expect(fs.readFileSync(path.join(ROOT, '..', '.github/workflows/contracts.yml'), 'utf8')).toContain('tests/intake-questions.spec.ts')
  })
})
