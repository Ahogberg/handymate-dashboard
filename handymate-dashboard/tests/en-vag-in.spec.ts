/**
 * Facit för etapp 1 av "en väg in" — konsolideringen av inbound SMS till EN
 * hjärna, plus idempotenshårdningen (2026-08-18).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * app/api/sms/incoming/route.ts körde TVÅ hjärnor på varje inkommande SMS:
 * Mattes intent-agent (autonoma DB-mutationer, egna godkännandekort som
 * förbigick ACTION_CONTRACT, och ett kundsvar som ALDRIG fungerat — POST mot
 * /api/sms/send utan auth, 401, tyst svalt) parallellt med Lisa via
 * triggerAgentFireAndForget (den som faktiskt svarar kunden). Ovanpå det
 * kunde Matte trigga ÄNNU en agentkörning via routeToAgentWithContext, helt
 * utan idempotensnyckel. Idempotensnyckeln själv var minutbucketad
 * (Math.floor(Date.now()/60000)) — en webhook-retry >60s senare fick en NY
 * nyckel och en andra kundkontakt. agent_runs.idempotency_key var en
 * KVITTENS skriven EFTER hela körningen, inte ett lås — två samtidiga
 * anrop kunde båda passera förkontrollen och båda skicka SMS.
 *
 * Detta är den TRANSITIONELLA statusen: business_config.inbound_single_brain
 * finns som pilotflagga (sql/v153), default AV. Facit mäter båda vägarna.
 *
 *   npx playwright test tests/en-vag-in.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

/** Källkoden utan kommentarer och import-rader — annars mäter vi vår egen prosa. */
const kod = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*import[\s\S]*?from\s+'[^']+'\s*$/gm, '')

const SMS_INCOMING = 'app/api/sms/incoming/route.ts'
const AGENT_TRIGGER = 'app/api/agent/trigger/route.ts'
const ORCHESTRATOR = 'lib/agent/orchestrator.ts'
const AUTOMATION_ENGINE = 'lib/automation-engine.ts'
const ACTION_EXECUTOR = 'lib/matte/action-executor.ts'
const GMAIL_PROCESSOR = 'lib/gmail/processor.ts'

test.describe('1. nyckeln bär ingen klocka', () => {
  const s = kod(SMS_INCOMING)

  test('minutbucketen (Date.now()/60000) är borta', () => {
    expect(s, 'den gamla minutbucketade nyckeln är kvar').not.toMatch(/Date\.now\(\)\s*\/\s*60000/)
  })

  test('nyckeln refererar 46elks eget meddelande-id', () => {
    expect(s).toContain("const elksMessageId = params.get('id')")
    expect(s).toContain("makeIdempotencyKey('sms', elksMessageId)")
  })

  test('utan elks-id faller nyckeln tillbaka på en dygnsstabil (inte minutstabil) hash', () => {
    expect(s).toContain('stockholmDateStamp(')
    expect(s).not.toMatch(/Math\.floor\(Date\.now\(\)/)
  })
})

test.describe('2. anspråket (claimet) tas före modellen', () => {
  const s = kod(AGENT_TRIGGER)

  test('claim-inserten (status: running) ligger före modell-loopen', () => {
    const claimInsert = s.indexOf("status: 'running'")
    const loopStart = s.indexOf('for (let step = 0; step < MAX_STEPS; step++)')
    expect(claimInsert, 'claim-inserten (status: running) hittas inte').toBeGreaterThan(-1)
    expect(loopStart, 'modell-loopen hittas inte').toBeGreaterThan(-1)
    expect(claimInsert, 'claimet tas efter att modellen redan börjat köra').toBeLessThan(loopStart)
  })

  test('en 23505-konflikt (annan process vann claimet) ger samma dubblettsvar-form som förkontrollen', () => {
    expect(s).toContain("claimError.code === '23505'")
    // Samma svarsform på båda ställena — dubblett-branchen (claim) och den
    // gamla förkontrollen (fast path) — annars kan anroparen inte behandla
    // dem lika.
    const dubblettSvar = (s.match(/duplicate: true/g) || []).length
    expect(dubblettSvar).toBeGreaterThanOrEqual(2)
  })

  test('slutskrivningen uppdaterar den claimade raden istället för att försöka en ny insert', () => {
    const i = s.indexOf('if (claimed) {')
    expect(i, 'claimed-grenen hittas inte vid slutskrivningen').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 400)
    expect(gren).toContain(".from('agent_runs')")
    expect(gren).toContain(".update({")
  })

  test('ett kraschat claim släpps i catch-blocket (best effort) — annars blockerar det en legitim retry', () => {
    const catchIdx = s.indexOf('} catch (error: any) {')
    expect(catchIdx, 'catch-blocket hittas inte').toBeGreaterThan(-1)
    const catchBlock = s.slice(catchIdx)
    expect(catchBlock).toContain("status: 'failed'")
    expect(catchBlock).toContain(".eq('status', 'running')")
  })
})

test.describe("2b. samma lås-mönster i orchestrator.ts (run_agent-vägen)", () => {
  const s = kod(ORCHESTRATOR)

  test('claim-inserten ligger före sub-agenten körs', () => {
    const claimInsert = s.indexOf("status: 'running'")
    const runSubagent = s.indexOf('fetchBusinessContext(supabase, businessId')
    expect(claimInsert, 'claim-inserten hittas inte').toBeGreaterThan(-1)
    expect(runSubagent, 'sub-agent-anropet hittas inte').toBeGreaterThan(-1)
    expect(claimInsert).toBeLessThan(runSubagent)
  })

  test('en 23505-konflikt hanteras', () => {
    expect(s).toContain("claimError.code === '23505'")
  })

  test('logAgentRun uppdaterar den claimade raden istället för en ny insert', () => {
    expect(s).toContain('claimed?: boolean')
    const i = s.indexOf('if (claimed) {')
    expect(i, 'claimed-grenen i logAgentRun hittas inte').toBeGreaterThan(-1)
  })
})

test.describe('3. singelhjärnevägen har exakt en dispatch', () => {
  const s = kod(SMS_INCOMING)
  // kod() rensar bort // -kommentarer (inklusive de dekorativa "EN VÄG IN"/
  // "LEGACY"-banderollerna) — grenarna avgränsas därför på den faktiska
  // koden: villkoret som slår över till pilotläget, och else-grenen strax
  // efter dess enda dispatch.
  const onStart = s.indexOf('if (business.inbound_single_brain) {')
  const legacyStart = s.indexOf('} else {', onStart)

  test('båda grenarna hittas i rätt ordning', () => {
    expect(onStart, 'flag-ON-grenen hittas inte').toBeGreaterThan(-1)
    expect(legacyStart, 'legacy-grenen hittas inte').toBeGreaterThan(onStart)
  })

  const onBranch = s.slice(onStart, legacyStart)

  test('exakt EN triggerAgentFireAndForget i flag-ON-grenen', () => {
    const count = (onBranch.match(/triggerAgentFireAndForget\(/g) || []).length
    expect(count, 'flag-ON-grenen ska dispatcha exakt en gång').toBe(1)
  })

  test('flag-ON-grenen har noll referenser till Matte-vägens funktioner', () => {
    for (const ref of ['runIntentAgent', 'executeMatteActions', 'routeToAgentWithContext']) {
      expect(onBranch, `${ref} läcker in i singelhjärnevägen`).not.toContain(ref)
    }
  })

  test('executeMatteActions förekommer i hela filen bara EN gång, och alltid med dryRun: true', () => {
    const count = (s.match(/executeMatteActions\(/g) || []).length
    expect(count, 'executeMatteActions ska bara finnas i legacy-grenens skuggläge').toBe(1)
    const i = s.indexOf('executeMatteActions(')
    expect(s.slice(i, i + 300)).toContain('dryRun: true')
  })
})

test.describe('4. routeToAgentWithContext är borta ur SMS-vägen', () => {
  test('sms/incoming refererar den inte längre', () => {
    expect(kod(SMS_INCOMING)).not.toContain('routeToAgentWithContext')
  })

  test('agent-router.ts (dess enda hem) är borttagen, inte bara otillgänglig', () => {
    // routeToAgentWithContext hade EN enda anropare (sms/incoming). Filen
    // förlorade sin sista anropare i samma ändring — döda filer ska tas
    // bort, inte lämnas overifierade.
    expect(fs.existsSync(path.join(ROOT, 'lib/matte/agent-router.ts'))).toBe(false)
  })
})

test.describe('5. run_agent vägras för inbound-event', () => {
  const s = read(AUTOMATION_ENGINE)

  test('den explicita listan nämner sms_received (och systrarna call_completed/phone_call)', () => {
    expect(s).toContain("INBOUND_SINGLE_BRAIN_EVENTS = new Set(['sms_received', 'call_completed', 'phone_call'])")
  })

  test('kontrollen sitter i run_agent-hanteringen och skippar exekveringen', () => {
    const i = s.indexOf("typedRule.action_type === 'run_agent'")
    expect(i, 'kontrollen hittas inte').toBeGreaterThan(-1)
    const block = s.slice(i, i + 900)
    expect(block, 'INBOUND_SINGLE_BRAIN_EVENTS läses inte i kontrollen').toContain('INBOUND_SINGLE_BRAIN_EVENTS.has(')
    expect(block, "refuserar inte med status 'skipped'").toContain("status: 'skipped'")
    // executeAction (den faktiska körningen) får ALDRIG nås om vägran slår
    // till — return-satsen måste ligga i samma block, INNAN steg 7.
    const retur = block.indexOf('return { status:')
    expect(retur, 'ingen return — vägran är bara en logg, inte en spärr').toBeGreaterThan(-1)
  })

  test('avslaget loggas på svenska till regelloggen (v3_automation_logs via logExecution)', () => {
    const i = s.indexOf("typedRule.action_type === 'run_agent'")
    const block = s.slice(i, i + 900)
    expect(block).toContain('logExecution(supabase')
    expect(block, 'skälet är inte på svenska').toMatch(/en-väg-in|inbound-kanalhändelse/)
  })
})

test.describe('6. skuggläget muterar inte', () => {
  const s = kod(ACTION_EXECUTOR)

  test('dryRun-vakten ligger före varje mutationssektion', () => {
    const guard = s.indexOf('options?.dryRun')
    expect(guard, 'dryRun-vakten hittas inte').toBeGreaterThan(-1)
    for (const write of [".from('booking')", ".from('invoice')", ".from('pending_approvals')"]) {
      const i = s.indexOf(write)
      expect(i, `${write} hittas inte i filen`).toBeGreaterThan(-1)
      expect(guard, `${write} ligger FÖRE dryRun-vakten — skuggläget skulle inte skydda den`).toBeLessThan(i)
    }
  })

  test('dryRun-grenen loggar och returnerar — når aldrig ÄTA-vägen eller actions-loopen', () => {
    const guardIdx = s.indexOf('if (options?.dryRun)')
    expect(guardIdx).toBeGreaterThan(-1)
    const guardBlock = s.slice(guardIdx, guardIdx + 200)
    expect(guardBlock).toContain('logMatteShadow(')
    expect(guardBlock).toContain('return')
  })

  test('skuggloggen märks matte_sms_shadow och bär de tilltänkta actionsen', () => {
    expect(s).toContain("rule_name: 'matte_sms_shadow'")
    expect(s).toContain('would_execute_actions:')
  })
})

test.describe('7. e-postvägen behåller full exekvering', () => {
  const s = read(GMAIL_PROCESSOR)

  test('executeMatteActions anropas UTAN dryRun — e-postkanalen exekverar fortfarande fullt ut', () => {
    const count = (s.match(/executeMatteActions\(/g) || []).length
    expect(count, 'gmail/processor ska anropa executeMatteActions exakt en gång').toBe(1)
    const i = s.indexOf('executeMatteActions(')
    const call = s.slice(i, s.indexOf('\n', i + 200) > -1 ? s.indexOf('\n', i + 200) : i + 250)
    expect(call, 'e-postvägen har fått dryRun:true — den ska köra fullt').not.toContain('dryRun')
  })
})
