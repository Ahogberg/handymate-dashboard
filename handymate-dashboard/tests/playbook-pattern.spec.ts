/**
 * Facit för Playbook Pattern Confirmation V1 (Debrief → Playbook,
 * V2-lagret, tasks/todo.md "Playbook Pattern Confirmation V1" 2026-08-16
 * natt).
 *
 * V1 (Project Debrief Capture, redan skarp sedan 2026-08-12/13) läser
 * enskilda project_lesson-rader rakt in i offertprompten. V2 lägger till
 * ett steg ovanpå: när flera lärdomar upprepar samma tema för samma
 * jobbtyp, föreslå det som en bekräftbar, företagsomfattande regel
 * (business_knowledge, knowledge_type='pattern') som sedan formar VARJE
 * framtida offert av jobbtypen.
 *
 * Låst här:
 *   - parsePatternDetectionSvar: ren funktion, "hellre missa än gissa"
 *     som KOD (minst två belägg krävs), inte bara prompttillit.
 *   - MIN_SAMPLE_SIZE = 5 och att detectPattern kastar aldrig.
 *   - detektionsprompten instruerar modellen explicit att den FÅR svara
 *     "inget mönster" (källkodsskanning av prompten, samma teknik som
 *     övriga facit i denna svit använder för AI-prompter).
 *   - fuel.ts: den nya ref_type:n har en explicit bucket-mappning.
 *   - propose-pattern.ts: MIN_SAMPLE_SIZE-gating + alla tre dedup-grenar,
 *     källkodsskannade (samma teknik som tests/project-debrief.spec.ts
 *     använder för create-debrief-card.ts — funktionerna gör I/O och är
 *     inte exporterade var för sig, så vi verifierar att KÄLLKODENS FORM
 *     garanterar beteendet).
 *   - action-contract.ts + routing.ts: registrering och owner_admin-
 *     bucketen (medveten avvikelse från project_debrief).
 *   - approvals-rutten: business_knowledge-inserten har rätt form.
 *   - fetchConfirmedPatterns (lib/ai-quote-generator.ts): job_type-läckan
 *     kan inte upprepas — mirror av samma regressionstest som
 *     tests/project-debrief.spec.ts har för fetchRecentLessons.
 *   - cron-rutten: auth, dedup-mönster (implicit via propose-pattern),
 *     och vercel.json-schemat (Hobby-plan-säkert, ingen kollision).
 *
 * Körs: npx playwright test tests/playbook-pattern.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  MIN_SAMPLE_SIZE,
  PLAYBOOK_PATTERN_DETECT_MODEL,
  parsePatternDetectionSvar,
  detectPattern,
  type LessonForDetection,
} from '../lib/playbook/detect-pattern'
import { bucketForRefType } from '../lib/costs/fuel'
import { classify, mayExecute, ACTION_CONTRACT } from '../lib/approvals/action-contract'
import { getRoutingBucket } from '../lib/approvals/routing'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const lesson = (over: Partial<LessonForDetection> = {}): LessonForDetection => ({
  id: 'lesson_1',
  lesson_text: 'Rivningen tog en dag längre än planerat',
  impact_hint: 'Vad tog längre tid än planerat?',
  created_at: '2026-08-01T09:00:00.000Z',
  ...over,
})

// ─────────────────────────────────────────────────────────────────
// parsePatternDetectionSvar — ren funktion
// ─────────────────────────────────────────────────────────────────

test.describe('parsePatternDetectionSvar — hellre missa än gissa som kod', () => {
  const lessons = [
    lesson({ id: 'l0' }),
    lesson({ id: 'l1' }),
    lesson({ id: 'l2' }),
    lesson({ id: 'l3' }),
    lesson({ id: 'l4' }),
  ]

  test('has_pattern: false → null, oavsett övriga fält', () => {
    expect(parsePatternDetectionSvar(
      JSON.stringify({ has_pattern: false, pattern_text: 'något', confidence: 0.9, evidence_indices: [0, 1] }),
      lessons,
    )).toBeNull()
  })

  test('skräp/trasig JSON → null, kastar aldrig', () => {
    expect(parsePatternDetectionSvar('', lessons)).toBeNull()
    expect(parsePatternDetectionSvar('inte json alls', lessons)).toBeNull()
    expect(parsePatternDetectionSvar('{"fel": "form"}', lessons)).toBeNull()
  })

  test('tomt pattern_text → null även om has_pattern är true', () => {
    expect(parsePatternDetectionSvar(
      JSON.stringify({ has_pattern: true, pattern_text: '  ', confidence: 0.9, evidence_indices: [0, 1] }),
      lessons,
    )).toBeNull()
  })

  test('färre än två giltiga belägg → null (ett citat är ingen upprepning)', () => {
    expect(parsePatternDetectionSvar(
      JSON.stringify({ has_pattern: true, pattern_text: 'Regel', confidence: 0.9, evidence_indices: [0] }),
      lessons,
    )).toBeNull()
    expect(parsePatternDetectionSvar(
      JSON.stringify({ has_pattern: true, pattern_text: 'Regel', confidence: 0.9, evidence_indices: [] }),
      lessons,
    )).toBeNull()
  })

  test('index utanför gränserna filtreras bort, dubbletter räknas en gång', () => {
    const result = parsePatternDetectionSvar(
      JSON.stringify({ has_pattern: true, pattern_text: 'Regel', confidence: 0.9, evidence_indices: [0, 0, 1, 99, -1] }),
      lessons,
    )
    expect(result).not.toBeNull()
    expect(result!.evidence_lesson_ids).toEqual(['l0', 'l1'])
  })

  test('giltigt svar mappar index → verkliga lesson-id:n', () => {
    const result = parsePatternDetectionSvar(
      JSON.stringify({
        has_pattern: true,
        pattern_text: 'Räkna alltid med en extra dag för rivning på badrumsrenoveringar',
        confidence: 0.85,
        evidence_indices: [1, 3],
      }),
      lessons,
    )
    expect(result).toEqual({
      pattern_text: 'Räkna alltid med en extra dag för rivning på badrumsrenoveringar',
      confidence: 0.85,
      evidence_lesson_ids: ['l1', 'l3'],
    })
  })

  test('confidence klampas till [0,1] och saknad confidence defaultar till 0.5', () => {
    const over = parsePatternDetectionSvar(
      JSON.stringify({ has_pattern: true, pattern_text: 'Regel', confidence: 5, evidence_indices: [0, 1] }),
      lessons,
    )
    expect(over!.confidence).toBe(1)

    const missing = parsePatternDetectionSvar(
      JSON.stringify({ has_pattern: true, pattern_text: 'Regel', evidence_indices: [0, 1] }),
      lessons,
    )
    expect(missing!.confidence).toBe(0.5)
  })

  test('text runt JSON tolereras (modellen svamlar ibland trots instruktionen)', () => {
    const result = parsePatternDetectionSvar(
      'Här är mitt svar: ' + JSON.stringify({
        has_pattern: true, pattern_text: 'Regel', confidence: 0.7, evidence_indices: [0, 2],
      }),
      lessons,
    )
    expect(result).not.toBeNull()
    expect(result!.pattern_text).toBe('Regel')
  })
})

// ─────────────────────────────────────────────────────────────────
// MIN_SAMPLE_SIZE + detectPattern kastar aldrig
// ─────────────────────────────────────────────────────────────────

test.describe('MIN_SAMPLE_SIZE — ribban för att ens fråga modellen', () => {
  test('är 5 — högre än aggregateOutcomesByJobTypes 3 (företagsomfattande regel, inte en offerts varningsbanner)', () => {
    expect(MIN_SAMPLE_SIZE).toBe(5)
  })

  test('detectPattern returnerar null direkt vid för få lärdomar, ingen AI/DB krävs', async () => {
    const fewLessons = [lesson({ id: 'a' }), lesson({ id: 'b' }), lesson({ id: 'c' })]
    const result = await detectPattern({
      businessId: 'biz_test',
      jobType: 'badrum',
      lessons: fewLessons,
      supabase: {} as any,
    })
    expect(result).toBeNull()
  })

  test('modellen är Haiku (getClaudeModel extraction) — strukturerad klassificering, inte kundvänd konversation', () => {
    expect(PLAYBOOK_PATTERN_DETECT_MODEL).toContain('haiku')
  })
})

test.describe('detektionsprompten — "hellre missa än gissa" som uttrycklig instruktion', () => {
  const kalla = read('lib/playbook/detect-pattern.ts')

  test('prompten innehåller frasen ordagrant', () => {
    expect(kalla).toContain('HELLRE MISSA ÄN GISSA')
  })

  test('prompten instruerar modellen att den FÅR/FÖRVÄNTAS svara att inget mönster finns', () => {
    expect(kalla).toMatch(/FÅR och FÖRVÄNTAS svara|förväntas svara/i)
    expect(kalla).toContain('has_pattern: false')
  })

  test('prompten varnar explicit för att en felaktig regel påverkar ALLA framtida offerter av jobbtypen', () => {
    expect(kalla).toMatch(/VARJE framtida offert|ALLA framtida offerter/)
  })
})

// ─────────────────────────────────────────────────────────────────
// Bränsle — ny ref_type har explicit bucket
// ─────────────────────────────────────────────────────────────────

test.describe('Bränsle-mätaren — playbook_pattern_detect har en bucket', () => {
  test('mappar till night_work (bakgrundsarbete, cron-triggat, ingen kund ser det hända i stunden)', () => {
    const origWarn = console.warn
    let varnade = false
    console.warn = () => { varnade = true }
    try {
      expect(bucketForRefType('playbook_pattern_detect')).toBe('night_work')
    } finally {
      console.warn = origWarn
    }
    expect(varnade, 'ref_type ska ha en EXPLICIT mappning, inte falla till fallback tyst').toBe(false)
  })

  test('detect-pattern.ts anropar meterDirectLlmCall med exakt denna ref_type', () => {
    const kalla = read('lib/playbook/detect-pattern.ts')
    expect(kalla).toContain("refType: 'playbook_pattern_detect'")
    expect(kalla).toContain('meterDirectLlmCall')
  })

  test('fuel.ts REF_TYPE_BUCKET innehåller mappningen källkodsmässigt', () => {
    const kalla = read('lib/costs/fuel.ts')
    expect(kalla).toContain('playbook_pattern_detect')
  })
})

// ─────────────────────────────────────────────────────────────────
// propose-pattern.ts — källkodsskanning (I/O, samma teknik som
// create-debrief-card.ts-testerna i tests/project-debrief.spec.ts)
// ─────────────────────────────────────────────────────────────────

test.describe('propose-pattern.ts — MIN_SAMPLE_SIZE-gating sker FÖRE dedup/detektion', () => {
  const kalla = read('lib/playbook/propose-pattern.ts')

  test('funktionen är exporterad och kastar aldrig (hela kroppen i try/catch)', () => {
    expect(kalla).toContain('export async function proposePattern')
    expect(kalla).toContain('try {')
    expect(kalla).toContain('catch (err)')
  })

  test('lärdomarna hämtas och storleken kontrolleras innan någon dedup-kontroll eller detektion körs', () => {
    const funkStart = kalla.indexOf('export async function proposePattern')
    const funkSlice = kalla.slice(funkStart)
    const fetchIdx = funkSlice.indexOf('fetchLessonsForJobType')
    const sizeGuardIdx = funkSlice.indexOf('MIN_SAMPLE_SIZE')
    const dedupIdx = funkSlice.indexOf('hasPendingCard')
    const detectIdx = funkSlice.indexOf('detectPattern(')
    expect(fetchIdx).toBeGreaterThan(-1)
    expect(sizeGuardIdx).toBeGreaterThan(-1)
    expect(dedupIdx).toBeGreaterThan(-1)
    expect(detectIdx).toBeGreaterThan(-1)
    expect(fetchIdx).toBeLessThan(sizeGuardIdx)
    expect(sizeGuardIdx).toBeLessThan(dedupIdx)
    expect(dedupIdx).toBeLessThan(detectIdx)
  })
})

test.describe('propose-pattern.ts — dedup-gren a) väntande kort för samma jobbtyp', () => {
  const kalla = read('lib/playbook/propose-pattern.ts')

  test('kollar approval_type + status=pending + payload.job_type', () => {
    const funkStart = kalla.indexOf('async function hasPendingCard')
    expect(funkStart).toBeGreaterThan(-1)
    const funkSlice = kalla.slice(funkStart, funkStart + 800)
    expect(funkSlice).toContain(".eq('approval_type', 'playbook_pattern_confirmation')")
    expect(funkSlice).toContain(".eq('status', 'pending')")
    expect(funkSlice).toContain(".contains('payload', { job_type: jobType })")
  })
})

test.describe('propose-pattern.ts — dedup-gren b) redan aktivt bekräftat mönster', () => {
  const kalla = read('lib/playbook/propose-pattern.ts')

  test('kollar business_knowledge, knowledge_type=pattern, samma job_type, status=active', () => {
    const funkStart = kalla.indexOf('async function hasActiveConfirmedPattern')
    expect(funkStart).toBeGreaterThan(-1)
    const funkSlice = kalla.slice(funkStart, funkStart + 800)
    expect(funkSlice).toContain(".from('business_knowledge')")
    expect(funkSlice).toContain(".eq('knowledge_type', 'pattern')")
    expect(funkSlice).toContain(".eq('job_type', jobType)")
    expect(funkSlice).toContain(".eq('status', 'active')")
  })
})

test.describe('propose-pattern.ts — dedup-gren c) avvisat inom 30 dagars karens', () => {
  const kalla = read('lib/playbook/propose-pattern.ts')

  test('kollar status=rejected + payload.job_type + resolved_at inom karensfönstret', () => {
    const funkStart = kalla.indexOf('async function wasRecentlyRejected')
    expect(funkStart).toBeGreaterThan(-1)
    const funkSlice = kalla.slice(funkStart, funkStart + 800)
    expect(funkSlice).toContain(".eq('approval_type', 'playbook_pattern_confirmation')")
    expect(funkSlice).toContain(".eq('status', 'rejected')")
    expect(funkSlice).toContain(".contains('payload', { job_type: jobType })")
    expect(funkSlice).toContain(".gte('resolved_at'")
  })

  test('karensen är 30 dagar (dokumenterad, inte en gissning)', () => {
    expect(kalla).toContain('REJECTION_COOLDOWN_DAYS = 30')
  })
})

test.describe('propose-pattern.ts — kortet som skapas', () => {
  const kalla = read('lib/playbook/propose-pattern.ts')

  test('rätt approval_type, owner_admin-routing, och Daniel som agent', () => {
    const insertIdx = kalla.indexOf(".from('pending_approvals').insert(")
    expect(insertIdx).toBeGreaterThan(-1)
    const gren = kalla.slice(insertIdx, insertIdx + 1200)
    expect(gren).toContain("approval_type: 'playbook_pattern_confirmation'")
    expect(gren).toContain("routing_role: 'owner_admin'")
    expect(gren).toContain("agent_id: 'daniel'")
  })

  test('payloaden bär job_type, pattern_text, confidence, evidence_lesson_ids, sample_count', () => {
    const insertIdx = kalla.indexOf(".from('pending_approvals').insert(")
    const gren = kalla.slice(insertIdx, insertIdx + 1200)
    expect(gren).toContain('job_type: jobType')
    expect(gren).toContain('pattern_text: detected.pattern_text')
    expect(gren).toContain('confidence: detected.confidence')
    expect(gren).toContain('evidence_lesson_ids: detected.evidence_lesson_ids')
    expect(gren).toContain('sample_count:')
  })
})

// ─────────────────────────────────────────────────────────────────
// _decision — Decision Twin Lars-slice (2026-08-17): mönsterdetektionen
// är en riktig AI-inferens (Haiku) som tidigare inte stämplade provenience.
// ─────────────────────────────────────────────────────────────────

test.describe('propose-pattern.ts — kortets payload stämplas med _decision', () => {
  const kalla = read('lib/playbook/propose-pattern.ts')

  test('payloaden hängs på via withDecisionRecord(..., detected.decision) — inte ett löst objekt', () => {
    const insertIdx = kalla.indexOf(".from('pending_approvals').insert(")
    expect(insertIdx).toBeGreaterThan(-1)
    const gren = kalla.slice(insertIdx, insertIdx + 1200)
    expect(gren).toContain('withDecisionRecord(')
    expect(gren).toContain('detected.decision')
  })

  test('withDecisionRecord importeras från den facit-låsta beslutsposten', () => {
    expect(kalla).toContain("from '@/lib/ai/decision-record'")
  })
})

// ─────────────────────────────────────────────────────────────────
// action-contract + routing
// ─────────────────────────────────────────────────────────────────

test.describe('action-contract — playbook_pattern_confirmation', () => {
  test('registrerad som EXECUTABLE_ACTION (skriver fältlokalt, ingen extern sidoeffekt)', () => {
    expect(classify('playbook_pattern_confirmation')).toBe('EXECUTABLE_ACTION')
    expect(mayExecute('playbook_pattern_confirmation')).toBe(true)
    expect(ACTION_CONTRACT.playbook_pattern_confirmation).toBe('EXECUTABLE_ACTION')
  })
})

test.describe('routing — playbook_pattern_confirmation är owner_admin (medveten avvikelse från project_debrief)', () => {
  test('bucket är owner_admin, inte any', () => {
    expect(getRoutingBucket('playbook_pattern_confirmation')).toBe('owner_admin')
  })

  test('project_debrief förblir any — avvikelsen är medveten, inte en glidning', () => {
    expect(getRoutingBucket('project_debrief')).toBe('any')
  })
})

// ─────────────────────────────────────────────────────────────────
// Approvals-rutten — business_knowledge-inserten
// ─────────────────────────────────────────────────────────────────

test.describe('approvals-rutten — case playbook_pattern_confirmation', () => {
  const kalla = read('app/api/approvals/[id]/route.ts')

  test('har en egen hanterare', () => {
    expect(kalla).toContain("case 'playbook_pattern_confirmation':")
  })

  test('skriver EN rad i business_knowledge med rätt fält', () => {
    const i = kalla.indexOf("case 'playbook_pattern_confirmation':")
    const gren = kalla.slice(i, i + 2000)
    expect(gren).toContain(".from('business_knowledge')")
    expect(gren).toContain(".insert(")
    expect(gren).toContain("knowledge_type: 'pattern'")
    expect(gren).toContain('job_type: pl.job_type')
    expect(gren).toContain('observation: pl.pattern_text')
    expect(gren).toContain("agent_id: 'daniel'")
    expect(gren).toContain("status: 'active'")
    expect(gren).toContain('related_approval_id:')
  })

  test('saknad jobbtyp eller mönstertext failar stängt med svenskt fel', () => {
    const i = kalla.indexOf("case 'playbook_pattern_confirmation':")
    const gren = kalla.slice(i, i + 800)
    expect(gren).toContain('!pl.job_type || !pl.pattern_text')
  })
})

// ─────────────────────────────────────────────────────────────────
// fetchConfirmedPatterns — job_type-läckan kan inte upprepas
// (mirror av samma regressionstest som project-debrief.spec.ts har
// för fetchRecentLessons)
// ─────────────────────────────────────────────────────────────────

test.describe('fetchConfirmedPatterns — sanningsprincipen (samma som fetchRecentLessons)', () => {
  const kalla = read('lib/ai-quote-generator.ts')

  test('funktionen returnerar tom lista OMEDELBART utan jobType, före queryn byggs', () => {
    const funkStart = kalla.indexOf('async function fetchConfirmedPatterns')
    expect(funkStart).toBeGreaterThan(-1)
    const tidigtGuard = kalla.indexOf('if (!jobType) return []', funkStart)
    const queryStart = kalla.indexOf(".from('business_knowledge')", funkStart)
    expect(tidigtGuard).toBeGreaterThan(-1)
    expect(queryStart).toBeGreaterThan(-1)
    expect(tidigtGuard).toBeLessThan(queryStart)
  })

  test('queryn filtrerar på knowledge_type=pattern, job_type och status=active', () => {
    const funkStart = kalla.indexOf('async function fetchConfirmedPatterns')
    const funkSlice = kalla.slice(funkStart, funkStart + 1200)
    expect(funkSlice).toContain(".eq('knowledge_type', 'pattern')")
    expect(funkSlice).toContain(".eq('job_type', jobType)")
    expect(funkSlice).toContain(".eq('status', 'active')")
  })

  test('inkluderas i Promise.all-hämtningen och en egen promptsektion, skild från LÄRDOMAR/AFFÄRSREGLER', () => {
    expect(kalla).toContain('fetchConfirmedPatterns(')
    expect(kalla).toContain('SÅ HÄR JOBBAR VI')
    // Måste vara en EGEN sektion — inte samma rubrik som de befintliga.
    expect(kalla).toContain('LÄRDOMAR FRÅN TIDIGARE LIKNANDE JOBB')
    expect(kalla).toContain('ÄGARENS AFFÄRSREGLER')
  })
})

// ─────────────────────────────────────────────────────────────────
// Cron-rutten — auth + vercel.json
// ─────────────────────────────────────────────────────────────────

const CRON_ROUTE = 'app/api/cron/playbook-pattern/route.ts'

test.describe('cron/playbook-pattern — auth', () => {
  test('kräver CRON_SECRET via den delade helpern, i BÅDE GET och POST', () => {
    const s = read(CRON_ROUTE)
    expect(s).toContain("from '@/lib/cron/verify-secret'")
    const getStart = s.indexOf('export async function GET')
    const postStart = s.indexOf('export async function POST')
    expect(getStart).toBeGreaterThan(-1)
    expect(postStart).toBeGreaterThan(-1)
    expect(s.slice(getStart, postStart)).toContain('verifyCronSecret(request)')
    expect(s.slice(postStart)).toContain('verifyCronSecret(request)')
  })

  test('pausade agenter hoppas över', () => {
    const s = read(CRON_ROUTE)
    expect(s).toContain('agents_globally_paused')
  })

  test('anropar proposePattern per jobbtyp, ett företags fel fäller inte svepet för andra', () => {
    const s = read(CRON_ROUTE)
    expect(s).toContain('proposePattern(')
    expect(s).toContain('catch (err')
  })
})

test.describe('cron/playbook-pattern — vercel.json', () => {
  test('finns exakt en cron-rad för rutten', () => {
    const cfg = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
    const rader = cfg.crons.filter(c => c.path === '/api/cron/playbook-pattern')
    expect(rader).toHaveLength(1)
  })

  test('schemat är veckovis (M H * * D) — lärdomar ackumuleras långsamt, ingen daglig cron behövs', () => {
    const cfg = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
    const rad = cfg.crons.find(c => c.path === '/api/cron/playbook-pattern')
    expect(rad, 'cron-raden saknas i vercel.json').toBeTruthy()
    // "M H * * D" — exakt en veckodag (0-6), aldrig ett sub-dagligt uttryck
    // eller en daglig */N-rad (Hobby-plan-disciplinen, CLAUDE.md).
    expect(rad!.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* [0-6]$/)
  })

  test('kolliderar inte med någon befintlig schemarad', () => {
    const cfg = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
    const scheman = cfg.crons.map(c => c.schedule)
    const varSchema = cfg.crons.find(c => c.path === '/api/cron/playbook-pattern')!.schedule
    const kollisioner = scheman.filter(s => s === varSchema)
    expect(kollisioner, `schemat ${varSchema} krockar med en annan rutt`).toHaveLength(1)
  })
})
