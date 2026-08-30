/**
 * Facit för Customer Facts V1 — säg-det-en-gång-minnet (2026-08-12).
 *
 * Mötesanalysen extraherar EXPLICIT sagda kundfakta som granskningsbara kort
 * med ordagrant citat. Godkännande skriver EN rad i customer_fact. Ingen
 * ambient extraktion — allt går genom ett kort en människa godkänner.
 *
 *   npx playwright test tests/customer-facts.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { classify, mayExecute, ACTION_CONTRACT } from '../lib/approvals/action-contract'
import { ANALYS_TILLATNA_TYPER } from '../lib/voice/analysis-scope'
import { parseFaktaSvar, MIN_TEXT_LANGD } from '../lib/customer-facts/extract-from-text'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('godkännande-kontraktet', () => {
  test('customer_fact är klassad som utförande', () => {
    expect(classify('customer_fact')).toBe('EXECUTABLE_ACTION')
    expect(mayExecute('customer_fact')).toBe(true)
    expect(ACTION_CONTRACT.customer_fact).toBe('EXECUTABLE_ACTION')
  })

  test('exekveraren har en egen gren för customer_fact', () => {
    const s = read('app/api/approvals/[id]/route.ts')
    const i = s.indexOf("case 'customer_fact':")
    expect(i, 'hanteraren saknas i executeApprovalPayload').toBeGreaterThan(-1)
    // Fönstret vidgat 2026-08-16: kanal-härledningskommentaren (source_type
    // email/meeting) sköt fel-strängen förbi det gamla 1700-teckensfönstret.
    // Vidgat igen 2026-08-17 (Promise-to-Proof, Etapp N): promiseDueAt-
    // uträkningen och den villkorade due_at/promise_status-inserten sköt
    // felmeddelandet förbi det gamla 2200-teckensfönstret.
    const gren = s.slice(i, i + 4200)
    expect(gren).toContain("from('customer_fact')")
    expect(gren).toContain('.insert(')
    // Kanalen härleds ur payloaden — e-post får aldrig etiketten 'meeting'.
    expect(gren).toContain("pl.email_conversation_id ? 'email' : 'meeting'")
    // Misslyckad insert ska ge det svenska felet, aldrig en tyst krasch.
    expect(gren).toContain('Kunde inte spara — försök igen om en stund')
  })
})

test.describe('analysmotorns område', () => {
  test('ANALYS_TILLATNA_TYPER innehåller customer_fact', () => {
    expect(ANALYS_TILLATNA_TYPER).toContain('customer_fact')
  })
})

test.describe('mötesgrenen bygger korrekt kort', () => {
  const ANALYZE = 'app/api/voice/analyze/route.ts'

  test('kortbygget läser fact_type, evidence_quote och confidence ur fyndet', () => {
    const s = read(ANALYZE)
    // Sedan Customer Memory V2 (2026-08-16) bygger BÅDA grenarna kortet via
    // den delade buildCustomerFactCard — de faktiska fälten testas där
    // (se "kortbygget är en delad funktion"-testet nedan), det här testet
    // verifierar bara att mötesgrenen faktiskt anropar den, med rätt evidens.
    const i = s.indexOf("s.type === 'customer_fact'")
    expect(i, 'grenen för customer_fact saknas i kortbygget').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 500)
    expect(gren).toContain('buildCustomerFactCard(s')
    expect(gren).toContain("evidensKalla: arMote ? 'mötet' : 'samtalet'")
  })

  test('inget kort skapas utan en härledd kund — hoppas tyst', () => {
    const s = read(ANALYZE)
    const i = s.indexOf("s.type === 'customer_fact'")
    const gren = s.slice(i, i + 400)
    expect(gren, 'ingen vakt mot saknad kund').toContain('if (!factCustomerId) continue')
  })

  test('customer_id härleds via bokningen när samtalet saknar den direkt', () => {
    const s = read(ANALYZE)
    expect(s, 'fallback till booking.customer_id saknas').toContain("from('booking')")
    expect(s).toContain('recording.booking_id')
  })
})

test.describe('telefongrenen bygger korrekt kort (Customer Memory V2, 2026-08-16)', () => {
  const ANALYZE = 'app/api/voice/analyze/route.ts'

  test('telefongrenens prompt lär modellen customer_fact-reglerna, inte bara mötesgrenen', () => {
    const s = read(ANALYZE)
    const elseIdx = s.indexOf(': `Detta är ett AVSLUTAT telefonsamtal')
    expect(elseIdx, 'telefongrenens instruktionsblock hittades inte').toBeGreaterThan(-1)
    const svarsformatIdx = s.indexOf('=== SVARSFORMAT ===')
    const gren = s.slice(elseIdx, svarsformatIdx)
    expect(gren, 'telefongrenen saknar customer_fact-punkten').toContain('"customer_fact"')
    expect(gren).toMatch(/fact_type.*preference.*constraint.*commitment.*contact/s)
  })

  test('schemats hint är generaliserad — inte längre "endast vid platsbesök"', () => {
    const s = read(ANALYZE)
    expect(s).not.toMatch(/endast för customer_fact, endast vid platsbesök/)
  })

  test('den delade talgrenen routar customer_fact via pending_approvals, inte legacy-insert', () => {
    const s = read(ANALYZE)
    const i = s.indexOf("s.type === 'customer_fact'")
    expect(i, 'den delade talgrenen saknar customer_fact').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 900)
    expect(gren).toContain('buildCustomerFactCard(s')
    expect(gren).toContain("evidensKalla: arMote ? 'mötet' : 'samtalet'")
    expect(gren).not.toContain("from('ai_suggestion')")
    expect(s.slice(i)).toContain('publishCallCards(')
    expect(read('sql/v180_call_processing_and_retention.sql')).toContain('INSERT INTO public.pending_approvals')
  })

  test('telefongrenen hoppar tyst utan känd kund — samma vakt som mötesgrenen', () => {
    const s = read(ANALYZE)
    const i = s.indexOf("s.type === 'customer_fact'")
    const gren = s.slice(i, i + 300)
    expect(gren, 'ingen vakt mot saknad kund i talgrenen').toContain('if (!factCustomerId) continue')
  })

  test('kortbygget är en delad funktion — mötes-, telefon- och e-postgrenen kan inte glida isär', () => {
    // Customer Memory V1.1 (2026-08-16): definitionen flyttade från
    // voice/analyze till lib/customer-facts/build-card.ts så att även
    // e-postgrenen (lib/gmail/processor.ts) kan bygga exakt samma kort.
    const delad = read('lib/customer-facts/build-card.ts')
    const i = delad.indexOf('function buildCustomerFactCard')
    expect(i, 'ingen delad kortbyggare hittades').toBeGreaterThan(-1)
    const gren = delad.slice(i, i + 2800)
    expect(gren).toContain("approval_type: 'customer_fact'")
    expect(gren).toContain('fact_type:')
    expect(gren).toContain('evidence_quote:')
    expect(gren).toContain('confidence:')
    expect(gren).toContain('recording_id:')
    expect(gren).toContain('email_conversation_id:')
    // voice/analyze importerar den delade — ingen lokal kopia får återuppstå.
    const s = read(ANALYZE)
    expect(s).toContain("from '@/lib/customer-facts/build-card'")
    expect(s, 'lokal kopia av kortbyggaren i voice/analyze').not.toContain('function buildCustomerFactCard')
    // Båda talgrenarna (möte + telefon) ska gå genom samma gemensamma anrop.
    const anrop = s.match(/buildCustomerFactCard\(/g) || []
    expect(anrop.length, 'kortbyggaren ska anropas från den gemensamma talgrenen').toBe(1)
    expect(s).toContain("evidensKalla: arMote ? 'mötet' : 'samtalet'")
  })
})

test.describe('e-postgrenen (Customer Memory V1.1)', () => {
  const EXTRACTOR = 'lib/customer-facts/extract-from-text.ts'
  const PROCESSOR = 'lib/gmail/processor.ts'

  test('processorn extraherar bara under kundvakten — fakta är alltid kundnycklade', () => {
    const s = read(PROCESSOR)
    // Vakten är distinkt: den generella "if (match.customer_id || match.lead_id)"
    // för events räcker inte — extraktionen kräver en KUND, aldrig ett lead.
    const vakt = s.indexOf('if (match.customer_id && insertedEmail?.id)')
    expect(vakt, 'kundvakten runt extraktionen saknas').toBeGreaterThan(-1)
    const gren = s.slice(vakt, vakt + 3200)
    expect(gren, 'extraktionen ligger inte under kundvakten').toContain('extractCustomerFacts(')
    // Fel får aldrig fälla mejlhanteringen — berikning, inte kärnflöde.
    expect(gren).toContain('try {')
    expect(gren).toContain('catch')
    // Inget anrop före vakten — extraktionen har exakt en väg in.
    expect(s.slice(0, vakt)).not.toContain('extractCustomerFacts(')
  })

  test('e-postfakta blir kort i pending_approvals — aldrig direkt i customer_fact', () => {
    const proc = read(PROCESSOR)
    expect(proc).toContain("from('pending_approvals')")
    expect(proc, 'processorn får inte skriva customer_fact direkt').not.toContain("from('customer_fact')")
    const ex = read(EXTRACTOR)
    expect(ex, 'extraktorn får inte skriva customer_fact direkt').not.toContain("from('customer_fact')")
    // Extraktorn extraherar — anroparen äger kortbygget och inserten.
    expect(ex).not.toContain("from('pending_approvals')")
    // Samma id/status/utgångsmönster som mötesgrenen (7 dagar).
    const i = proc.indexOf("from('pending_approvals')")
    const gren = proc.slice(Math.max(0, i - 1800), i + 600)
    expect(gren).toContain('buildCustomerFactCard(')
    expect(gren).toContain("status: 'pending'")
    expect(gren).toContain('7 * 24 * 60 * 60 * 1000')
  })

  test('kortet stämplas med beslutspost och e-postkälla', () => {
    const s = read(PROCESSOR)
    expect(s).toContain("prompt: 'emailFactExtraction'")
    expect(s).toContain('emailConversationId')
    expect(s).toContain("evidensKalla: 'mejlet'")
  })

  test('extraktorns prompt bär de fyra fact_types, citatkravet och åtkomstkodsförbudet', () => {
    const s = read(EXTRACTOR)
    expect(s).toMatch(/fact_type.*preference.*constraint.*commitment.*contact/s)
    expect(s).toContain('ordagrant citat')
    expect(s).toContain('Max 5')
    // voice/analyze-facitet räknar sina fyra förbudsrader filskopat (testet
    // ovan) — e-postprompten låses separat här med exakt samma radform.
    const forbud = s.match(/SÄKERHET: extrahera[^\n]*ALDRIG åtkomstkoder/g) || []
    expect(forbud.length, 'förbudsraden saknas i e-postprompten').toBeGreaterThanOrEqual(1)
  })

  test('extraktorn mäts via cost-guard — cogs-facitets enda tillåtna LLM-skrivare', () => {
    const s = read(EXTRACTOR)
    expect(s).toContain('meterDirectLlmCall')
    expect(s).toContain('llmCostUsd(')
    // En egen cost_event-skrivare här hade fällt cogs-facitets
    // "en skrivare per faktum"-test — mätningen går GENOM cost-guard.
    expect(s).not.toMatch(/resource:\s*'llm'/)
  })

  test('extraktionsfel ger tom lista — aldrig ett kastat fel upp till mejlflödet', () => {
    const s = read(EXTRACTOR)
    const returns = s.match(/return \[\]/g) || []
    // Minst tre tomma utvägar: för kort text, saknad API-nyckel, catch.
    expect(returns.length).toBeGreaterThanOrEqual(3)
    expect(s).toContain('catch')
  })

  test('parseFaktaSvar returnerar [] för skräp och upprätthåller max 5 i kod', () => {
    expect(parseFaktaSvar('')).toEqual([])
    expect(parseFaktaSvar('inte json alls')).toEqual([])
    expect(parseFaktaSvar('{"fel": "form"}')).toEqual([])
    expect(parseFaktaSvar('{"fakta": "inte en lista"}')).toEqual([])
    // Okänd fact_type filtreras bort — aldrig en gissad typ.
    expect(parseFaktaSvar(JSON.stringify({
      fakta: [{ fact_type: 'password', content: 'x', evidence_quote: 'y', confidence: 1 }],
    }))).toEqual([])
    // Text runt JSON tolereras — modellen svamlar ibland trots instruktionen.
    const giltig = {
      fact_type: 'preference',
      content: 'Vill ha ekparkett i hallen',
      evidence_quote: 'vi vill gärna ha ekparkett i hallen',
      confidence: 0.9,
    }
    expect(parseFaktaSvar('Här är svaret: ' + JSON.stringify({ fakta: [giltig] }))).toEqual([giltig])
    // Max 5 är kod, inte prompttillit — sju in ger fem ut.
    const sju = Array.from({ length: 7 }, (_, i) => ({ ...giltig, content: `faktum ${i}` }))
    expect(parseFaktaSvar(JSON.stringify({ fakta: sju })).length).toBe(5)
  })

  test('korta mejl hoppas över före AI-anropet — tröskeln är 80 tecken', () => {
    // "Ok tack!" och "Vi ses imorgon" bär aldrig ett varaktigt faktum men
    // hade annars kostat ett Haiku-anrop per mejl.
    expect(MIN_TEXT_LANGD).toBe(80)
    const s = read(EXTRACTOR)
    expect(s).toContain('MIN_TEXT_LANGD')
  })
})

test.describe('säkerhet: åtkomstkoder får aldrig extraheras', () => {
  test('mötes-, telefon-, MAP- och REDUCE-prompterna förbjuder åtkomstkoder explicit', () => {
    const s = read('app/api/voice/analyze/route.ts')
    // Engångsprompten (möte OCH telefon, sedan Customer Memory V2), MAP-
    // prompten och REDUCE-prompten ska alla bära den explicita
    // förbudsraden — inte bara nämna "kontaktuppgift" i förbigående.
    const forbudsrader = s.match(/SÄKERHET: extrahera[^\n]*ALDRIG åtkomstkoder/g) || []
    expect(forbudsrader.length, 'förbudsraden saknas i minst en av de fyra prompterna').toBeGreaterThanOrEqual(4)
  })

  test('"portkod" nämns inte längre som exempel på en kontaktuppgift', () => {
    // "portkod(er)" får förekomma i förbudsraderna ("extrahera ALDRIG
    // åtkomstkoder — portkoder, ...") men aldrig längre i den gamla,
    // uppmuntrande formen "kontaktuppgift (t.ex. portkod, ...)".
    const s = read('app/api/voice/analyze/route.ts')
    expect(s).not.toMatch(/kontaktuppgift[^\n]*portkod/i)
    expect(s).not.toMatch(/t\.ex\.\s*portkod/i)
  })

  test('demo-transkriptet innehåller ingen åtkomstkod', () => {
    const s = read('app/api/admin/demo-seed-meeting/route.ts')
    expect(s.toLowerCase()).not.toContain('portkod')
    expect(s.toLowerCase()).not.toContain('larmkod')
  })
})

test.describe('supersede — senaste vinner bara för contact/commitment', () => {
  const ROUTE = 'app/api/approvals/[id]/route.ts'

  test('supersede-uppdateringen finns i customer_fact-caset, efter inserten', () => {
    const s = read(ROUTE)
    const caseStart = s.indexOf("case 'customer_fact':")
    const insertIdx = s.indexOf(".insert(", caseStart)
    const supersedeIdx = s.indexOf('superseded_by: fact.id', caseStart)
    expect(caseStart, 'caset saknas').toBeGreaterThan(-1)
    expect(insertIdx).toBeGreaterThan(caseStart)
    expect(supersedeIdx, 'supersede-uppdateringen saknas').toBeGreaterThan(insertIdx)
  })

  test('bara contact och commitment superseder — preference/constraint behåller alla aktiva', () => {
    const s = read(ROUTE)
    const i = s.indexOf("case 'customer_fact':")
    // Vidgat 2026-08-17 (Promise-to-Proof, Etapp N): promiseDueAt/factInsert-
    // blocket sköt supersede-villkoret förbi det gamla 3000-teckensfönstret.
    const gren = s.slice(i, i + 5200)
    expect(gren).toContain("factType === 'contact' || factType === 'commitment'")
    expect(gren).not.toContain("factType === 'preference'")
    expect(gren).not.toContain("factType === 'constraint'")
  })

  test('supersede-uppdateringen filtrerar på business+customer+fact_type och utesluter det nya faktumet självt', () => {
    const s = read(ROUTE)
    const i = s.indexOf('superseded_by: fact.id')
    const gren = s.slice(Math.max(0, i - 400), i + 400)
    expect(gren).toContain("eq('business_id', businessId)")
    expect(gren).toContain("eq('customer_id', pl.customer_id)")
    expect(gren).toContain("eq('fact_type', factType)")
    expect(gren).toContain(".is('superseded_by', null)")
    expect(gren).toContain(".neq('id', fact.id)")
  })

  test('supersede-uppdateringen har egen try/catch — får aldrig fälla ett redan sparat faktum', () => {
    const s = read(ROUTE)
    const i = s.indexOf('superseded_by: fact.id')
    const tryStart = s.lastIndexOf('try {', i)
    const catchAfter = s.indexOf('} catch', i)
    expect(tryStart, 'supersede-uppdateringen ligger inte i ett eget try-block').toBeGreaterThan(-1)
    expect(catchAfter).toBeGreaterThan(i)
    // Insert-felet ovanför returnerar redan (stänger caset) om det gick fel,
    // så try/catchet här skyddar bara supersede-steget, inte hela caset.
    const returnBeforeTry = s.lastIndexOf('return { action:', tryStart)
    expect(returnBeforeTry).toBeGreaterThan(-1)
  })
})

test.describe('"ta bort"-vägen — självrefererande superseded_by', () => {
  const FACTS_ROUTE = 'app/api/customers/[id]/facts/route.ts'

  test('DELETE-handler finns, kräver inloggning och tenant-matchning', () => {
    const s = read(FACTS_ROUTE)
    const i = s.indexOf('export async function DELETE')
    expect(i, 'DELETE-handlern saknas').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 2000)
    expect(gren).toContain('getAuthenticatedBusiness')
    expect(gren).toContain("eq('business_id', business.business_id)")
    expect(gren).toContain("eq('customer_id', customerId)")
  })

  test('DELETE sätter superseded_by till radens EGET id — ingen hård DELETE', () => {
    const s = read(FACTS_ROUTE)
    const i = s.indexOf('export async function DELETE')
    const gren = s.slice(i, i + 2000)
    expect(gren).toContain('update({ superseded_by: factId })')
    expect(gren).toContain("eq('id', factId)")
    expect(gren).not.toContain('.delete(')
  })

  test('DELETE filtrerar på superseded_by IS NULL — kan inte "ta bort" ett redan ersatt faktum', () => {
    const s = read(FACTS_ROUTE)
    const i = s.indexOf('export async function DELETE')
    const gren = s.slice(i, i + 2000)
    expect(gren).toContain(".is('superseded_by', null)")
  })

  test('sql/v122-kommentaren dokumenterar båda superseded_by-konventionerna', () => {
    const s = read('sql/v122_customer_fact.sql')
    expect(s).toContain('radens EGET id')
    expect(s).toContain('contact/commitment')
  })
})

test.describe('konsumenterna läser fail-safe', () => {
  test('resolvern filtrerar på superseded_by och begränsar till 10', () => {
    const s = read('lib/matte/resolver.ts')
    const i = s.indexOf("from('customer_fact')")
    expect(i, 'resolvern läser inte customer_fact').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 400)
    expect(gren).toContain('superseded_by')
    expect(gren).toContain('.limit(10)')
    expect(s).toContain('confirmedFacts')
  })

  test('intent-agentens kontext visar bekräftade kundfakta bara när listan inte är tom', () => {
    const s = read('lib/matte/intent-agent.ts')
    expect(s).toContain('BEKRÄFTADE KUNDFAKTA')
    expect(s).toContain('entity.confirmedFacts.length > 0')
  })

  test('läs-API:et för kundkortet är fail-safe (try/catch → tom lista)', () => {
    const s = read('app/api/customers/[id]/facts/route.ts')
    expect(s).toContain('getAuthenticatedBusiness')
    expect(s).toContain('superseded_by')
    expect(s, 'inget try/catch runt frågan').toContain('catch')
    expect(s).toContain('facts: []')
  })

  test('tidslinjens källa har egen try/catch och rätt event-form', () => {
    const s = read('app/api/customers/[id]/timeline/route.ts')
    const i = s.indexOf("customer_fact_confirmed")
    expect(i, 'källa 13 saknas').toBeGreaterThan(-1)
    const gren = s.slice(Math.max(0, i - 800), i + 400)
    expect(gren).toContain('try {')
    expect(gren).toContain('catch')
    expect(gren).toContain("f.confirmed_at || f.created_at")
  })

  test('Matte-chattens get_customer-verktyg (Customer Memory V2) läser bekräftade fakta, fail-safe', () => {
    const s = read('app/api/agent/trigger/tool-router.ts')
    const i = s.indexOf('async function getCustomer(')
    expect(i, 'getCustomer-funktionen hittades inte').toBeGreaterThan(-1)
    const naestaFunktion = s.indexOf('\nasync function ', i + 10)
    const gren = s.slice(i, naestaFunktion > -1 ? naestaFunktion : i + 1500)
    expect(gren, 'get_customer läser inte customer_fact').toContain("from('customer_fact')")
    expect(gren).toContain('.is(\'superseded_by\', null)')
    expect(gren).toContain('.limit(10)')
    expect(gren).toContain('confirmed_facts')
    expect(gren, 'saknar fail-safe try/catch').toContain('try {')
    expect(gren).toContain('catch')
  })
})

test.describe('injektionspunkt 1: offertgenereringen (lib/ai-quote-generator.ts)', () => {
  const GEN = 'lib/ai-quote-generator.ts'

  test('fetchCustomerFactsForQuote filtrerar på superseded_by, business+customer och bara preference/constraint', () => {
    const s = read(GEN)
    const i = s.indexOf('async function fetchCustomerFactsForQuote')
    expect(i, 'hjälpfunktionen saknas').toBeGreaterThan(-1)
    // Fönstret vidgat 2026-08-12 (driftlarm-rapportering): funktionen fick
    // en rapporteraTystFel-inkoppling i båda fail-safe-grenarna, se testet
    // nedan — den ryms inte längre i det gamla 1200-teckensfönstret.
    const gren = s.slice(i, i + 1900)
    expect(gren).toContain("from('customer_fact')")
    expect(gren).toContain("eq('business_id', businessId)")
    expect(gren).toContain("eq('customer_id', customerId)")
    expect(gren).toContain(".is('superseded_by', null)")
    expect(gren).toContain("in('fact_type', ['preference', 'constraint'])")
    expect(gren).toContain('.limit(8)')
  })

  test('fetchCustomerFactsForQuote är fail-safe — try/catch runt frågan, tom lista vid fel', () => {
    const s = read(GEN)
    const i = s.indexOf('async function fetchCustomerFactsForQuote')
    const gren = s.slice(i, i + 1900)
    expect(gren).toContain('try {')
    expect(gren).toContain('catch')
    const returns = gren.match(/return \[\]/g) || []
    expect(returns.length, 'både fel-grenen och catch ska returnera tom lista').toBeGreaterThanOrEqual(2)
  })

  test('fetchCustomerFactsForQuote rapporterar tysta fel till driftlarmet, men aldrig för 42P01/42703', () => {
    const s = read(GEN)
    const i = s.indexOf('async function fetchCustomerFactsForQuote')
    const gren = s.slice(i, i + 1900)
    expect(gren).toContain('rapporteraTystFel')
    expect(gren).toContain('arSchemaSaknas')
  })

  test('anropas bara när input.customerId finns', () => {
    const s = read(GEN)
    expect(s).toContain('input.customerId ? fetchCustomerFactsForQuote(input.businessId, input.customerId)')
  })

  test('prompten injicerar kundfakta bara när listan inte är tom, med rubrik och [typ] content-rader', () => {
    const s = read(GEN)
    const i = s.indexOf('customerFactsContext')
    expect(i, 'customerFactsContext saknas').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 700)
    expect(gren).toContain('customerFacts.length > 0')
    expect(gren).toContain('BEKRÄFTADE KUNDFAKTA')
    expect(s).toContain('${customerFactsContext}')
  })

  test('customerFacts returneras i svaret bredvid lessons', () => {
    const s = read(GEN)
    expect(s).toContain('customerFacts: Array<{ fact_type:')
    // Return-satsen ska faktiskt lämna tillbaka listan, inte bara typa den.
    const returnIdx = s.indexOf('lessons,\n    customerFacts,')
    expect(returnIdx, 'customerFacts saknas i return-objektet bredvid lessons').toBeGreaterThan(-1)
  })
})

test.describe('injektionspunkt 2: projektsidan (Att tänka på)', () => {
  const PAGE = 'app/dashboard/projects/[id]/page.tsx'
  const CARD = 'components/projects/ProjectCustomerFactsCard.tsx'

  test('projektsidan hämtar via det befintliga facts-API:et med projektets customer_id', () => {
    const s = read(PAGE)
    expect(s).toContain('const customerId = project?.customer?.customer_id')
    expect(s).toContain('fetch(`/api/customers/${customerId}/facts`)')
  })

  test('hämtningen är fail-safe — try/catch, tom lista vid fel eller saknad kund', () => {
    const s = read(PAGE)
    const i = s.indexOf('const customerId = project?.customer?.customer_id')
    const gren = s.slice(i, i + 1000)
    expect(gren).toContain('if (!customerId)')
    expect(gren).toContain('setProjectCustomerFacts([])')
    expect(gren).toContain('try {')
    expect(gren).toContain('catch')
  })

  test('kortet renderas i Översikt-tabben', () => {
    const s = read(PAGE)
    expect(s).toContain('import { ProjectCustomerFactsCard }')
    expect(s).toContain('<ProjectCustomerFactsCard facts={projectCustomerFacts} />')
  })

  test('kortet renderar ingenting när listan är tom', () => {
    const s = read(CARD)
    const i = s.indexOf('export function ProjectCustomerFactsCard')
    const gren = s.slice(i, i + 300)
    expect(gren).toContain('if (facts.length === 0) return null')
  })

  test('kortet begränsar till max 6 rader och visar svenska typ-badges för alla fyra typerna', () => {
    const s = read(CARD)
    expect(s).toContain('facts.slice(0, 6)')
    expect(s).toContain("preference: { label: 'Preferens'")
    expect(s).toContain("constraint: { label: 'Förutsättning'")
    expect(s).toContain("commitment: { label: 'Löfte'")
    expect(s).toContain("contact: { label: 'Kontakt'")
  })
})
