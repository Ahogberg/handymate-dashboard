/**
 * OperatingExperiment Etapp 2 — skarpbevis (mission-proof-idiomet).
 *
 * ═══ KEDJAN SOM BEVISAS ═══
 *
 *   Ett bekräftat playbook-mönster (business_knowledge, knowledge_type=
 *   'pattern', status='active') → ett experimentförslag (RIKTIGA
 *   proposeExperiment, lib/experiment/propose.ts) → ägaren bekräftar (ett
 *   operating_experiment-rad med status='active') → seedade projekt skrivs
 *   in (RIKTIGA maybeEnrollProject, lib/experiment/enroll.ts) → mätningen
 *   (RIKTIGA measureExperiment, lib/experiment/measure.ts, redan Etapp 1-
 *   bevisad men körd här mot en RIKTIG databas) → redovisningen (RIKTIGA
 *   maybeCreateReadout, lib/experiment/report.ts — frozen_summary skrivs,
 *   status→'concluded') → ägarens slutbeslut (gör till standard — en ny
 *   business_knowledge-regel) → fortsatt testning bevisas separat (RIKTIGA
 *   proposeExperiment med allowDuplicate:true, samma dedupe-kringgång som
 *   continue_testing-grenen använder) → städning.
 *
 * ═══ "INGA MOCKADE STEG" — VAD SOM ÄR RIKTIGT ═══
 *
 * proposeExperiment/maybeEnrollProject/measureExperiment/maybeCreateReadout
 * anropas som RIKTIGA funktioner mot RIKTIG databas — exakt samma kod
 * app/api/approvals/[id]/route.ts och app/api/cron/maintenance/route.ts
 * anropar i produktion.
 *
 * ═══ DOKUMENTERADE AVVIKELSER ═══
 *
 * 1. Bekräftelsen (Station 3) och "gör till standard"-beslutet (Station 7):
 *    den logiken ligger INLINE i app/api/approvals/[id]/route.ts:s switch-
 *    case (case 'operating_experiment_proposal'/'operating_experiment_
 *    readout'), inte extraherad till en fristående lib-funktion — samma
 *    situation som mission-proof.spec.ts Station 4-6 dokumenterar för sina
 *    icke-extraherade route-grenar. Här skrivs EXAKT samma kolumner den
 *    riktiga HTTP-vägen skulle skriva (verifierat rad för rad mot route.ts
 *    källkoden vid byggtillfället).
 * 2. "Fortsätt testa"-beslutet exercisas separat (Station 8) genom att
 *    anropa proposeExperiment med samma allowDuplicate:true-väg continue_
 *    testing-grenen använder — INTE genom att gå igenom hela redovisnings-
 *    cykeln en andra gång (det vore att duplicera Station 2/6, inget nytt
 *    bevisas). "Avvisa"-beslutet (owner_decision='rejected') är en
 *    enradig update i route.ts:s reject-side-effect-block, redan
 *    källskanningstestad i tests/operating-experiment.spec.ts — övas inte
 *    här, för att hålla beviset till EN sammanhållen kedja.
 * 3. Mätningen (Station 5) körs mot ett projekt UTAN fryst project_outcome
 *    (ingen efterkalkyl seedas) — measureExperiment/buildExperimentMeasurement
 *    är redan uttömmande bevisade med fakeSupabase i tests/operating-
 *    experiment.spec.ts (alla sex mått, alla eligibility-grenar). Det här
 *    beviset visar att den RIKTIGA I/O-vägen (fem-sex verkliga tabellfrågor)
 *    fungerar mot en RIKTIG databas, inte matematiken igen — verdict blir
 *    ärligt 'for_tidigt', vilket är precis vad ett nyss inskrivet, ostängt
 *    projekt SKA ge.
 *
 * ═══ ISOLERING ═══
 *
 * Alla rader skapas av OSS via service-role, id:n fångas synkront. Egen
 * jobbtyp (RUN_TS-suffixad) så inget kolliderar med en riktig kunds mönster.
 * Städningen körs ALLTID (test.afterAll), verifierad med SELECT efteråt.
 *
 * ═══ KÖRKRAV ═══
 *
 *   - sql/v157_operating_experiment.sql KÖRD (Station 0 SKIPPAR ärligt annars
 *     — 42P01 är ett väntat, ofarligt läge, inte ett produktionsfel).
 *   - SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY i .env.test.
 *   - Inget beroende av ANTHROPIC_API_KEY eller UI-inloggning.
 *
 * Körs ENDAST via: npx playwright test --project=experiment-proof
 */
import * as fs from 'fs'
import * as path from 'path'
import { test, expect } from '@playwright/test'
import { getSupabaseAdmin, DEMO_BUSINESS_ID } from './fixtures/db'
import type { Verdict } from './fixtures/report'
// De RIKTIGA produktionsfunktionerna — själva poängen med testet.
import { proposeExperiment } from '@/lib/experiment/propose'
import { maybeEnrollProject } from '@/lib/experiment/enroll'
import { measureExperiment, type MeasurableExperiment } from '@/lib/experiment/measure'
import { maybeCreateReadout, type ActiveExperimentRow } from '@/lib/experiment/report'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

const REPORT_DIR = path.join(process.cwd(), 'test-results', 'experiment-proof')
const REPORT_FILE = path.join(REPORT_DIR, 'report.jsonl')

function resetReport(): void {
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.writeFileSync(REPORT_FILE, '')
}
function pushResult(row: { station: string; steg: string; bevis: string; verdict: Verdict; detalj?: string }): void {
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.appendFileSync(REPORT_FILE, JSON.stringify({ ...row, timestamp: new Date().toISOString() }) + '\n')
  // eslint-disable-next-line no-console
  console.log(
    `[experiment-proof] ${row.verdict === 'PASS' ? '✅' : row.verdict === 'SKIP' ? '⏭' : '🔴'} ` +
      `${row.station} — ${row.steg}${row.detalj ? ' — ' + row.detalj : ''}`,
  )
}

const RUN_TS = Date.now()
const MARKER = `Experimentbevis ${RUN_TS}`
const JOB_TYPE = `expproof_${RUN_TS}`

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 11)}`
}

let v157Available = true
let allStationsOk = true

const ids: {
  patternId: string | null
  proposalApprovalId: string | null
  experimentId: string | null
  projectIds: string[]
  readoutApprovalId: string | null
  ruleKnowledgeId: string | null
  continuationApprovalId: string | null
} = {
  patternId: null,
  proposalApprovalId: null,
  experimentId: null,
  projectIds: [],
  readoutApprovalId: null,
  ruleKnowledgeId: null,
  continuationApprovalId: null,
}

async function station(nr: string, steg: string, body: () => Promise<string>): Promise<void> {
  try {
    const bevis = await test.step(`Station ${nr} — ${steg}`, body)
    pushResult({ station: nr, steg, bevis, verdict: 'PASS' })
  } catch (err) {
    allStationsOk = false
    pushResult({ station: nr, steg, bevis: '', verdict: 'FAIL', detalj: err instanceof Error ? err.message : String(err) })
    throw err
  }
}

test.describe.serial('OperatingExperiment-beviset — mönster → försök → beslut mot riktig databas', () => {
  test.beforeAll(() => resetReport())

  test.afterAll(async () => {
    const supabase = getSupabaseAdmin()
    const leftover: string[] = []
    const del = async (table: string, column: string, value: string | null) => {
      if (!value) return
      const { error } = await supabase.from(table).delete().eq(column, value)
      if (error) leftover.push(`${table}:${value} (${error.message})`)
    }

    try {
      if (ids.continuationApprovalId) await del('pending_approvals', 'id', ids.continuationApprovalId)
      if (ids.readoutApprovalId) await del('pending_approvals', 'id', ids.readoutApprovalId)
      if (ids.proposalApprovalId) await del('pending_approvals', 'id', ids.proposalApprovalId)
      if (ids.experimentId) await del('operating_experiment', 'id', ids.experimentId)
      if (ids.ruleKnowledgeId) await del('business_knowledge', 'id', ids.ruleKnowledgeId)
      if (ids.patternId) await del('business_knowledge', 'id', ids.patternId)
      for (const pid of ids.projectIds) await del('project', 'project_id', pid)

      if (ids.experimentId) {
        const { data, error } = await supabase.from('operating_experiment').select('id').eq('id', ids.experimentId)
        if (error && error.code !== '42P01') leftover.push(`operating_experiment-räkningen: ${error.message}`)
        if ((data || []).length > 0) leftover.push(`operating_experiment-raden ${ids.experimentId} kvar`)
      }
      const trackedApprovals = [ids.proposalApprovalId, ids.readoutApprovalId, ids.continuationApprovalId].filter((v): v is string => !!v)
      if (trackedApprovals.length > 0) {
        const { data, error } = await supabase.from('pending_approvals').select('id').in('id', trackedApprovals)
        if (error) leftover.push(`pending_approvals-räkningen: ${error.message}`)
        if ((data || []).length > 0) leftover.push(`${(data || []).length} pending_approvals-rader kvar`)
      }
      if (ids.projectIds.length > 0) {
        const { data, error } = await supabase.from('project').select('project_id').in('project_id', ids.projectIds)
        if (error) leftover.push(`project-räkningen: ${error.message}`)
        if ((data || []).length > 0) leftover.push(`${(data || []).length} project-rader kvar`)
      }
    } catch (err) {
      leftover.push(`städningen kastade: ${err instanceof Error ? err.message : String(err)}`)
    }

    pushResult({
      station: 'Städning',
      steg: 'experiment-proof.spec.ts afterAll',
      bevis: '',
      verdict: leftover.length > 0 ? 'FAIL' : 'PASS',
      detalj: leftover.length > 0
        ? `Kunde inte städa: ${leftover.join('; ')}`
        : `Alla rader från körningen (${MARKER}) borta — verifierat med selects.` + (allStationsOk ? '' : ' (En station föll — städningen körde ändå fullt ut.)'),
    })
  })

  test('Station 0 — v157-grinden', async () => {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase.from('operating_experiment').select('id').limit(0)
    // arSchemaSaknas (INTE en hårdkodad '42P01'-jämförelse) — empiriskt
    // fynd mot den här miljön: PostgREST svarar PGRST205, inte Postgres
    // egna 42P01, se lib/observability/driftlarm.ts filhuvud.
    v157Available = !(error && arSchemaSaknas(error))
    test.skip(
      !v157Available,
      'operating_experiment-tabellen SAKNAS — sql/v157_operating_experiment.sql är inte körd i den här miljön. ' +
        'FIX: kör sql/v157_operating_experiment.sql i Supabase SQL Editor och kör om testet.',
    )
    if (error) {
      throw new Error(`Oväntat DB-fel vid v157-grinden: ${error.code ?? '?'} ${error.message}`)
    }
    pushResult({ station: '0', steg: 'v157-grinden', bevis: 'operating_experiment finns (select limit 0 utan fel)', verdict: 'PASS' })
  })

  test('Station 1 — Ett bekräftat playbook-mönster', async () => {
    test.skip(!v157Available, 'v157 saknas — se Station 0')
    await station('1', 'business_knowledge (knowledge_type=pattern, status=active)', async () => {
      const supabase = getSupabaseAdmin()
      const { data, error } = await supabase
        .from('business_knowledge')
        .insert({
          business_id: DEMO_BUSINESS_ID,
          agent_id: 'daniel',
          knowledge_type: 'pattern',
          job_type: JOB_TYPE,
          title: `${MARKER} — mönster`,
          observation: `${MARKER}: räkna med en extra dag för rivning`,
          confidence: 0.9,
          data_basis: { evidence_lesson_ids: [], sample_count: 5 },
          status: 'active',
        })
        .select('id')
        .single()
      if (error || !data) throw new Error(`Kunde inte seeda mönstret: ${error?.message}`)
      ids.patternId = data.id
      return `business_knowledge.id=${ids.patternId}, job_type=${JOB_TYPE}`
    })
  })

  test('Station 2 — Förslaget (RIKTIGA proposeExperiment)', async () => {
    test.skip(!v157Available, 'v157 saknas — se Station 0')
    await station('2', 'proposeExperiment → pending_approvals(operating_experiment_proposal)', async () => {
      const supabase = getSupabaseAdmin()
      const hypothesis = `${MARKER}: räkna med en extra dag för rivning`
      const result = await proposeExperiment(supabase, DEMO_BUSINESS_ID, {
        jobType: JOB_TYPE,
        hypothesis,
        sourcePatternId: ids.patternId!,
      })
      if (result !== 'created') throw new Error(`proposeExperiment gav "${result}", väntade "created"`)

      const { data: cards, error } = await supabase
        .from('pending_approvals')
        .select('*')
        .eq('business_id', DEMO_BUSINESS_ID)
        .eq('approval_type', 'operating_experiment_proposal')
        .contains('payload', { source_pattern_id: ids.patternId })
        .limit(1)
      if (error || !cards || cards.length === 0) throw new Error(`Hittade inte förslagskortet: ${error?.message}`)
      ids.proposalApprovalId = cards[0].id
      const pl = cards[0].payload as Record<string, unknown>
      expect(pl.hypothesis).toBe(hypothesis)
      expect(pl.job_type).toBe(JOB_TYPE)
      return `kort ${ids.proposalApprovalId}, hypothesis ordagrann, guard_rails.max_projects=${(pl.guard_rails as any)?.max_projects}`
    })
  })

  test('Station 3 — Bekräftelsen (samma skrivform som approvals-rutten)', async () => {
    test.skip(!v157Available, 'v157 saknas — se Station 0')
    await station('3', 'operating_experiment INSERT (status=active) — AVVIKELSE, se filhuvudet punkt 1', async () => {
      const supabase = getSupabaseAdmin()
      const { data: cards, error: cardErr } = await supabase
        .from('pending_approvals')
        .select('payload')
        .eq('id', ids.proposalApprovalId!)
        .single()
      if (cardErr || !cards) throw new Error(`Kunde inte läsa förslagskortet: ${cardErr?.message}`)
      const pl = cards.payload as Record<string, unknown>

      ids.experimentId = genId('exp')
      const { error: insertErr } = await supabase.from('operating_experiment').insert({
        id: ids.experimentId,
        business_id: DEMO_BUSINESS_ID,
        hypothesis: pl.hypothesis,
        agent_key: pl.agent_id || 'lars',
        job_type: pl.job_type,
        source_pattern_id: pl.source_pattern_id,
        source_project_ids: [],
        planned_change: pl.planned_change,
        guard_rails: pl.guard_rails,
        measures: pl.measures,
        min_comparable_projects: pl.min_comparable_projects,
        enrolled_project_ids: [],
        status: 'active',
        confirmed_at: new Date().toISOString(),
      })
      if (insertErr) throw new Error(`Kunde inte skapa experimentraden: ${insertErr.message}`)

      const { error: approveErr } = await supabase
        .from('pending_approvals')
        .update({ status: 'approved', resolved_at: new Date().toISOString() })
        .eq('id', ids.proposalApprovalId!)
      if (approveErr) throw new Error(`Kunde inte markera förslagskortet godkänt: ${approveErr.message}`)

      const { data: exp, error: expErr } = await supabase.from('operating_experiment').select('*').eq('id', ids.experimentId).single()
      if (expErr || !exp) throw new Error(`Experimentraden gick inte att läsa tillbaka: ${expErr?.message}`)
      expect(exp.status).toBe('active')
      expect(exp.job_type).toBe(JOB_TYPE)
      return `operating_experiment ${ids.experimentId}, status=active, job_type=${JOB_TYPE}`
    })
  })

  test('Station 4 — Seedade projekt skrivs in (RIKTIGA maybeEnrollProject)', async () => {
    test.skip(!v157Available, 'v157 saknas — se Station 0')
    await station('4', 'två projekt av samma jobbtyp → maybeEnrollProject → enrolled_project_ids', async () => {
      const supabase = getSupabaseAdmin()
      const projA = genId('expproofproj')
      const projB = genId('expproofproj')
      const { error: projErr } = await supabase.from('project').insert([
        { project_id: projA, business_id: DEMO_BUSINESS_ID, name: `${MARKER} — projekt A`, job_type: JOB_TYPE, status: 'active' },
        { project_id: projB, business_id: DEMO_BUSINESS_ID, name: `${MARKER} — projekt B`, job_type: JOB_TYPE, status: 'active' },
      ])
      if (projErr) throw new Error(`Kunde inte seeda projekten: ${projErr.message}`)
      ids.projectIds = [projA, projB]

      const resultA = await maybeEnrollProject(supabase, DEMO_BUSINESS_ID, projA, JOB_TYPE)
      const resultB = await maybeEnrollProject(supabase, DEMO_BUSINESS_ID, projB, JOB_TYPE)
      if (resultA !== 'enrolled' || resultB !== 'enrolled') {
        throw new Error(`Inskrivning gav (${resultA}, ${resultB}), väntade (enrolled, enrolled)`)
      }
      // En upprepad inskrivning av samma projekt ska vara ett no-op, inte en dubblett.
      const resultAAgain = await maybeEnrollProject(supabase, DEMO_BUSINESS_ID, projA, JOB_TYPE)
      if (resultAAgain !== 'skipped_already_enrolled') {
        throw new Error(`Upprepad inskrivning gav "${resultAAgain}", väntade "skipped_already_enrolled"`)
      }

      const { data: exp, error } = await supabase.from('operating_experiment').select('enrolled_project_ids').eq('id', ids.experimentId!).single()
      if (error || !exp) throw new Error(`Kunde inte läsa tillbaka experimentraden: ${error?.message}`)
      expect(exp.enrolled_project_ids).toEqual([projA, projB])
      return `enrolled_project_ids=[${projA}, ${projB}], upprepad inskrivning gav skipped_already_enrolled`
    })
  })

  test('Station 5 — Mätningen (RIKTIGA measureExperiment mot riktig databas)', async () => {
    test.skip(!v157Available, 'v157 saknas — se Station 0')
    await station('5', 'measureExperiment — inget fryst utfall ännu → verdict for_tidigt', async () => {
      const supabase = getSupabaseAdmin()
      const measurable: MeasurableExperiment = {
        id: ids.experimentId!,
        business_id: DEMO_BUSINESS_ID,
        enrolled_project_ids: ids.projectIds,
        measures: ['sena_andringar', 'extra_timmar', 'marginal'],
        min_comparable_projects: 3,
        planned_change_type: 'kickoff_checkpoint',
        source_pattern_id: ids.patternId,
      }
      const measurement = await measureExperiment(supabase, measurable)
      expect(measurement.projects_enrolled).toBe(2)
      expect(measurement.projects_completed).toBe(0)
      expect(measurement.verdict).toBe('for_tidigt')
      return `projects_enrolled=2, projects_completed=0, verdict=for_tidigt (ärligt — inget projekt är stängt än)`
    })
  })

  test('Station 6 — Redovisningen (RIKTIGA maybeCreateReadout, frozen_summary skrivs)', async () => {
    test.skip(!v157Available, 'v157 saknas — se Station 0')
    await station('6', 'maybeCreateReadout (end_date bakåtdaterad) → kort skapas, status→concluded, frozen_summary satt', async () => {
      const supabase = getSupabaseAdmin()

      // Backdatera end_date så försöket blir redovisningsbart NU utan att
      // behöva vänta 60 dagar — samma tids-check maybeCreateReadout redan
      // gör, bara med en förfluten deadline.
      const { data: expRow, error: readErr } = await supabase.from('operating_experiment').select('*').eq('id', ids.experimentId!).single()
      if (readErr || !expRow) throw new Error(`Kunde inte läsa experimentraden: ${readErr?.message}`)
      const backdatedGuardRails = { ...(expRow.guard_rails as Record<string, unknown>), end_date: '2020-01-01' }
      const { error: updErr } = await supabase.from('operating_experiment').update({ guard_rails: backdatedGuardRails }).eq('id', ids.experimentId!)
      if (updErr) throw new Error(`Kunde inte backdatera end_date: ${updErr.message}`)

      const activeRow: ActiveExperimentRow = {
        id: expRow.id,
        business_id: expRow.business_id,
        job_type: expRow.job_type,
        hypothesis: expRow.hypothesis,
        source_pattern_id: expRow.source_pattern_id,
        enrolled_project_ids: expRow.enrolled_project_ids,
        measures: expRow.measures,
        min_comparable_projects: expRow.min_comparable_projects,
        guard_rails: backdatedGuardRails as ActiveExperimentRow['guard_rails'],
        planned_change: expRow.planned_change,
      }
      const result = await maybeCreateReadout(supabase, DEMO_BUSINESS_ID, activeRow)
      if (result !== 'created') throw new Error(`maybeCreateReadout gav "${result}", väntade "created"`)

      const { data: readoutCards, error: cardErr } = await supabase
        .from('pending_approvals')
        .select('*')
        .eq('business_id', DEMO_BUSINESS_ID)
        .eq('approval_type', 'operating_experiment_readout')
        .contains('payload', { experiment_id: ids.experimentId })
        .limit(1)
      if (cardErr || !readoutCards || readoutCards.length === 0) throw new Error(`Hittade inte redovisningskortet: ${cardErr?.message}`)
      ids.readoutApprovalId = readoutCards[0].id
      expect(readoutCards[0].title).toContain('Försöket är klart att redovisas')

      const { data: concluded, error: concludedErr } = await supabase.from('operating_experiment').select('status, concluded_at, frozen_summary').eq('id', ids.experimentId!).single()
      if (concludedErr || !concluded) throw new Error(`Kunde inte läsa den avslutade raden: ${concludedErr?.message}`)
      expect(concluded.status).toBe('concluded')
      expect(concluded.concluded_at).toBeTruthy()
      expect(concluded.frozen_summary).toBeTruthy()

      return `redovisningskort ${ids.readoutApprovalId}, operating_experiment.status=concluded, frozen_summary satt`
    })
  })

  test('Station 7 — Ägarens slutbeslut: gör till standard (samma skrivform som approvals-rutten)', async () => {
    test.skip(!v157Available, 'v157 saknas — se Station 0')
    await station('7', "business_knowledge-regel + resulting_rule_id — AVVIKELSE, se filhuvudet punkt 1", async () => {
      const supabase = getSupabaseAdmin()
      const { data: rule, error: ruleErr } = await supabase
        .from('business_knowledge')
        .insert({
          business_id: DEMO_BUSINESS_ID,
          agent_id: 'lars',
          knowledge_type: 'pattern',
          job_type: JOB_TYPE,
          title: `${MARKER} — bekräftad via försök`,
          observation: `${MARKER}: räkna med en extra dag för rivning`,
          confidence: null,
          data_basis: { source_experiment_id: ids.experimentId, source_pattern_id: ids.patternId },
          status: 'active',
          related_approval_id: ids.readoutApprovalId,
        })
        .select('id')
        .single()
      if (ruleErr || !rule) throw new Error(`Kunde inte skapa regeln: ${ruleErr?.message}`)
      ids.ruleKnowledgeId = rule.id

      const nowIso = new Date().toISOString()
      const { error: decideErr } = await supabase
        .from('operating_experiment')
        .update({ owner_decision: 'made_standard', decided_at: nowIso, resulting_rule_id: rule.id })
        .eq('id', ids.experimentId!)
      if (decideErr) throw new Error(`Kunde inte spara beslutet: ${decideErr.message}`)

      const { data: decided, error: decidedErr } = await supabase.from('operating_experiment').select('owner_decision, resulting_rule_id, decided_at').eq('id', ids.experimentId!).single()
      if (decidedErr || !decided) throw new Error(`Kunde inte läsa tillbaka beslutet: ${decidedErr?.message}`)
      expect(decided.owner_decision).toBe('made_standard')
      expect(decided.resulting_rule_id).toBe(rule.id)
      expect(decided.decided_at).toBeTruthy()

      return `business_knowledge-regel ${rule.id}, operating_experiment.owner_decision=made_standard, resulting_rule_id=${rule.id}`
    })
  })

  test('Station 8 — Fortsätt testa-vägen (RIKTIGA proposeExperiment, allowDuplicate)', async () => {
    test.skip(!v157Available, 'v157 saknas — se Station 0')
    await station('8', 'proposeExperiment({allowDuplicate:true}) kringgår dedupen trots befintligt experiment för samma mönster', async () => {
      const supabase = getSupabaseAdmin()

      // Utan allowDuplicate skulle dedupen (operating_experiment finns redan
      // för source_pattern_id) blockera — bevisar att den SPÄRRAS normalt.
      const blocked = await proposeExperiment(supabase, DEMO_BUSINESS_ID, {
        jobType: JOB_TYPE,
        hypothesis: `${MARKER}: räkna med en extra dag för rivning`,
        sourcePatternId: ids.patternId!,
      })
      if (blocked !== 'skipped_already_proposed') {
        throw new Error(`Väntade "skipped_already_proposed" utan allowDuplicate, fick "${blocked}"`)
      }

      const continued = await proposeExperiment(
        supabase, DEMO_BUSINESS_ID,
        { jobType: JOB_TYPE, hypothesis: `${MARKER}: räkna med en extra dag för rivning`, sourcePatternId: ids.patternId! },
        { allowDuplicate: true },
      )
      if (continued !== 'created') throw new Error(`Väntade "created" med allowDuplicate:true, fick "${continued}"`)

      const { data: cards, error } = await supabase
        .from('pending_approvals')
        .select('id')
        .eq('business_id', DEMO_BUSINESS_ID)
        .eq('approval_type', 'operating_experiment_proposal')
        .contains('payload', { source_pattern_id: ids.patternId })
      if (error) throw new Error(`Kunde inte räkna förslagskorten: ${error.message}`)
      const nyttKort = (cards || []).find(c => c.id !== ids.proposalApprovalId)
      if (!nyttKort) throw new Error('Hittade inget nytt förslagskort utöver det ursprungliga')
      ids.continuationApprovalId = nyttKort.id

      return `utan allowDuplicate: skipped_already_proposed (dedupen håller). Med allowDuplicate:true: nytt kort ${ids.continuationApprovalId} skapat`
    })
  })
})
