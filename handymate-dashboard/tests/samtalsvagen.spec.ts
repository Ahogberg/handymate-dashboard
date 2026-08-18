/**
 * Facit för samtalsvägen — överlämningen mellan agenter i triggervägen
 * (2026-08-09, etapp 2a i planen "Inkorgen och samtalsvägen").
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * lib/agent/orchestration.ts byggdes i Epic 2 och facit-testades — men användes
 * bara i Matte-chatten. Triggervägen, som är den agenterna faktiskt går genom
 * efter ett inkommande samtal, hade sin egen överlämning utan något av det:
 *
 *   - 8 000 ms tidsgräns. Kortare än en typisk körning med verktygssteg, så
 *     handoff_delivered blev systematiskt false för överlämningar som
 *     faktiskt kördes klart. Modellen fick ändå texten "tar över nu".
 *   - Inget loopskydd. canHandoff konsulterades inte, ingen besökt-mängd,
 *     ingen stegbudget. Lisa→Daniel→Lisa var möjligt, varje varv en körning.
 *   - Mottagarens resultat kastades bort; anroparen fick en boolean.
 *   - Ingen idempotensnyckel — varje dispatch blev en ny körning.
 *   - Ingen case 'agent_handoff' i getTriggerInstructions, så mottagaren fick
 *     JSON.stringify(trigger_data) via default-caset i stället för en briefing.
 *
 * Testet mäter ORDNING där ordningen är poängen: loopskyddet måste fråga INNAN
 * dispatchen sker. Ett skydd som körs efteråt är ingen grind.
 *
 *   npx playwright test tests/samtalsvagen.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  handoffIdempotencyKey,
  outcomeFromToolResult,
  MAX_SPECIALIST_STEPS,
} from '../lib/agent/orchestration'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

/** Källkoden utan kommentarer och import-rader — annars mäter vi vår egen prosa. */
const kod = (p: string) =>
  read(p)
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^import[\s\S]*?from '[^']*'$/gm, '')

const ROUTER = 'app/api/agent/trigger/tool-router.ts'
const ROUTE = 'app/api/agent/trigger/route.ts'
const PROMPT = 'app/api/agent/trigger/system-prompt.ts'

/** Kroppen av sendAgentMessageTool — resten av routern är 2 000 rader annat. */
function overlamningen(): string {
  const s = kod(ROUTER)
  const start = s.indexOf('async function sendAgentMessageTool')
  expect(start, 'sendAgentMessageTool hittas inte').toBeGreaterThan(-1)
  const slut = s.indexOf('async function getAgentMessagesTool', start)
  return s.slice(start, slut > start ? slut : start + 9000)
}

test.describe('överlämningen ljuger inte om tiden', () => {
  test('8-sekundersgränsen är borta', () => {
    const s = overlamningen()
    expect(s, 'den lögnaktiga tidsgränsen är kvar').not.toContain('8000')
    expect(s).toContain('HANDOFF_BUDGET_MS')
  })

  test('budgeten ryms i routens egen maxDuration', () => {
    // En budget större än routens tak hade bara flyttat avbrottet till Vercel.
    const maxDuration = Number(kod(ROUTE).match(/maxDuration\s*=\s*(\d+)/)?.[1])
    const budgetMs = Number(kod(ROUTER).match(/HANDOFF_BUDGET_MS\s*=\s*([\d_]+)/)?.[1].replace(/_/g, ''))
    expect(maxDuration, 'maxDuration hittas inte').toBeGreaterThan(0)
    expect(budgetMs, 'HANDOFF_BUDGET_MS hittas inte').toBeGreaterThan(0)
    expect(budgetMs / 1000, 'budgeten är större än routens tak').toBeLessThan(maxDuration)
  })

  test('ett okänt utfall kallas okänt, inte misslyckat', () => {
    // Tidigare blev timeout = handoff_delivered false, vilket är ett påstående
    // om att det INTE gick fram. Vi vet inte det.
    const s = overlamningen()
    expect(s, 'boolean-flaggan är tillbaka').not.toContain('handoff_delivered')
    expect(s).toContain('handoff_status')
    expect(kod(ROUTER)).toContain("okand:")
  })
})

test.describe('loopskyddet är en grind, inte en efterkontroll', () => {
  test('validateNextStep frågas INNAN dispatchen', () => {
    const s = overlamningen()
    const grind = s.indexOf('validateNextStep(')
    const dispatch = s.indexOf('/api/agent/trigger`')
    expect(grind, 'loopskyddet saknas i triggervägen').toBeGreaterThan(-1)
    expect(dispatch, 'dispatchen hittas inte').toBeGreaterThan(-1)
    expect(grind, 'skyddet körs efter dispatchen — då är det ingen grind').toBeLessThan(dispatch)
  })

  test('ett nekat byte avbryter — dispatchen sker inte ändå', () => {
    const s = overlamningen()
    const grind = s.indexOf('validateNextStep(')
    const avbrott = s.indexOf('return { success: false', grind)
    const dispatch = s.indexOf('/api/agent/trigger`')
    expect(avbrott).toBeGreaterThan(grind)
    expect(avbrott, 'inget avbrott mellan grinden och dispatchen').toBeLessThan(dispatch)
  })

  test('kedjan reser med, annars vet mottagaren ingenting', () => {
    const s = overlamningen()
    expect(s, 'kedjan skickas inte vidare').toContain('handoff_chain')
    // Matte är orkestrator och räknas inte som specialist — han får återkomma.
    expect(s).toContain("filter(a => a !== 'matte')")
  })

  test('routen tar emot kedjan och kapar den vid taket', () => {
    const s = kod(ROUTE)
    expect(s, 'routen läser aldrig kedjan').toContain('handoff_chain')
    expect(s, 'kedjan valideras inte mot taket').toContain('MAX_SPECIALIST_STEPS')
    expect(s, 'främmande agent-id filtreras inte bort').toContain('isValidAgentId')
  })

  test('alla fyra avslagsskäl har en svensk förklaring till modellen', () => {
    // Ett tyst nej lär modellen ingenting och den försöker igen.
    const s = read(ROUTER)
    for (const skäl of ['invalid_agent', 'not_allowed', 'agent_repeat', 'max_steps']) {
      expect(s, `avslagsskälet ${skäl} saknar besked`).toContain(`${skäl}:`)
    }
  })
})

test.describe('mottagaren får en briefing, inte en JSON-dump', () => {
  test('briefingen byggs i kod och skickas med', () => {
    const s = overlamningen()
    expect(s).toContain('buildHandoffBriefing(')
    expect(s).toContain('handoff_briefing')
  })

  test('agent_handoff har ett eget case i getTriggerInstructions', () => {
    const s = kod(PROMPT)
    const i = s.indexOf("case 'agent_handoff':")
    expect(i, 'överlämningar faller fortfarande igenom till default-caset').toBeGreaterThan(-1)
    // Bara det egna caset — slutar vid nästa case/default, annars läser vi in
    // default-grenens JSON.stringify och mäter fel gren.
    const efter = s.slice(i + 20)
    const nästa = efter.search(/\n\s*(case '|default:)/)
    const block = efter.slice(0, nästa > -1 ? nästa : 500)
    expect(block, 'briefingen läses inte').toContain('handoff_briefing')
    expect(block, 'JSON-dumpen är kvar').not.toContain('JSON.stringify')
  })

  test('kollegans namn kommer från AGENT_CAPABILITIES, inte en kopierad lista', () => {
    const s = kod(PROMPT)
    expect(s).toContain('AGENT_CAPABILITIES')
  })
})

test.describe('anroparen får veta vad kollegan gjorde', () => {
  test('routen returnerar ett agent_result härlett ur verktygsutfallen', () => {
    const s = kod(ROUTE)
    expect(s).toContain('agent_result: toAgentResult(')
    expect(s, 'utfallen samlas aldrig in').toContain('outcomeFromToolResult(')
  })

  test('utfallen läses ur verktygssvaret, inte ur modellens text', () => {
    const s = kod(ROUTE)
    const insamling = s.indexOf('outcomeFromToolResult(')
    const härledning = s.indexOf('agent_result: toAgentResult(')
    expect(insamling).toBeLessThan(härledning)
  })

  test('överlämningen skickar tillbaka mottagarens resultat', () => {
    const s = overlamningen()
    expect(s).toContain('handoff_result')
    expect(s).toContain('agent_result')
  })
})

test.describe('samma arbete körs inte två gånger', () => {
  test('dispatchen bär en idempotensnyckel', () => {
    const s = overlamningen()
    expect(s).toContain('idempotency_key: handoffIdempotencyKey(')
  })

  test('nyckeln är stabil för samma ursprung, steg och mottagare', () => {
    const a = handoffIdempotencyKey({ originKey: 'call_123', target: 'daniel', step: 1 })
    const b = handoffIdempotencyKey({ originKey: 'call_123', target: 'daniel', step: 1 })
    expect(a).toBe(b)
  })

  test('nyckeln skiljer på mottagare och på steg', () => {
    const bas = { originKey: 'call_123', step: 1 } as const
    expect(handoffIdempotencyKey({ ...bas, target: 'daniel' }))
      .not.toBe(handoffIdempotencyKey({ ...bas, target: 'karin' }))
    expect(handoffIdempotencyKey({ ...bas, target: 'daniel' }))
      .not.toBe(handoffIdempotencyKey({ originKey: 'call_123', target: 'daniel', step: 2 }))
  })

  test('en dubblett rapporteras som redan gjord, inte som nyss gjord', () => {
    const s = overlamningen()
    expect(s, 'duplicate-svaret läses inte').toContain('duplicate')
    expect(read(ROUTER)).toContain('ingen dubbelkörning gjordes')
  })
})

test.describe('utfallsavläsningen skiljer på köad och klar', () => {
  test('ett köat utskick väntar på en människa', () => {
    const o = outcomeFromToolResult('send_sms', {
      success: true,
      data: { queued_for_approval: true, approval_id: 'appr_1' },
    })
    expect(o.ok).toBe(true)
    expect(o.awaitingApproval).toBe(true)
  })

  test('ett högriskkort utan utförande väntar också', () => {
    const o = outcomeFromToolResult('create_approval_request', {
      success: true,
      data: { approval_id: 'appr_2', message: 'Godkännandebegäran skapad' },
    })
    expect(o.awaitingApproval).toBe(true)
  })

  test('ett lågriskkort som redan utförts väntar INTE', () => {
    const o = outcomeFromToolResult('create_approval_request', {
      success: true,
      data: { approval_id: 'appr_3', execution: { ok: true } },
    })
    expect(o.awaitingApproval).toBeUndefined()
  })

  test('nattkön är inte samma sak som godkännandekön', () => {
    // data.queued betyder "skickas kl 08" — det behöver inget klick.
    const o = outcomeFromToolResult('send_sms', {
      success: true,
      data: { queued: true, queue_id: 'q1' },
    })
    expect(o.awaitingApproval).toBeUndefined()
  })

  test('ett fel bär med sig sitt skäl', () => {
    const o = outcomeFromToolResult('create_quote', { success: false, error: 'Kunden saknas' })
    expect(o.ok).toBe(false)
    expect(o.error).toBe('Kunden saknas')
  })
})

test.describe('taket är detsamma i båda vägarna', () => {
  test('triggervägen använder samma MAX_SPECIALIST_STEPS som chatten', () => {
    expect(MAX_SPECIALIST_STEPS).toBe(3)
    expect(kod(ROUTE)).toContain('MAX_SPECIALIST_STEPS')
  })
})

/**
 * ═══ Etapp 2b: rollfördelningen Lisa/analysmotorn ═══
 *
 * Lisa AGERAR (bokar, SMS:ar, registrerar kund). Analysmotorn FÖRESLÅR —
 * enbart de typer Lisa saknar verktyg för. Överlappet är omöjligt per
 * konstruktion, och konstruktionen bevisas här genom att korsläsa
 * analysmotorns lista mot Lisas allowedTools: glider de isär faller provet.
 */
test.describe('rollfördelningen är kod, inte prompttillit', () => {
  // Etapp 1b (en väg in): analysmotorns kropp flyttade ut ur route.ts till
  // lib/voice/analyze-call.ts (analyseraSamtal) — route.ts är numera en tunn
  // HTTP-adapter. Konstanten pekar om, invarianterna nedan är oförändrade.
  const ANALYZE = 'lib/voice/analyze-call.ts'
  const TRANSCRIBE = 'app/api/voice/transcribe/route.ts'

  /** Lisas allowedTools, lästa ur personalities.ts — inte kopierade hit. */
  function lisasVerktyg(): string[] {
    const s = read('lib/agents/personalities.ts')
    const lisa = s.slice(s.indexOf("lisa: {"), s.indexOf("triggers: ['incoming_call'"))
    const block = lisa.slice(lisa.indexOf('allowedTools'))
    return (block.match(/'([a-z_]+)'/g) || []).map(t => t.replace(/'/g, ''))
  }

  test('analysmotorn föreslår ENBART det Lisa inte kan utföra', () => {
    const { ANALYS_TILLATNA_TYPER, LISA_AGER_TYPERNA } = require('../lib/voice/analysis-scope')
    const verktyg = lisasVerktyg()
    expect(verktyg.length, 'Lisas verktygslista tolkades tomt').toBeGreaterThan(5)

    // De typer Lisa äger ska motsvara verktyg hon faktiskt har …
    for (const [typ, verktygsNamn] of Object.entries(LISA_AGER_TYPERNA)) {
      expect(verktyg, `Lisa saknar ${verktygsNamn} — då kan hon inte äga ${typ}`).toContain(verktygsNamn)
      expect(ANALYS_TILLATNA_TYPER, `${typ} ägs av Lisa och får inte föreslås`).not.toContain(typ)
    }
    // … och offerten, som analysmotorn föreslår, ska Lisa INTE kunna skapa.
    expect(ANALYS_TILLATNA_TYPER).toContain('quote')
    expect(verktyg, 'Lisa har fått create_quote — då ska quote bort ur analyslistan').not.toContain('create_quote')
  })

  test('filtret körs FÖRE databasskrivningen', () => {
    const s = kod(ANALYZE)
    const filter = s.indexOf('filtreraAnalysforslag')
    const insert = s.indexOf("from('ai_suggestion')\n")
    const insertAlt = s.indexOf(".from('ai_suggestion')")
    const skrivning = insert > -1 ? insert : insertAlt
    expect(filter, 'filtret saknas i analyze').toBeGreaterThan(-1)
    // Dubbelkörningsspärrens SELECT ligger först; jämför mot insert-stället.
    const insertIdx = s.indexOf('.insert({', s.indexOf('Skapa AI-förslag') > -1 ? s.indexOf('Skapa AI-förslag') : filter)
    expect(filter, 'filtret körs efter skrivningen — då är det ingen grind').toBeLessThan(insertIdx)
    expect(skrivning).toBeGreaterThan(-1)
  })

  test('det som kastas loggas — en svamlande modell ska synas', () => {
    expect(read(ANALYZE)).toContain('kastade')
  })

  test('analysen är ett avsiktligt steg, inte en catch-gren', () => {
    // Etapp 1b: fetch mot /api/voice/analyze (ett HTTP-självanrop) ersattes
    // av ett direkt in-process-anrop till analyseraSamtal — samma ordning
    // mäts fortfarande: EFTER Lisa-triggerns catch-block, i huvudflödet.
    const s = kod(TRANSCRIBE)
    const catchIdx = s.indexOf('catch (agentErr)')
    const analyzeIdx = s.indexOf('analyseraSamtal(')
    expect(analyzeIdx, 'analyseraSamtal anropas inte alls').toBeGreaterThan(-1)
    expect(catchIdx).toBeGreaterThan(-1)
    // Anropet ska ligga EFTER catch-blockets slut — i huvudflödet.
    const catchSlut = s.indexOf('}', s.indexOf('console.error', catchIdx))
    expect(analyzeIdx, 'analyseraSamtal bor fortfarande i catch-grenen').toBeGreaterThan(catchSlut)
  })

  test('samma samtal analyseras en gång — knappen ger inga dubbletter', () => {
    // Etapp 1b: den primära spärren är numera det atomiska anspråket
    // (v155, se en-vag-in.spec.ts) — already_analyzed lever kvar som
    // reservväg för miljöer där migrationen inte körts än (missing-column-
    // fallback i claimCallAnalysis).
    const s = kod(ANALYZE)
    expect(s).toContain('already_analyzed')
    // Mötesassistenten V2 (map-reduce för långa transkript) lade till egna
    // anthropic.messages.create-anrop i hjälpfunktioner OVANFÖR
    // analyseraSamtal (extraheraFyndFranChunk, slaIhopFynd) — de körs bara
    // om analyseraSamtal själv anropar dem, EFTER dubbelkörningsspärren. Ett
    // indexOf över hela filen hittar då fel anrop (det första textmässigt,
    // inte det som faktiskt körs). Avgränsa till analyseraSamtals egen
    // kropp där spärren verkligen sitter, så jämförelsen inte förskjuts av
    // kod ovanför den.
    const fnStart = s.indexOf('export async function analyseraSamtal')
    expect(fnStart, 'analyseraSamtal hittades inte').toBeGreaterThan(-1)
    const fn = s.slice(fnStart)
    const sparr = fn.indexOf('already_analyzed')
    const modellanrop = fn.indexOf('anthropic.messages.create')
    expect(sparr, 'spärren saknas i analyseraSamtal').toBeGreaterThan(-1)
    expect(modellanrop, 'modellanropet saknas i analyseraSamtal').toBeGreaterThan(-1)
    expect(sparr, 'spärren ligger efter modellanropet — kostnaden är redan tagen').toBeLessThan(modellanrop)
  })

  test('prompten erbjuder inte längre Lisas typer', () => {
    const s = read(ANALYZE)
    expect(s, 'typunionen i prompten har kvar Lisas typer').not.toContain('"type": "booking|quote')
    // Customer Facts V1 (2026-08-12): customer_fact lades till i unionen —
    // se lib/voice/analysis-scope.ts ANALYS_TILLATNA_TYPER.
    expect(s).toContain('"type": "quote|callback|follow_up|reminder|reschedule|customer_fact"')
  })
})

/**
 * ═══ Etapp 2c: de två fällorna i create_approval_request ═══
 *
 *   1. 'other' dokumenterades i verktygsbeskrivningen men saknas i
 *      ACTION_CONTRACT — kortet gick inte att godkänna, bara avvisa.
 *   2. risk_level low/medium auto-exekverade via en switch som bara kan fyra
 *      typer och tyst returnerade skipped:'no handler' för resten — kortet
 *      markerades auto_approved medan ingenting hänt.
 */
test.describe('de två fällorna är stängda', () => {
  const DEFS = 'app/api/agent/trigger/tool-definitions.ts'

  test("'other' är borta ur verktygsbeskrivningen", () => {
    const s = kod(DEFS)
    const block = s.slice(s.indexOf('create_approval_request'), s.indexOf('check_pending_approvals'))
    expect(block, "'other' erbjuds fortfarande som approval_type").not.toMatch(/create_booking, other/)
  })

  test('okänd typ avvisas vid skapandet, före varje skrivning', () => {
    const s = kod(ROUTER)
    const fn = s.slice(s.indexOf('async function createApprovalRequest'))
    const grind = fn.indexOf('classify(typ)')
    const skrivning = fn.indexOf("from('pending_approvals')")
    expect(grind, 'ingen kontraktskontroll vid skapandet').toBeGreaterThan(-1)
    expect(grind, 'kontrollen ligger efter skrivningen').toBeLessThan(skrivning)
  })

  test('låg risk utan handler blir pending — aldrig godkänd utan utförande', () => {
    const s = kod(ROUTER)
    const fn = s.slice(s.indexOf('async function createApprovalRequest'))
    expect(fn).toContain('INTERNAL_EXEC_TYPES.has(typ)')
    // Nedgraderingen: low/medium utan handler tvingas till high-grenen.
    expect(fn).toMatch(/!harHandler \? 'high'/)
  })

  test('handler-mängden speglar switchens faktiska cases', () => {
    // Facitet läser switchens case-rader och jämför med mängden — läggs en
    // handler till utan att mängden uppdateras (eller tvärtom) faller provet.
    const s = read(ROUTER)
    const exec = s.slice(
      s.indexOf('async function executeApprovalPayloadInternal'),
      s.indexOf('async function checkPendingApprovals')
    )
    const cases = (exec.match(/case '([a-z_]+)':/g) || []).map(c => c.replace(/case '|':/g, ''))
    const mangd = (s.match(/INTERNAL_EXEC_TYPES = new Set\(\[([^\]]+)\]\)/)?.[1].match(/'([a-z_]+)'/g) || [])
      .map(t => t.replace(/'/g, ''))
    expect(cases.sort()).toEqual(mangd.sort())
    expect(mangd.length).toBeGreaterThan(0)
  })
})
