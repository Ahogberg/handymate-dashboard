/**
 * Flywheel-beviset — hela lärdomsloopen mot RIKTIG databas, inga mockade kort.
 *
 * Kedjan som bevisas (ägarens egen formulering):
 *   Projekt avslutas → debrief godkänns → project_lesson skapas → flera
 *   lärdomar bildar mönster → ägaren bekräftar Playbook-regeln → nytt
 *   matchande projekt upptäcks → Lars visar förslag → användaren godkänner
 *   → kontrollpunkten finns faktiskt i projektet.
 *
 * ═══ "INGA MOCKADE KORT" — ÄRLIGHETSGRÄNSEN ═══
 *
 * Varje pending_approvals-rad i det här testet skapas av den RIKTIGA
 * produktionsproducenten (skapaDebriefKort, proposePattern → detectPattern
 * med ett RIKTIGT, mätt Haiku-anrop, findKickoffCandidates + proposeKickoff)
 * — importerade och anropade mot riktig DB, aldrig handbyggda payload-
 * inserts. Varje godkännande går genom den RIKTIGA POST /api/approvals/[id]
 * med en riktig UI-inloggad ägarsession (samma mönster som golden-path
 * Station 8/9 — kortet göms MEDVETET i /dashboard/approvals av
 * arTestdataApproval-filtret, så API-med-riktig-session är den riktiga
 * exekveringsvägen, inte en genväg). Aldrig direkta status-flippar i DB.
 *
 * FÖRUTSÄTTNINGARNA seedas däremot via service-role: projekt skapas/stängs
 * direkt i DB (offert→signering→stängning är redan uttömmande bevisat av
 * golden-path station 4-11 — att återbevisa det här sex gånger hade gjort
 * testet 30 minuter långt utan ny bevisstyrka). Likaså: EN lärdom bevisas
 * genom hela den riktiga kortvägen (station 3-4), de återstående seedas som
 * förutsättning för mönstersteget — det är lärdoms-SKRIVVÄGEN station 3-4
 * bevisar, inte antalet.
 *
 * ═══ ISOLERING ═══
 *
 * Unik job_type per körning (`E2E Flywheel <RUN_TS>`): mönsterdetektionen
 * kan aldrig matcha riktig data, dedup-spärrarna kan aldrig kollidera
 * mellan körningar, och städningen blir kirurgisk. Alla seedade projekt/
 * kunden bär samma RUN_TS-markör i namnet. Station 7 anropar proposeKickoff
 * ENBART för körningens egen kandidat — findKickoffCandidates sveper hela
 * kontot och kan legitimt hitta demokontots riktiga projekt; de rörs aldrig.
 *
 * ═══ KÄNDA, AVSIKTLIGA RESTER ═══
 *
 * detectPattern mäter sin Haiku-kostnad via cost-guard (riktig COGS-rad för
 * demokontot) — den raden städas MEDVETET inte (att radera en riktig
 * kostnad vore att förfalska kostnadsbokföringen). learning_events-raderna
 * från godkännandena städas best-effort (de refererar approval-id:n som
 * raderas här).
 *
 * ═══ KÖRKRAV ═══
 *
 *   - sql/v141_business_knowledge_pattern.sql KÖRD (Station 0 grindar hårt).
 *   - DEMO_OWNER_PASSWORD i .env.test (riktig UI-inloggning).
 *   - ANTHROPIC_API_KEY i .env.test — detektionen är ett riktigt Haiku-anrop
 *     som körs i TESTPROCESSEN (inte på servern). Station 5 grindar hårt.
 *
 * Samma harness-mönster som golden-path.spec.ts: test.describe.serial, EN
 * ägarsession i modul-scope, DB-sanning via fixtures/db.ts, afterAll-städning
 * som ALLTID körs. Egen rapportfil (test-results/flywheel/report.jsonl) så
 * golden-paths egen rapport aldrig skrivs över.
 */
import * as fs from 'fs'
import * as path from 'path'
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import {
  getSupabaseAdmin,
  waitForRow,
  assertRow,
  countRows,
  DEMO_BUSINESS_ID,
  DEMO_OWNER_EMAIL,
  E2E_TEST_EMAIL,
  requireDemoOwnerPassword,
} from './fixtures/db'
import type { Verdict } from './fixtures/report'
// De RIKTIGA produktionsproducenterna — själva poängen med testet.
import { skapaDebriefKort } from '@/lib/debrief/create-debrief-card'
import { proposePattern } from '@/lib/playbook/propose-pattern'
import { MIN_SAMPLE_SIZE } from '@/lib/playbook/detect-pattern'
import { findKickoffCandidates } from '@/lib/playbook/kickoff-candidates'
import { proposeKickoff } from '@/lib/playbook/propose-kickoff'
import { getNextCustomerNumber } from '@/lib/numbering'

// ── Rapport — egen fil, INTE fixtures/report.ts:s (den hårdkodar
// test-results/golden-path/report.jsonl och resetReportFile() där hade
// nollställt golden-paths rapport om båda körs i samma svep). Samma
// jsonl-append-mönster, bara en annan katalog. ────────────────────────────
const REPORT_DIR = path.join(process.cwd(), 'test-results', 'flywheel')
const REPORT_FILE = path.join(REPORT_DIR, 'report.jsonl')

function resetFlywheelReport(): void {
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.writeFileSync(REPORT_FILE, '')
}

function pushResult(row: { station: string; steg: string; bevis: string; verdict: Verdict; detalj?: string }): void {
  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true })
  fs.appendFileSync(REPORT_FILE, JSON.stringify({ ...row, timestamp: new Date().toISOString() }) + '\n')
  // eslint-disable-next-line no-console
  console.log(
    `[flywheel] ${row.verdict === 'PASS' ? '✅' : row.verdict === 'SKIP' ? '⏭' : '🔴'} ` +
      `${row.station} — ${row.steg}${row.detalj ? ' — ' + row.detalj : ''}`,
  )
}

// ── Körningens identitet — se Isolering i filhuvudet ──────────────────────
const RUN_TS = Date.now()
const JOB_TYPE = `E2E Flywheel ${RUN_TS}`
const MARKER = JOB_TYPE
const KUND_NAMN = `${MARKER} Kund`

/**
 * Lärdomstexterna är naturlig svenska som ÄRLIGT upprepar ETT konkret tema
 * (rivningen tar en extra dag) — detektionen är ett riktigt Haiku-anrop med
 * "hellre missa än gissa"-prompt (lib/playbook/detect-pattern.ts), så
 * temat måste vara genuint upprepat för att en hederlig detektor ska hitta
 * det. Tre svar går genom den riktiga debrief-kortvägen, tre seedas.
 */
const DEBRIEF_SVAR = [
  'Rivningen tog en hel dag längre än vi räknat med i offerten.',
  'Vi kom inte igång med resten förrän rivningen var klar — den drog över med en dag.',
  'Räkna med en extra dag för rivning på den här typen av jobb.',
]
const SEEDADE_LARDOMAR = [
  'Rivningen drog över med en dag den här gången också.',
  'Underskattade rivningsmomentet — kostade oss en extra arbetsdag.',
  'Rivningen tog en dag mer än planerat, igen.',
]

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 11)}`
}

let ownerCtx: BrowserContext
let ownerPage: Page
let allStationsOk = true

const ids: {
  customerId: string | null
  /** De sex avslutade källprojekten (index 0 = debrief-projektet). */
  sourceProjectIds: string[]
  sourceProjectNames: string[]
  /** Det aktiva "nya matchande projektet" som kickoffen ska landa i. */
  activeProjectId: string | null
  debriefCardId: string | null
  patternCardId: string | null
  kickoffCardId: string | null
  /** Lärdomar bevisade genom den riktiga kortvägen (station 4). */
  lessonIds: string[]
  /** Lärdomar seedade som förutsättning (station 4, dokumenterat). */
  seededLessonIds: string[]
  knowledgeId: string | null
  checklistId: string | null
  patternText: string | null
} = {
  customerId: null,
  sourceProjectIds: [],
  sourceProjectNames: [],
  activeProjectId: null,
  debriefCardId: null,
  patternCardId: null,
  kickoffCardId: null,
  lessonIds: [],
  seededLessonIds: [],
  knowledgeId: null,
  checklistId: null,
  patternText: null,
}

/** Samma stations-wrapper som golden-path.spec.ts — bokför + kastar vidare. */
async function station(nr: string, steg: string, body: () => Promise<string>): Promise<void> {
  try {
    const bevis = await body()
    pushResult({ station: nr, steg, bevis, verdict: 'PASS' })
  } catch (err) {
    allStationsOk = false
    pushResult({
      station: nr,
      steg,
      bevis: '',
      verdict: 'FAIL',
      detalj: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

test.describe.serial('Flywheel — lärdomsloopen sluts på riktigt', () => {
  test.beforeAll(async ({ browser }) => {
    resetFlywheelReport()
    ownerCtx = await browser.newContext()
    ownerPage = await ownerCtx.newPage()
  })

  // ── Städning — körs ALLTID, oavsett hur långt kedjan kom ────────────────
  test.afterAll(async () => {
    const supabase = getSupabaseAdmin()
    const leftover: string[] = []
    const del = async (table: string, column: string, value: string | null) => {
      if (!value) return
      const { error } = await supabase.from(table).delete().eq(column, value)
      if (error) leftover.push(`${table}:${value} (${error.message})`)
    }

    try {
      const allProjectIds = [...ids.sourceProjectIds, ...(ids.activeProjectId ? [ids.activeProjectId] : [])]

      // 1. Kontrollpunkten (barn till projektet) — på project_id, inte bara
      //    checklistId: fångar även en rad som skapades men vars id aldrig
      //    hann sparas (samma orphan-resonemang som golden-paths cleanupCore).
      await del('project_checklist', 'project_id', ids.activeProjectId)

      // 2. Godkännandekorten — spårade id:n + en payload-svepning på
      //    körningens markör (kort skapade på riktigt men vars id aldrig
      //    hann fångas, t.ex. mitt i en waitForRow-timeout).
      const trackedCardIds = [ids.debriefCardId, ids.patternCardId, ids.kickoffCardId].filter(
        (v): v is string => !!v,
      )
      for (const cardId of trackedCardIds) await del('pending_approvals', 'id', cardId)
      const { data: orphanCards, error: orphanErr } = await supabase
        .from('pending_approvals')
        .select('id, payload')
        .eq('business_id', DEMO_BUSINESS_ID)
        .in('approval_type', ['project_debrief', 'playbook_pattern_confirmation', 'playbook_kickoff_suggestion'])
      if (orphanErr) leftover.push(`pending_approvals-svepningen kunde inte läsa: ${orphanErr.message}`)
      for (const row of orphanCards || []) {
        const pl = (row as { payload?: Record<string, unknown> }).payload || {}
        if (pl.job_type === JOB_TYPE || (typeof pl.project_id === 'string' && allProjectIds.includes(pl.project_id))) {
          await del('pending_approvals', 'id', (row as { id: string }).id)
        }
      }

      // 3. learning_events från godkännandena (best-effort — refererar
      //    approval-id:n som just raderats).
      for (const cardId of trackedCardIds) {
        const { error } = await supabase.from('learning_events').delete().eq('reference_id', cardId)
        if (error) leftover.push(`learning_events:${cardId} (${error.message})`)
      }

      // 4. Playbook-regeln — job_type är unik per körning, så en delete på
      //    (business_id, job_type) är kirurgisk. 42703 = v141 aldrig körd
      //    (Station 0 grindade) → inget kan ha skrivits, inget att städa.
      const { error: bkErr } = await supabase
        .from('business_knowledge')
        .delete()
        .eq('business_id', DEMO_BUSINESS_ID)
        .eq('job_type', JOB_TYPE)
      if (bkErr && bkErr.code !== '42703') leftover.push(`business_knowledge (job_type=${JOB_TYPE}): ${bkErr.message}`)

      // 5. Lärdomarna — båda sorterna (kortvägen + seedade) bär körningens
      //    job_type.
      const { error: lessonErr } = await supabase
        .from('project_lesson')
        .delete()
        .eq('business_id', DEMO_BUSINESS_ID)
        .eq('job_type', JOB_TYPE)
      if (lessonErr) leftover.push(`project_lesson (job_type=${JOB_TYPE}): ${lessonErr.message}`)

      // 6. Projekten + kunden (förälder sist).
      for (const projectId of allProjectIds) await del('project', 'project_id', projectId)
      await del('customer_activity', 'customer_id', ids.customerId)
      await del('customer', 'customer_id', ids.customerId)

      // 7. Verifiering: NOLL rader kvar med körningens markör — rapporteras
      //    högt, aldrig tyst.
      const lessonsLeft = await countRows('project_lesson', { business_id: DEMO_BUSINESS_ID, job_type: JOB_TYPE })
      if (lessonsLeft > 0) leftover.push(`${lessonsLeft} project_lesson-rader kvar med job_type=${JOB_TYPE}`)
      const { count: bkLeft, error: bkCountErr } = await supabase
        .from('business_knowledge')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', DEMO_BUSINESS_ID)
        .eq('job_type', JOB_TYPE)
      if (bkCountErr && bkCountErr.code !== '42703') leftover.push(`business_knowledge-räkningen: ${bkCountErr.message}`)
      if ((bkLeft ?? 0) > 0) leftover.push(`${bkLeft} business_knowledge-rader kvar med job_type=${JOB_TYPE}`)
      const { data: projectsLeft, error: projLeftErr } = await supabase
        .from('project')
        .select('project_id')
        .eq('business_id', DEMO_BUSINESS_ID)
        .ilike('name', `${MARKER}%`)
      if (projLeftErr) leftover.push(`projekt-räkningen: ${projLeftErr.message}`)
      if ((projectsLeft || []).length > 0) {
        leftover.push(`${(projectsLeft || []).length} project-rader kvar med markören "${MARKER}"`)
      }
      if (ids.customerId) {
        const customerLeft = await countRows('customer', { customer_id: ids.customerId })
        if (customerLeft > 0) leftover.push(`kunden ${ids.customerId} kvar`)
      }
      const { data: cardsLeft } = await supabase
        .from('pending_approvals')
        .select('id, payload')
        .eq('business_id', DEMO_BUSINESS_ID)
        .in('approval_type', ['project_debrief', 'playbook_pattern_confirmation', 'playbook_kickoff_suggestion'])
      const ourCardsLeft = (cardsLeft || []).filter((r: { payload?: Record<string, unknown> }) => {
        const pl = r.payload || {}
        return pl.job_type === JOB_TYPE || (typeof pl.project_id === 'string' && allProjectIds.includes(pl.project_id))
      })
      if (ourCardsLeft.length > 0) leftover.push(`${ourCardsLeft.length} pending_approvals-rader kvar för körningen`)
    } catch (err) {
      leftover.push(`städningen kastade: ${err instanceof Error ? err.message : String(err)}`)
    }

    pushResult({
      station: 'Städning',
      steg: 'flywheel.spec.ts afterAll',
      bevis: '',
      verdict: leftover.length > 0 ? 'FAIL' : 'PASS',
      detalj:
        leftover.length > 0
          ? `Kunde inte städa: ${leftover.join('; ')}`
          : `Alla rader med markören "${MARKER}" borta — verifierat med räkningar, inte antaget. ` +
            `(Haiku-kostnadsraden lämnas MEDVETET — riktig COGS, se filhuvudet.)${allStationsOk ? '' : ' (En station föll — städningen körde ändå fullt ut.)'}`,
    })

    await ownerCtx?.close().catch(() => {})
  })

  test('Station 0 — v141-grinden', async () => {
    await station('0', 'v141-grinden (business_knowledge.job_type)', async () => {
      const supabase = getSupabaseAdmin()
      // limit(0): rör ingen rad, provocerar bara kolumnuppslaget. PostgREST
      // svarar 42703 (undefined_column) om v141 aldrig körts.
      const { error } = await supabase.from('business_knowledge').select('job_type').limit(0)
      if (error) {
        if (error.code === '42703') {
          throw new Error(
            'business_knowledge.job_type SAKNAS — sql/v141_business_knowledge_pattern.sql är inte körd. ' +
              'FIX: kör sql/v141_business_knowledge_pattern.sql i Supabase SQL Editor (manuellt, se filens huvud) ' +
              'och kör om testet. Utan kolumnen är hela Playbook-kedjan (mönsterbekräftelse → kickoff) inert — ' +
              'testet vägrar därför starta i stället för att ge en falsk grön eller en tyst skip.',
          )
        }
        throw new Error(`Oväntat DB-fel vid v141-grinden: ${error.code ?? '?'} ${error.message}`)
      }
      return 'business_knowledge.job_type finns (select job_type limit 0 utan fel) — v141 är körd'
    })
  })

  test('Station 1 — Riktig ägarinloggning', async () => {
    await station('1', 'Riktig UI-inloggning (demo-ägaren)', async () => {
      const password = requireDemoOwnerPassword()
      await ownerPage.goto('/login')
      await ownerPage.locator('input[type="email"]').fill(DEMO_OWNER_EMAIL)
      await ownerPage.locator('input[type="password"]').fill(password)
      await ownerPage.getByRole('button', { name: 'Logga in' }).click()
      await ownerPage.waitForURL(/\/dashboard/, { timeout: 15_000 })
      // Inga overlay-dismissar behövs (jfr golden-path Station 1): alla
      // interaktioner efter inloggningen går via ownerCtx.request (delar
      // session-cookies med sidan) — inga fler UI-klick som kan blockeras.
      const res = await ownerCtx.request.get('/api/me')
      expect(res.ok(), `/api/me svarade ${res.status()}`).toBeTruthy()
      const body = await res.json()
      expect(body?.business?.business_id, 'sessionen måste resolva till demokontot').toBe(DEMO_BUSINESS_ID)
      return `UI-inloggning → ${ownerPage.url()}, /api/me -> business_id=${body.business.business_id}`
    })
  })

  test('Station 2 — Sådd (förutsättningarna, service-role)', async () => {
    await station('2', 'Sådd: kund + 6 avslutade + 1 aktivt projekt', async () => {
      const supabase = getSupabaseAdmin()

      // Kunden — samma minimala, ärliga form som lib/demo/seed-demo-account.ts
      // (customer_id genereras av applikationskod, customer_number via den
      // riktiga numreringsfunktionen).
      const customerNumber = await getNextCustomerNumber(supabase, DEMO_BUSINESS_ID)
      const { data: customer, error: custErr } = await supabase
        .from('customer')
        .insert({
          customer_id: genId('cust'),
          business_id: DEMO_BUSINESS_ID,
          name: KUND_NAMN,
          // KÖRUNIK telefon — INTE E2E_TEST_PHONE: den delade test-telefonen
          // finns redan på en kund i demokontot (unique_phone_per_business
          // föll första skarpa körningen, 2026-08-17). Ingen SMS går ut i
          // den här loopen, så numret behöver aldrig kunna ta emot något —
          // det behöver bara vara giltigt till formen och unikt per körning.
          phone_number: `+4670${String(RUN_TS).slice(-7)}`,
          email: E2E_TEST_EMAIL,
          customer_type: 'private',
          customer_number: customerNumber,
          created_at: new Date().toISOString(),
        })
        .select('customer_id')
        .single()
      if (custErr || !customer) throw new Error(`Kunde inte seeda kunden: ${custErr?.message}`)
      ids.customerId = customer.customer_id

      // Sex avslutade källprojekt (samma kolumnform som seed-demo-account:s
      // project-inserts — project_id har DB-default). Avslutade olika dagar
      // bakåt så lärdomshistoriken ser ut som riktig historik.
      for (let i = 1; i <= 6; i++) {
        const name = `${MARKER} Källprojekt ${i}`
        const completedDaysAgo = 5 * i
        const { data: proj, error: projErr } = await supabase
          .from('project')
          .insert({
            business_id: DEMO_BUSINESS_ID,
            customer_id: ids.customerId,
            name,
            project_type: 'fixed',
            status: 'completed',
            job_type: JOB_TYPE,
            budget_amount: 6000,
            completed_at: new Date(Date.now() - completedDaysAgo * 24 * 3600 * 1000).toISOString(),
            created_at: new Date(Date.now() - (completedDaysAgo + 7) * 24 * 3600 * 1000).toISOString(),
          })
          .select('project_id')
          .single()
        if (projErr || !proj) throw new Error(`Kunde inte seeda källprojekt ${i}: ${projErr?.message}`)
        ids.sourceProjectIds.push(proj.project_id)
        ids.sourceProjectNames.push(name)
      }

      // Det NYA matchande projektet — aktivt, skapat NU (inom kickoff-
      // svepningens 14-dagarsfönster, lib/playbook/kickoff-candidates.ts).
      const { data: active, error: activeErr } = await supabase
        .from('project')
        .insert({
          business_id: DEMO_BUSINESS_ID,
          customer_id: ids.customerId,
          name: `${MARKER} Nytt projekt`,
          project_type: 'fixed',
          status: 'active',
          job_type: JOB_TYPE,
          budget_amount: 6000,
          created_at: new Date().toISOString(),
        })
        .select('project_id')
        .single()
      if (activeErr || !active) throw new Error(`Kunde inte seeda det aktiva projektet: ${activeErr?.message}`)
      ids.activeProjectId = active.project_id

      return `kund ${ids.customerId}, 6 avslutade källprojekt + 1 aktivt (${ids.activeProjectId}), alla job_type="${JOB_TYPE}"`
    })
  })

  test('Station 3 — Debrief-kortet (riktig producent)', async () => {
    await station('3', 'skapaDebriefKort → riktigt project_debrief-kort', async () => {
      const supabase = getSupabaseAdmin()
      // Samma anrop som completeProject gör vid en riktig stängning —
      // deltat (hours_diff_pct > 10) styr deterministiskt vilka frågor
      // kortet ställer (lib/debrief/build-debrief-questions.ts).
      await skapaDebriefKort(supabase, DEMO_BUSINESS_ID, {
        project_id: ids.sourceProjectIds[0],
        project_name: ids.sourceProjectNames[0],
        quote_id: null,
        job_type: JOB_TYPE,
        hours_diff_pct: 25,
        amount_diff_pct: -12,
      })
      // skapaDebriefKort är fail-safe (kastar aldrig) — DB-sanningen är
      // därför det enda giltiga beviset på att kortet faktiskt skapades.
      const card = await waitForRow<{ id: string; payload: { questions: string[]; job_type: string } }>(
        'pending_approvals',
        { business_id: DEMO_BUSINESS_ID, approval_type: 'project_debrief', status: 'pending' },
        {
          predicate: (r: any) => r.payload?.project_id === ids.sourceProjectIds[0],
          label: 'project_debrief-kortet (skapat av den riktiga producenten)',
        },
      )
      ids.debriefCardId = card.id
      expect(card.payload.job_type, 'kortet ska bära körningens job_type').toBe(JOB_TYPE)
      expect(card.payload.questions.length, 'deterministiska frågor ur deltat').toBeGreaterThanOrEqual(2)
      return `project_debrief-kort ${card.id} (${card.payload.questions.length} frågor, job_type="${JOB_TYPE}")`
    })
  })

  test('Station 4 — Debriefen besvaras (riktigt API) + resterande lärdomar seedas', async () => {
    await station('4', 'action:edit → project_lesson via riktiga exekveraren', async () => {
      const supabase = getSupabaseAdmin()
      const card = await assertRow<{ payload: { questions: string[] } }>(
        'pending_approvals',
        { id: ids.debriefCardId! },
        'debrief-kortet',
      )
      // Svaren nycklas på frågetexten — exakt det kontrakt case
      // 'project_debrief' i app/api/approvals/[id]/route.ts läser
      // (edited_payload.answers, action:'edit' är enda action som mergar).
      const answers: Record<string, string> = {}
      card.payload.questions.forEach((fraga, i) => {
        answers[fraga] = DEBRIEF_SVAR[i] ?? DEBRIEF_SVAR[DEBRIEF_SVAR.length - 1]
      })

      const res = await ownerCtx.request.post(`/api/approvals/${ids.debriefCardId}`, {
        data: { action: 'edit', edited_payload: { answers } },
      })
      const body = await res.json().catch(() => null)
      expect(res.ok(), `POST /api/approvals/:id (edit) svarade ${res.status()}: ${JSON.stringify(body)}`).toBeTruthy()

      // DB-sanning: lärdomarna finns, med körningens job_type.
      const antalSvar = Object.keys(answers).length
      let lessons: Array<{ id: string; lesson_text: string }> = []
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline) {
        const { data } = await supabase
          .from('project_lesson')
          .select('id, lesson_text')
          .eq('business_id', DEMO_BUSINESS_ID)
          .eq('job_type', JOB_TYPE)
        if (data && data.length >= antalSvar) {
          lessons = data
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      if (lessons.length < antalSvar) {
        throw new Error(
          `project_lesson gav aldrig ${antalSvar} rader för job_type="${JOB_TYPE}" — ` +
            `exekveringssvaret var: ${JSON.stringify(body?.execution ?? body)}`,
        )
      }
      ids.lessonIds = lessons.map((l) => l.id)
      await assertRow('pending_approvals', { id: ids.debriefCardId!, status: 'approved' }, 'debrief-kortet -> approved')

      // ── Ärlighetsgränsen (se filhuvudet): EN debrief är nu bevisad genom
      // hela den riktiga kedjan (producent → riktigt API → project_lesson).
      // Resterande lärdomar upp till MIN_SAMPLE_SIZE seedas som
      // FÖRUTSÄTTNING för mönstersteget — samma skrivväg som nyss bevisades,
      // inte en ny. Kopplade till varsitt seedat källprojekt så kickoffens
      // evidens-uppslag (lärdom → projekt → namn) har riktiga rader att gå på.
      const { data: seeded, error: seedErr } = await supabase
        .from('project_lesson')
        .insert(
          SEEDADE_LARDOMAR.map((text, i) => ({
            business_id: DEMO_BUSINESS_ID,
            project_id: ids.sourceProjectIds[i + 1],
            quote_id: null,
            job_type: JOB_TYPE,
            lesson_text: text,
            impact_hint: 'Något att göra annorlunda nästa gång?',
            source: 'debrief',
          })),
        )
        .select('id')
      if (seedErr || !seeded) throw new Error(`Kunde inte seeda resterande lärdomar: ${seedErr?.message}`)
      ids.seededLessonIds = seeded.map((r) => r.id)

      const total = ids.lessonIds.length + ids.seededLessonIds.length
      expect(total, `minst MIN_SAMPLE_SIZE (${MIN_SAMPLE_SIZE}) lärdomar krävs för mönstersteget`).toBeGreaterThanOrEqual(
        MIN_SAMPLE_SIZE,
      )
      return `${ids.lessonIds.length} lärdomar via riktiga kortvägen + ${ids.seededLessonIds.length} seedade förutsättningar = ${total} (>= ${MIN_SAMPLE_SIZE}), kortet -> approved`
    })
  })

  test('Station 5 — Mönstret föreslås (riktig Haiku-detektion)', async () => {
    // Riktigt LLM-anrop + kortskapande — ge det mer än default-30s.
    test.setTimeout(90_000)
    await station('5', 'proposePattern → playbook_pattern_confirmation-kort', async () => {
      // Detektionen körs i TESTPROCESSEN (proposePattern importerad, inte
      // ett server-anrop) — utan nyckeln returnerar detectPattern null och
      // resultatet hade blivit en OSKILJBAR "inget mönster". Grinda hårt och
      // hänvisbart i stället.
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error(
          'ANTHROPIC_API_KEY saknas i testprocessens env (.env.test) — mönsterdetektionen är ett RIKTIGT ' +
            'Haiku-anrop som körs här i testet, inte på servern. FIX: lägg till ANTHROPIC_API_KEY i .env.test ' +
            'och kör om. (Detta är en infrastruktur-miss, inte "detektorn sa nej".)',
        )
      }

      const supabase = getSupabaseAdmin()
      const result = await proposePattern(supabase, DEMO_BUSINESS_ID, JOB_TYPE)

      if (result === 'skipped_no_pattern_found') {
        // Skiljs MEDVETET från infrastrukturfel: detektorn är promptad
        // "hellre missa än gissa" och ett hederligt nej är ett giltigt svar
        // — men för DEN HÄR lärdomsuppsättningen (sex omformuleringar av
        // exakt samma tema) betyder det att kedjan inte kunde bevisas.
        // OBS: detectPattern degraderar även nätverks-/API-fel till null —
        // kolla testloggen efter '[playbook/detect-pattern]'-varningar för
        // att skilja de två fallen.
        throw new Error(
          'DETEKTIONEN AVBÖJDE: Haiku fann inget mönster i de sex lärdomarna (proposePattern -> ' +
            "'skipped_no_pattern_found'). Infrastrukturen fungerade — detta är detektorns svar, inte ett kodfel. " +
            'Kolla dock testloggen efter [playbook/detect-pattern]-varningar: ett nätverks-/API-fel degraderas ' +
            'till samma resultat.',
        )
      }
      if (result !== 'created') {
        // Dedup-utfallen ska vara OMÖJLIGA med en unik job_type per körning
        // — träffas de är det ett isoleringsfel i testet, inte i produkten.
        throw new Error(
          `proposePattern -> '${result}' (förväntade 'created'). Med körningens unika job_type ska ingen ` +
            'dedup-spärr kunna träffas — detta pekar på ett isolerings- eller infrastrukturfel.',
        )
      }

      const card = await waitForRow<{
        id: string
        payload: { pattern_text: string; evidence_lesson_ids: string[]; sample_count: number }
      }>(
        'pending_approvals',
        { business_id: DEMO_BUSINESS_ID, approval_type: 'playbook_pattern_confirmation', status: 'pending' },
        {
          predicate: (r: any) => r.payload?.job_type === JOB_TYPE,
          label: 'playbook_pattern_confirmation-kortet',
        },
      )
      ids.patternCardId = card.id
      ids.patternText = card.payload.pattern_text

      // Belägget ska peka på KÖRNINGENS lärdomar — inget annat.
      const ourLessonIds = new Set([...ids.lessonIds, ...ids.seededLessonIds])
      const evidence = card.payload.evidence_lesson_ids || []
      expect(evidence.length, 'minst två oberoende belägg (kodgräns i parsePatternDetectionSvar)').toBeGreaterThanOrEqual(2)
      for (const lessonId of evidence) {
        expect(ourLessonIds.has(lessonId), `evidens ${lessonId} ska vara en av körningens lärdomar`).toBeTruthy()
      }
      return `kort ${card.id}: "${card.payload.pattern_text}" (${evidence.length} belägg, alla ur körningens ${ourLessonIds.size} lärdomar)`
    })
  })

  test('Station 6 — Ägaren bekräftar regeln (riktigt API)', async () => {
    await station('6', 'approve → business_knowledge(pattern)', async () => {
      const res = await ownerCtx.request.post(`/api/approvals/${ids.patternCardId}`, {
        data: { action: 'approve' },
      })
      const body = await res.json().catch(() => null)
      expect(res.ok(), `POST /api/approvals/:id svarade ${res.status()}: ${JSON.stringify(body)}`).toBeTruthy()

      const knowledge = await waitForRow<{ id: string; observation: string; data_basis: { evidence_lesson_ids: string[] } }>(
        'business_knowledge',
        { business_id: DEMO_BUSINESS_ID, knowledge_type: 'pattern', job_type: JOB_TYPE },
        { predicate: (r: any) => r.status === 'active', label: 'business_knowledge(pattern, active)' },
      )
      ids.knowledgeId = knowledge.id
      expect(knowledge.observation, 'regeln ska bära exakt kortets mönstertext').toBe(ids.patternText)
      await assertRow('pending_approvals', { id: ids.patternCardId!, status: 'approved' }, 'mönsterkortet -> approved')
      return `business_knowledge ${knowledge.id} (knowledge_type=pattern, job_type="${JOB_TYPE}", status=active)`
    })
  })

  test('Station 7 — Kickoffen föreslås (riktiga producenter)', async () => {
    await station('7', 'findKickoffCandidates + proposeKickoff → Lars-kort', async () => {
      const supabase = getSupabaseAdmin()
      // Samma svep som torsdags-cronen (app/api/cron/playbook-kickoff) kör.
      const candidates = await findKickoffCandidates(supabase, DEMO_BUSINESS_ID)
      const mine = candidates.find((c) => c.project_id === ids.activeProjectId)
      if (!mine) {
        throw new Error(
          `findKickoffCandidates hittade inte körningens aktiva projekt ${ids.activeProjectId} ` +
            `(${candidates.length} kandidater totalt) — projektet är aktivt, inom 14-dagarsfönstret och ` +
            'jobbtypen har ett aktivt mönster, så detta är ett produktfel eller isoleringsfel.',
        )
      }
      expect(mine.pattern_id, 'kandidaten ska peka på den nyss bekräftade regeln').toBe(ids.knowledgeId)
      // Evidensen ska citera RIKTIGA seedade källprojekt-namn.
      const citeradeSeedade = mine.source_project_names.filter((n) => ids.sourceProjectNames.includes(n))
      expect(
        citeradeSeedade.length,
        `source_project_names (${JSON.stringify(mine.source_project_names)}) ska citera minst ett seedat källprojekt`,
      ).toBeGreaterThanOrEqual(1)

      // ISOLERING: proposeKickoff anropas BARA för körningens egen kandidat.
      // Svepningen kan legitimt även hitta demokontots riktiga projekt (om
      // kontot har egna aktiva mönster) — de lämnas orörda; cronen äger dem.
      const result = await proposeKickoff(supabase, DEMO_BUSINESS_ID, mine)
      expect(result, 'proposeKickoff ska skapa kortet').toBe('created')

      const card = await waitForRow<{ id: string; payload: { source_project_names: string[]; pattern_id: string } }>(
        'pending_approvals',
        { business_id: DEMO_BUSINESS_ID, approval_type: 'playbook_kickoff_suggestion', status: 'pending' },
        {
          predicate: (r: any) => r.payload?.project_id === ids.activeProjectId,
          label: 'playbook_kickoff_suggestion-kortet',
        },
      )
      ids.kickoffCardId = card.id
      expect(card.payload.pattern_id, 'kortet ska bära regelns id').toBe(ids.knowledgeId)
      const kortCiterar = (card.payload.source_project_names || []).filter((n: string) =>
        ids.sourceProjectNames.includes(n),
      )
      expect(kortCiterar.length, 'kortets payload ska citera minst ett riktigt seedat källprojekt-namn').toBeGreaterThanOrEqual(1)
      return `kickoff-kort ${card.id} för ${ids.activeProjectId}, citerar: ${kortCiterar.join(', ')}`
    })
  })

  test('Station 8 — Kontrollpunkten landar (riktigt API) — loopen sluts', async () => {
    await station('8', 'approve → project_checklist — LOOPEN SLUTEN', async () => {
      const res = await ownerCtx.request.post(`/api/approvals/${ids.kickoffCardId}`, {
        data: { action: 'approve' },
      })
      const body = await res.json().catch(() => null)
      expect(res.ok(), `POST /api/approvals/:id svarade ${res.status()}: ${JSON.stringify(body)}`).toBeTruthy()

      const checklist = await waitForRow<{ id: string; items: Array<{ text: string }> }>(
        'project_checklist',
        { business_id: DEMO_BUSINESS_ID, project_id: ids.activeProjectId! },
        {
          predicate: (r: any) =>
            Array.isArray(r.items) && r.items.some((item: any) => item?.text === ids.patternText),
          label: 'project_checklist med mönstertexten',
        },
      )
      ids.checklistId = checklist.id
      await assertRow('pending_approvals', { id: ids.kickoffCardId!, status: 'approved' }, 'kickoff-kortet -> approved')

      // ── SLUTBEVISET: hela kedjan är obruten och länkad, id för id ──────
      expect(ids.lessonIds.length, 'lärdomar via riktiga kortvägen').toBeGreaterThanOrEqual(1)
      expect(ids.knowledgeId, 'regel-id').not.toBeNull()
      expect(ids.kickoffCardId, 'kickoff-kort-id').not.toBeNull()
      expect(ids.checklistId, 'kontrollpunkt-id').not.toBeNull()
      // Länkarna: lärdom → regelns evidens, regel → kickoff-kortets
      // pattern_id (verifierad i Station 7), regelns text → checklistpunkten.
      const knowledge = await assertRow<{ data_basis: { evidence_lesson_ids: string[] } }>(
        'business_knowledge',
        { id: ids.knowledgeId! },
        'regeln',
      )
      const ourLessonIds = new Set([...ids.lessonIds, ...ids.seededLessonIds])
      const evidenceInRun = (knowledge.data_basis?.evidence_lesson_ids || []).filter((lid: string) =>
        ourLessonIds.has(lid),
      )
      expect(evidenceInRun.length, 'regelns evidens ska länka till körningens lärdomar').toBeGreaterThanOrEqual(2)

      const kedja = `lärdom ${ids.lessonIds[0]} → regel ${ids.knowledgeId} → kickoff-kort ${ids.kickoffCardId} → kontrollpunkt ${ids.checklistId}`
      return `project_checklist ${checklist.id} bär "${ids.patternText}" i projekt ${ids.activeProjectId}. LOOPEN SLUTEN: ${kedja}`
    })
  })
})
