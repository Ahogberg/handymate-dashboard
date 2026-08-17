/**
 * Facit för Playbook Kickoff Copilot V1 (tasks/todo.md
 * "Playbook Kickoff Copilot V1 — 2026-08-17 (04:00)").
 *
 * Bygger vidare på Playbook Pattern Confirmation V1 (business_knowledge,
 * knowledge_type='pattern', job_type — sql/v141, EJ körd i prod ännu).
 * När ett NYLIGEN skapat, icke avslutat projekt har ett job_type som
 * matchar ett aktivt bekräftat mönster, föreslås en kontrollpunkt
 * (project_checklist-rad) via ett godkännandekort — aldrig en tyst
 * skrivning, aldrig ett nytt agent-vakningshook.
 *
 * Fyra korrigeringar mot ursprungsförslaget (se tasks/todo.md) styr vad
 * som INTE byggs: inget buffert-/extra-dag-fält, ingen modellering på
 * closeout-copilot.ts (som aldrig skapar ett kort), ingen krok i
 * projekt-SKAPANDET (periodisk cron istället), och ingen koppling till
 * v138_outcome_quality_gate.
 *
 * Låst här:
 *   - findKickoffCandidates: N-dagarsfönster, status != completed,
 *     job_type-matchning mot AKTIVA bekräftade mönster, fail-safe vid
 *     schema-fel (källkodsskanning, samma teknik som playbook-pattern.spec.ts).
 *   - Livstids-dedup (alla statusar) mot pending_approvals.
 *   - Evidens-uppslag: evidence_lesson_ids → project_lesson.project_id →
 *     project.name, deduplicerat, med graceful degrade när ett källprojekt
 *     inte längre går att slå upp.
 *   - propose-kickoff.ts: kortcopy (inkl. hedging vid låg confidence) +
 *     insert-formen (approval_type/routing_role/payload).
 *   - action-contract.ts + routing.ts: registrering.
 *   - approvals-rutten: project_checklist-inserten, samma tabellform som
 *     checklist_forslag.
 *   - cron-rutten: auth, dedup via lib-funktionerna, och vercel.json-
 *     schemat (Hobby-plan-säkert, ingen kollision, annan dag än tisdag).
 *
 * Körs: npx playwright test tests/playbook-kickoff.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  findKickoffCandidates,
  KICKOFF_WINDOW_DAYS,
  type KickoffCandidate,
} from '../lib/playbook/kickoff-candidates'
import {
  buildKickoffCardCopy,
  proposeKickoff,
} from '../lib/playbook/propose-kickoff'
import { classify, mayExecute, ACTION_CONTRACT } from '../lib/approvals/action-contract'
import { getRoutingBucket } from '../lib/approvals/routing'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// ─────────────────────────────────────────────────────────────────
// Fake Supabase — kö av svar per .from()-anrop, i den ORDNING koden
// faktiskt frågar (samma mönster som tests/project-completion-
// transition.spec.ts, men thenable så .eq()/.limit()/.order() m.fl.
// kedjor fungerar utan en explicit terminal-metod).
// ─────────────────────────────────────────────────────────────────
type FakeResponse = { data: unknown; error: { message: string; code?: string } | null }

function fakeChain(response: FakeResponse) {
  const promise = Promise.resolve(response) as any
  const methods = ['select', 'eq', 'neq', 'not', 'gte', 'order', 'limit', 'in', 'contains', 'is', 'insert']
  for (const m of methods) promise[m] = () => promise
  return promise
}

function fakeSupabase(responses: FakeResponse[]) {
  let calls = 0
  const tables: string[] = []
  const supabase = {
    from(table: string) {
      tables.push(table)
      const response = responses[calls] ?? { data: [], error: null }
      calls++
      return fakeChain(response)
    },
  }
  return { supabase, tables, callCount: () => calls }
}

const ok = (data: unknown): FakeResponse => ({ data, error: null })

// ─────────────────────────────────────────────────────────────────
// findKickoffCandidates — N-dagarsfönster + status
// ─────────────────────────────────────────────────────────────────

test.describe('kickoff-candidates.ts — N-dagarsfönstret', () => {
  test('KICKOFF_WINDOW_DAYS är 14 — veckovis(-ish) svep ska inte missa projekt skapade mellan körningar', () => {
    expect(KICKOFF_WINDOW_DAYS).toBe(14)
  })

  test('projektfrågan filtrerar på status != completed, job_type not null och created_at inom fönstret', async () => {
    const { supabase } = fakeSupabase([ok([])])
    await findKickoffCandidates(supabase as any, 'biz_test')
    // Källkodsverifiering av frågeformen (samma teknik som propose-pattern.spec.ts
    // dedup-grenarna) — säkerställer rätt kolumner/villkor används.
    const kalla = read('lib/playbook/kickoff-candidates.ts')
    const funkStart = kalla.indexOf('export async function findKickoffCandidates')
    const funkSlice = kalla.slice(funkStart, funkStart + 1200)
    expect(funkSlice).toContain(".from('project')")
    expect(funkSlice).toContain(".neq('status', 'completed')")
    expect(funkSlice).toContain(".not('job_type', 'is', null)")
    expect(funkSlice).toContain(".gte('created_at'")
  })

  test('inga projekt → tom kandidatlista, inga fler anrop', async () => {
    const { supabase, callCount } = fakeSupabase([ok([])])
    const result = await findKickoffCandidates(supabase as any, 'biz_test')
    expect(result).toEqual([])
    expect(callCount()).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────
// findKickoffCandidates — schema-fel (v141 ej körd) → fail-safe tom lista
// ─────────────────────────────────────────────────────────────────

test.describe('kickoff-candidates.ts — fail-safe vid schemafel', () => {
  test('42P01/42703 på projektfrågan degraderar tyst till tom lista (kastar aldrig)', async () => {
    const { supabase } = fakeSupabase([
      { data: null, error: { message: 'relation does not exist', code: '42P01' } },
    ])
    const result = await findKickoffCandidates(supabase as any, 'biz_test')
    expect(result).toEqual([])
  })

  test('funktionen har try/catch runt hela kroppen och använder arSchemaSaknas', () => {
    const kalla = read('lib/playbook/kickoff-candidates.ts')
    expect(kalla).toContain('arSchemaSaknas')
    expect(kalla).toContain('try {')
    expect(kalla).toContain('catch (err')
  })
})

// ─────────────────────────────────────────────────────────────────
// findKickoffCandidates — job_type-matchning mot aktiva mönster
// ─────────────────────────────────────────────────────────────────

test.describe('kickoff-candidates.ts — job_type-matchning', () => {
  test('projekt utan matchande aktivt mönster ger ingen kandidat', async () => {
    const { supabase } = fakeSupabase([
      ok([{ project_id: 'proj_1', job_type: 'badrum', status: 'active', created_at: '2026-08-15T00:00:00.000Z' }]),
      ok([]), // dedup-läsning: inget befintligt kort
      ok([]), // business_knowledge: inget aktivt mönster för job_type
    ])
    const result = await findKickoffCandidates(supabase as any, 'biz_test')
    expect(result).toEqual([])
  })

  test('mönsterfrågan filtrerar knowledge_type=pattern, job_type och status=active', () => {
    const kalla = read('lib/playbook/kickoff-candidates.ts')
    expect(kalla).toContain(".from('business_knowledge')")
    expect(kalla).toContain(".eq('knowledge_type', 'pattern')")
    expect(kalla).toContain(".eq('job_type', jobType)")
    expect(kalla).toContain(".eq('status', 'active')")
  })

  test('matchande projekt + mönster ger en kandidat med pattern_text/confidence/pattern_id', async () => {
    const { supabase } = fakeSupabase([
      ok([{ project_id: 'proj_1', job_type: 'badrum', status: 'active', created_at: '2026-08-15T00:00:00.000Z' }]),
      ok([]), // ingen dedup-träff
      ok([{
        id: 'bk_1',
        observation: 'Räkna med en extra dag för rivning',
        confidence: 0.85,
        data_basis: { evidence_lesson_ids: [], sample_count: 5 },
      }]),
    ])
    const result = await findKickoffCandidates(supabase as any, 'biz_test')
    expect(result).toEqual([{
      project_id: 'proj_1',
      job_type: 'badrum',
      pattern_text: 'Räkna med en extra dag för rivning',
      confidence: 0.85,
      source_project_names: [],
      pattern_id: 'bk_1',
    }])
  })
})

// ─────────────────────────────────────────────────────────────────
// Livstids-dedup — alla statusar, inte bara pending
// ─────────────────────────────────────────────────────────────────

test.describe('kickoff-candidates.ts — livstids-dedup (samma princip som create-debrief-card.ts)', () => {
  test('dedup-läsningen har INGET statusfilter — en avvisad rad räknas fortfarande som "redan föreslaget"', () => {
    const kalla = read('lib/playbook/kickoff-candidates.ts')
    const funkStart = kalla.indexOf('async function hasExistingKickoffCard')
    expect(funkStart).toBeGreaterThan(-1)
    const funkSlice = kalla.slice(funkStart, funkStart + 700)
    expect(funkSlice).toContain(".eq('approval_type', 'playbook_kickoff_suggestion')")
    expect(funkSlice).toContain(".contains('payload', { project_id: projectId })")
    // INGET .eq('status', ...) i den här funktionen.
    expect(funkSlice).not.toContain(".eq('status'")
  })

  test('befintligt kort (oavsett status) hoppar över projektet — inget mönster-uppslag görs', async () => {
    const { supabase, callCount } = fakeSupabase([
      ok([{ project_id: 'proj_1', job_type: 'badrum', status: 'active', created_at: '2026-08-15T00:00:00.000Z' }]),
      ok([{ id: 'appr_existing' }]), // redan ett kort — oavsett status
    ])
    const result = await findKickoffCandidates(supabase as any, 'biz_test')
    expect(result).toEqual([])
    // Två anrop: projektfrågan + dedup-frågan. Inget business_knowledge-anrop.
    expect(callCount()).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────────
// Evidens-uppslag — evidence_lesson_ids → project_lesson → project.name
// ─────────────────────────────────────────────────────────────────

test.describe('kickoff-candidates.ts — evidens-uppslag av källprojekt', () => {
  test('lärdomar från flera projekt ger deduplicerade källprojekt-namn', async () => {
    const { supabase } = fakeSupabase([
      ok([{ project_id: 'proj_1', job_type: 'badrum', status: 'active', created_at: '2026-08-15T00:00:00.000Z' }]),
      ok([]), // ingen dedup-träff
      ok([{
        id: 'bk_1',
        observation: 'Räkna med en extra dag för rivning',
        confidence: 0.9,
        data_basis: { evidence_lesson_ids: ['lesson_a', 'lesson_b', 'lesson_c'] },
      }]),
      ok([
        { project_id: 'proj_old_1' },
        { project_id: 'proj_old_1' }, // samma källprojekt två lärdomar — ska deduperas
        { project_id: 'proj_old_2' },
      ]),
      ok([
        { project_id: 'proj_old_1', name: 'Badrum Andersson' },
        { project_id: 'proj_old_2', name: 'Badrum Svensson' },
      ]),
    ])
    const result = await findKickoffCandidates(supabase as any, 'biz_test')
    expect(result).toHaveLength(1)
    expect(result[0].source_project_names).toEqual(['Badrum Andersson', 'Badrum Svensson'])
  })

  test('graceful degrade: ett källprojekt som inte längre går att slå upp utelämnas, kandidaten faller inte bort', async () => {
    const { supabase } = fakeSupabase([
      ok([{ project_id: 'proj_1', job_type: 'badrum', status: 'active', created_at: '2026-08-15T00:00:00.000Z' }]),
      ok([]),
      ok([{
        id: 'bk_1',
        observation: 'Räkna med en extra dag för rivning',
        confidence: 0.9,
        data_basis: { evidence_lesson_ids: ['lesson_a', 'lesson_deleted'] },
      }]),
      ok([
        { project_id: 'proj_old_1' },
        { project_id: 'proj_deleted' },
      ]),
      // proj_deleted finns inte längre — bara proj_old_1 kommer tillbaka.
      ok([{ project_id: 'proj_old_1', name: 'Badrum Andersson' }]),
    ])
    const result = await findKickoffCandidates(supabase as any, 'biz_test')
    expect(result).toHaveLength(1)
    expect(result[0].source_project_names).toEqual(['Badrum Andersson'])
  })

  test('fel vid evidens-uppslaget degraderar till tom evidenslista, kandidaten faller inte bort och funktionen kastar aldrig', async () => {
    const { supabase } = fakeSupabase([
      ok([{ project_id: 'proj_1', job_type: 'badrum', status: 'active', created_at: '2026-08-15T00:00:00.000Z' }]),
      ok([]),
      ok([{
        id: 'bk_1',
        observation: 'Räkna med en extra dag för rivning',
        confidence: 0.9,
        data_basis: { evidence_lesson_ids: ['lesson_a'] },
      }]),
      { data: null, error: { message: 'boom' } }, // project_lesson-frågan failar
    ])
    const result = await findKickoffCandidates(supabase as any, 'biz_test')
    expect(result).toHaveLength(1)
    expect(result[0].source_project_names).toEqual([])
  })

  test('tomt evidence_lesson_ids gör inget uppslag alls (ingen extra query)', async () => {
    const { supabase, callCount } = fakeSupabase([
      ok([{ project_id: 'proj_1', job_type: 'badrum', status: 'active', created_at: '2026-08-15T00:00:00.000Z' }]),
      ok([]),
      ok([{ id: 'bk_1', observation: 'Regel', confidence: 0.9, data_basis: { evidence_lesson_ids: [] } }]),
    ])
    const result = await findKickoffCandidates(supabase as any, 'biz_test')
    expect(result[0].source_project_names).toEqual([])
    expect(callCount()).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────
// propose-kickoff.ts — kortcopy (inkl. hedging)
// ─────────────────────────────────────────────────────────────────

test.describe('propose-kickoff.ts — buildKickoffCardCopy', () => {
  test('citerar mönstertexten och namngivna källprojekt', () => {
    const { title, description } = buildKickoffCardCopy(
      'badrum', 'Räkna med en extra dag för rivning', ['Badrum Andersson', 'Badrum Svensson'], 0.9,
    )
    expect(title).toContain('badrum')
    expect(description).toContain('Räkna med en extra dag för rivning')
    expect(description).toContain('Badrum Andersson')
    expect(description).toContain('Badrum Svensson')
  })

  test('utan källprojekt-namn faller texten tillbaka på en neutral formulering, hittar inte på ett projektnamn', () => {
    const { description } = buildKickoffCardCopy('badrum', 'Regel', [], 0.9)
    expect(description).not.toContain('undefined')
    expect(description.length).toBeGreaterThan(0)
  })

  test('låg confidence ger hedging-text, hög confidence gör det inte', () => {
    const low = buildKickoffCardCopy('badrum', 'Regel', ['Projekt A'], 0.3)
    const high = buildKickoffCardCopy('badrum', 'Regel', ['Projekt A'], 0.9)
    expect(low.description).not.toBe(high.description)
    expect(low.description.length).toBeGreaterThan(high.description.length)
  })

  test('confidence=null (okänt) hedgear inte — visar inte en påhittad osäkerhet', () => {
    const unknown = buildKickoffCardCopy('badrum', 'Regel', ['Projekt A'], null)
    const high = buildKickoffCardCopy('badrum', 'Regel', ['Projekt A'], 0.9)
    expect(unknown.description).toBe(high.description)
  })

  test('numret på confidence visas ALDRIG rått i copyn — samma konvention som Settings-ytan (25449012)', () => {
    const { description, title } = buildKickoffCardCopy('badrum', 'Regel', ['Projekt A'], 0.73)
    expect(description).not.toContain('0.73')
    expect(title).not.toContain('0.73')
  })
})

// ─────────────────────────────────────────────────────────────────
// propose-kickoff.ts — kortet som skapas
// ─────────────────────────────────────────────────────────────────

test.describe('propose-kickoff.ts — proposeKickoff skriver kortet', () => {
  const candidate: KickoffCandidate = {
    project_id: 'proj_1',
    job_type: 'badrum',
    pattern_text: 'Räkna med en extra dag för rivning',
    confidence: 0.9,
    source_project_names: ['Badrum Andersson'],
    pattern_id: 'bk_1',
  }

  test('lyckad insert ger created', async () => {
    const { supabase } = fakeSupabase([ok(null)])
    const result = await proposeKickoff(supabase as any, 'biz_test', candidate)
    expect(result).toBe('created')
  })

  test('insert-fel ger skipped_error, kastar aldrig', async () => {
    const { supabase } = fakeSupabase([{ data: null, error: { message: 'boom' } }])
    const result = await proposeKickoff(supabase as any, 'biz_test', candidate)
    expect(result).toBe('skipped_error')
  })

  test('rätt approval_type, project_team-routing och payload', () => {
    const kalla = read('lib/playbook/propose-kickoff.ts')
    const insertIdx = kalla.indexOf(".from('pending_approvals').insert(")
    expect(insertIdx).toBeGreaterThan(-1)
    const gren = kalla.slice(insertIdx, insertIdx + 1200)
    expect(gren).toContain("approval_type: 'playbook_kickoff_suggestion'")
    expect(gren).toContain("routing_role: 'project_team'")
    expect(gren).toContain("agent_id: 'lars'")
    expect(gren).toContain('project_id: candidate.project_id')
    expect(gren).toContain('job_type: candidate.job_type')
    expect(gren).toContain('pattern_id: candidate.pattern_id')
    expect(gren).toContain('pattern_text: candidate.pattern_text')
    expect(gren).toContain('source_project_names: candidate.source_project_names')
    expect(gren).toContain('confidence: candidate.confidence')
  })

  test('funktionen kastar aldrig (try/catch runt hela kroppen)', () => {
    const kalla = read('lib/playbook/propose-kickoff.ts')
    expect(kalla).toContain('export async function proposeKickoff')
    expect(kalla).toContain('try {')
    expect(kalla).toContain('catch (err')
  })
})

// ─────────────────────────────────────────────────────────────────
// action-contract + routing
// ─────────────────────────────────────────────────────────────────

test.describe('action-contract — playbook_kickoff_suggestion', () => {
  test('registrerad som EXECUTABLE_ACTION (godkännande gör en riktig skrivning)', () => {
    expect(classify('playbook_kickoff_suggestion')).toBe('EXECUTABLE_ACTION')
    expect(mayExecute('playbook_kickoff_suggestion')).toBe(true)
    expect(ACTION_CONTRACT.playbook_kickoff_suggestion).toBe('EXECUTABLE_ACTION')
  })
})

test.describe('routing — playbook_kickoff_suggestion är project_team (samma bucket som checklist_forslag)', () => {
  test('bucket är project_team, inte owner_admin', () => {
    expect(getRoutingBucket('playbook_kickoff_suggestion')).toBe('project_team')
  })

  test('checklist_forslag förblir project_team — jämförelsepunkten är oförändrad', () => {
    expect(getRoutingBucket('checklist_forslag')).toBe('project_team')
  })
})

// ─────────────────────────────────────────────────────────────────
// Approvals-rutten — project_checklist-inserten
// ─────────────────────────────────────────────────────────────────

test.describe('approvals-rutten — case playbook_kickoff_suggestion', () => {
  const kalla = read('app/api/approvals/[id]/route.ts')

  test('har en egen hanterare', () => {
    expect(kalla).toContain("case 'playbook_kickoff_suggestion':")
  })

  test('skriver EN rad i project_checklist, samma tabellform som checklist_forslag', () => {
    const i = kalla.indexOf("case 'playbook_kickoff_suggestion':")
    const gren = kalla.slice(i, i + 2200)
    expect(gren).toContain(".from('project_checklist')")
    expect(gren).toContain('.insert(')
    expect(gren).toContain('project_id:')
    expect(gren).toContain('business_id: businessId')
    expect(gren).toContain('items:')
    expect(gren).toContain("status: 'in_progress'")
  })

  test('checklistpunkten bär mönstertexten som text, checked=false', () => {
    const i = kalla.indexOf("case 'playbook_kickoff_suggestion':")
    const gren = kalla.slice(i, i + 2200)
    expect(gren).toMatch(/text:\s*\w*[Pp]attern[Tt]ext\w*,/)
    expect(gren).toContain('checked: false')
  })

  test('saknad project_id eller pattern_text failar stängt med svenskt fel', () => {
    const i = kalla.indexOf("case 'playbook_kickoff_suggestion':")
    const gren = kalla.slice(i, i + 1400)
    expect(gren).toMatch(/\w+\.project_id as string/)
    expect(gren).toMatch(/\w+\.pattern_text as string/)
    expect(gren).toMatch(/if \(!\w+ \|\| !\w+\)/)
  })
})

// ─────────────────────────────────────────────────────────────────
// Cron-rutten — auth + vercel.json
// ─────────────────────────────────────────────────────────────────

const CRON_ROUTE = 'app/api/cron/playbook-kickoff/route.ts'

test.describe('cron/playbook-kickoff — auth', () => {
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

  test('anropar findKickoffCandidates + proposeKickoff per företag, ett företags fel fäller inte svepet för andra', () => {
    const s = read(CRON_ROUTE)
    expect(s).toContain('findKickoffCandidates(')
    expect(s).toContain('proposeKickoff(')
    expect(s).toContain('catch (err')
  })
})

test.describe('cron/playbook-kickoff — vercel.json', () => {
  test('finns exakt en cron-rad för rutten', () => {
    const cfg = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
    const rader = cfg.crons.filter(c => c.path === '/api/cron/playbook-kickoff')
    expect(rader).toHaveLength(1)
  })

  test('schemat är veckovis (M H * * D)', () => {
    const cfg = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
    const rad = cfg.crons.find(c => c.path === '/api/cron/playbook-kickoff')
    expect(rad, 'cron-raden saknas i vercel.json').toBeTruthy()
    expect(rad!.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* [0-6]$/)
  })

  test('annan veckodag än playbook-pattern (tisdag 05:20) — svepen ska inte köra tätt ihop', () => {
    const cfg = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
    const patternRad = cfg.crons.find(c => c.path === '/api/cron/playbook-pattern')!
    const kickoffRad = cfg.crons.find(c => c.path === '/api/cron/playbook-kickoff')!
    expect(patternRad.schedule).toBe('20 5 * * 2')
    const kickoffDay = kickoffRad.schedule.split(' ')[4]
    expect(kickoffDay).not.toBe('2')
  })

  test('kolliderar inte med någon befintlig schemarad', () => {
    const cfg = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
    const scheman = cfg.crons.map(c => c.schedule)
    const varSchema = cfg.crons.find(c => c.path === '/api/cron/playbook-kickoff')!.schedule
    const kollisioner = scheman.filter(s => s === varSchema)
    expect(kollisioner, `schemat ${varSchema} krockar med en annan rutt`).toHaveLength(1)
  })
})
