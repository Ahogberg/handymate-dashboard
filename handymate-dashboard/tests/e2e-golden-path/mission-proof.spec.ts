/**
 * Mission-beviset (Etapp M) — Mission Control-lyckovägen, hela vägen, mot
 * RIKTIG databas, inga mockade kort.
 *
 * ═══ KEDJAN SOM BEVISAS ═══
 *
 *   Förfallen faktura finns → möjlighetsportföljen (lib/mission/
 *   opportunity-portfolio.ts) ser den som ett indrivningsbart item →
 *   ägaren bekräftar ett uppdrag via den RIKTIGA confirm_mission-vägen
 *   (app/api/agent/trigger/tool-router.ts, samma funktion chatten anropar)
 *   → ett mission-stämplat godkännandekort skapas och godkänns → progressen
 *   (lib/mission/mission-progress.ts) visar fakturerat men inte betalt →
 *   fakturan betalas → progressen visar verifierat betalt och gap 0 →
 *   uppdraget avslutas → historiken (lib/mission/mission-facit.ts) visar
 *   ett lärandeberättigat facit med Karin krediterad → lärande-grinden
 *   (lib/mission/mission-learning.ts) säger ärligt "för tidigt" vid EN
 *   observation → ett misslyckat utfall syns lika ärligt i samma facit.
 *
 * ═══ "INGA MOCKADE KORT" — VAD SOM ÄR RIKTIGT ═══
 *
 * De två stegen som ÄR mission-produktens egen logik anropas som RIKTIGA
 * funktioner mot RIKTIG databas, aldrig handbyggda genvägar:
 *   - loadOpportunityPortfolioForBusiness (Station 2) — den faktiska
 *     sammanställningen chatten och tool-router.ts läser.
 *   - executeTool('confirm_mission', ...) (Station 3) — SAMMA funktion
 *     app/api/matte/chat/route.ts anropar när Matte bekräftar ett uppdrag;
 *     omvaliderar mot en färskt inläst portfölj precis som i produktion.
 *   - getMissionProgressWithDecisions / byggMissionFacit / listMissionFacit /
 *     byggLearningRows (Station 4-7) — de faktiska läsfunktionerna
 *     dashboarden och Mission Learning-panelen använder.
 *
 * ═══ DE TVÅ DOKUMENTERADE AVVIKELSERNA (pragmatiska val, se stationerna) ═══
 *
 * 1. Station 4 (godkännandet): Den RIKTIGA POST /api/approvals/[id]-vägen
 *    för 'invoice_reminder' kör deliverInvoiceReminder på riktigt — ett
 *    RIKTIGT SMS-försök via 46elks mot ett numera syntetiskt kundnummer.
 *    Den vägen är redan bevisad (flywheel.spec.ts, golden-path.spec.ts)
 *    för andra korttyper. Här stämplas kortet manuellt till
 *    'approved' + payload.execution_result — exakt den form
 *    mission-progress.ts/mission-facit.ts faktiskt läser (samma kontrakt
 *    som en verklig leverans skulle skriva).
 * 2. Station 5 (betalningen) och Station 6 (avslutet): De riktiga
 *    icke-HTTP-vägarna (lib/invoices/apply-payment.ts respektive
 *    POST /api/mission/[id]/resolve) drar in sidoeffekter det här beviset
 *    inte behöver för att vara sant — Fortnox-synk, pipeline-flytt,
 *    kundkommunikation (apply-payment) och en riktig UI-inloggning bara
 *    för en enradig statusflipp (resolve, redan skyddad av
 *    tests/permission-contract.spec.ts). Båda skriver här EXAKT samma
 *    kolumner som respektive riktiga väg skulle skriva (status + paid_at
 *    / status + resolved_at) — dokumenterat i respektive station.
 *
 * ═══ ISOLERING ═══
 *
 * Alla rader skapas av OSS via service-role och deras id:n fångas
 * SYNKRONT (ingen producent skriver asynkront här) — ingen waitForRow-
 * polling behövs. RUN_TS-markören finns i fakturanumret + kortens titlar
 * för en sista svepningskontroll i städningen. Ingen `test_`/`e2e_`-prefix
 * någonstans i id:n som portföljens testdatafilter (lib/testdata.ts)
 * skulle kunna filtrera bort — se Station 1:s kommentar.
 *
 * ═══ KÖRKRAV ═══
 *
 *   - sql/v144_mission.sql, v145_mission_capacity_goal.sql,
 *     v146_mission_contact_goal.sql KÖRDA (Station 0 grindar hårt).
 *   - SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY i .env.test.
 *   - Inget beroende av ANTHROPIC_API_KEY eller en UI-inloggning — hela
 *     kedjan körs via service-role + direkta funktionsanrop, se ovan.
 *
 * Körs ENDAST via: npx playwright test --project=mission-proof
 */
import * as fs from 'fs'
import * as path from 'path'
import { test, expect } from '@playwright/test'
import {
  getSupabaseAdmin,
  assertRow,
  DEMO_BUSINESS_ID,
  E2E_TEST_EMAIL,
} from './fixtures/db'
import type { Verdict } from './fixtures/report'
// De RIKTIGA produktionsfunktionerna — själva poängen med testet.
import { loadOpportunityPortfolioForBusiness } from '@/lib/mission/opportunity-portfolio'
import { executeTool } from '@/app/api/agent/trigger/tool-router'
import { getMissionProgressWithDecisions, type MissionRow } from '@/lib/mission/mission-progress'
import { byggMissionFacit, listMissionFacit, type MissionFacit } from '@/lib/mission/mission-facit'
import { byggLearningRows } from '@/lib/mission/mission-learning'
import { getNextCustomerNumber } from '@/lib/numbering'
import { svDateStr, svDateStrPlusDays } from '@/lib/dates'
// Mission Mandates V1 (Etapp X) — RIKTIGA funktionerna, mot sql/v150.
import { computePlanHash, mandateCovers, deriveMandateUsage, type MandateRow } from '@/lib/mandates/mission-mandate'
import { loadMandateResolutionCache, resolveMandateForAction } from '@/lib/mandates/resolve'
import { loadMandateFacit } from '@/lib/mandates/load-mandate-facit'

// ── Rapport — egen fil, samma jsonl-append-mönster som flywheel.spec.ts,
// egen katalog så ingen annan harness-rapport skrivs över. ─────────────────
const REPORT_DIR = path.join(process.cwd(), 'test-results', 'mission-proof')
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
    `[mission-proof] ${row.verdict === 'PASS' ? '✅' : row.verdict === 'SKIP' ? '⏭' : '🔴'} ` +
      `${row.station} — ${row.steg}${row.detalj ? ' — ' + row.detalj : ''}`,
  )
}

// ── Körningens identitet ───────────────────────────────────────────────────
const RUN_TS = Date.now()
// INGEN 'E2E'/'Testkund'-substräng — arTestNamn (lib/testdata.ts) skulle
// gömma kunden/fakturan för möjlighetsportföljen, och det är exakt den
// portföljen det här beviset testar. RUN_TS gör markören ändå kirurgiskt
// unik för städningen.
const MARKER = `Missionsbevis ${RUN_TS}`
const KUND_NAMN = `${MARKER} Kund`
const INVOICE_NUMBER = `MP-${RUN_TS}`
const INVOICE_TOTAL = 12345

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 11)}`
}

let allStationsOk = true

const ids: {
  customerId: string | null
  invoiceId: string | null
  missionId: string | null
  approvalId: string | null
  failedApprovalId: string | null
  mandateId: string | null
  mandateApprovalId: string | null
} = {
  customerId: null,
  invoiceId: null,
  missionId: null,
  approvalId: null,
  failedApprovalId: null,
  mandateId: null,
  mandateApprovalId: null,
}

/** Samma stations-wrapper som flywheel.spec.ts — bokför + kastar vidare,
    och grupperar via test.step för traceviewen. */
async function station(nr: string, steg: string, body: () => Promise<string>): Promise<void> {
  try {
    const bevis = await test.step(`Station ${nr} — ${steg}`, body)
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

test.describe.serial('Mission-beviset — Mission Control-lyckovägen mot riktig databas', () => {
  test.beforeAll(() => {
    resetReport()
  })

  // ── Städning — körs ALLTID. Alla id:n fångades synkront (inga
  // producenter skriver asynkront här) så ingen orphan-svepning krävs för
  // att HITTA raderna — bara för att BEVISA att inga blev kvar. ──────────
  test.afterAll(async () => {
    const supabase = getSupabaseAdmin()
    const leftover: string[] = []
    const del = async (table: string, column: string, value: string | null) => {
      if (!value) return
      const { error } = await supabase.from(table).delete().eq(column, value)
      if (error) leftover.push(`${table}:${value} (${error.message})`)
    }

    try {
      if (ids.mandateApprovalId) await del('pending_approvals', 'id', ids.mandateApprovalId)
      if (ids.mandateId) await del('mission_mandate', 'id', ids.mandateId)
      if (ids.approvalId) await del('pending_approvals', 'id', ids.approvalId)
      if (ids.failedApprovalId) await del('pending_approvals', 'id', ids.failedApprovalId)
      if (ids.missionId) await del('mission', 'id', ids.missionId)
      if (ids.invoiceId) await del('invoice', 'invoice_id', ids.invoiceId)
      if (ids.customerId) await del('customer', 'customer_id', ids.customerId)

      // ── Verifiering: NOLL rader kvar med körningens markörer. ──────────
      if (ids.approvalId || ids.failedApprovalId || ids.mandateApprovalId) {
        const trackedApprovalIds = [ids.approvalId, ids.failedApprovalId, ids.mandateApprovalId].filter((v): v is string => !!v)
        const { data: cardsLeft, error: cardsErr } = await supabase
          .from('pending_approvals')
          .select('id')
          .in('id', trackedApprovalIds)
        if (cardsErr) leftover.push(`pending_approvals-räkningen: ${cardsErr.message}`)
        if ((cardsLeft || []).length > 0) leftover.push(`${(cardsLeft || []).length} pending_approvals-rader kvar`)
      }
      if (ids.mandateId) {
        const { data: mandateLeft, error: mandateErr } = await supabase
          .from('mission_mandate')
          .select('id')
          .eq('id', ids.mandateId)
        // 42P01 (v150 aldrig körd — stationen skippades då) är INTE ett städningsfel.
        if (mandateErr && mandateErr.code !== '42P01') leftover.push(`mission_mandate-räkningen: ${mandateErr.message}`)
        if ((mandateLeft || []).length > 0) leftover.push(`mission_mandate-raden ${ids.mandateId} kvar`)
      }
      if (ids.missionId) {
        const { data: missionLeft, error: missionErr } = await supabase
          .from('mission')
          .select('id')
          .eq('id', ids.missionId)
        if (missionErr && missionErr.code !== '42P01') leftover.push(`mission-räkningen: ${missionErr.message}`)
        if ((missionLeft || []).length > 0) leftover.push(`mission-raden ${ids.missionId} kvar`)
      }
      const { data: invoicesLeft, error: invLeftErr } = await supabase
        .from('invoice')
        .select('invoice_id')
        .eq('business_id', DEMO_BUSINESS_ID)
        .eq('invoice_number', INVOICE_NUMBER)
      if (invLeftErr) leftover.push(`invoice-räkningen: ${invLeftErr.message}`)
      if ((invoicesLeft || []).length > 0) leftover.push(`${(invoicesLeft || []).length} invoice-rader kvar med invoice_number=${INVOICE_NUMBER}`)
      if (ids.customerId) {
        const { data: custLeft, error: custErr } = await supabase
          .from('customer')
          .select('customer_id')
          .eq('customer_id', ids.customerId)
        if (custErr) leftover.push(`customer-räkningen: ${custErr.message}`)
        if ((custLeft || []).length > 0) leftover.push(`kunden ${ids.customerId} kvar`)
      }
    } catch (err) {
      leftover.push(`städningen kastade: ${err instanceof Error ? err.message : String(err)}`)
    }

    pushResult({
      station: 'Städning',
      steg: 'mission-proof.spec.ts afterAll',
      bevis: '',
      verdict: leftover.length > 0 ? 'FAIL' : 'PASS',
      detalj:
        leftover.length > 0
          ? `Kunde inte städa: ${leftover.join('; ')}`
          : `Alla rader från körningen (${MARKER}) borta — verifierat med selects, inte antaget.` +
            (allStationsOk ? '' : ' (En station föll — städningen körde ändå fullt ut.)'),
    })
  })

  test('Station 0 — v144/v145/v146-grinden', async () => {
    await station('0', 'v144/v145/v146-grinden (mission.goal_type + goal_count)', async () => {
      const supabase = getSupabaseAdmin()
      // limit(0): rör ingen rad, provocerar bara kolumnuppslaget. PostgREST
      // svarar 42P01 (tabellen saknas, v144 aldrig körd) eller 42703
      // (kolumnen saknas, v145/v146 aldrig körda).
      const { error } = await supabase.from('mission').select('goal_type, goal_count').limit(0)
      if (error) {
        if (error.code === '42P01') {
          throw new Error(
            'mission-tabellen SAKNAS — sql/v144_mission.sql är inte körd. ' +
              'FIX: kör sql/v144_mission.sql (sedan v145 + v146) i Supabase SQL Editor och kör om testet.',
          )
        }
        if (error.code === '42703') {
          throw new Error(
            'mission.goal_type eller mission.goal_count SAKNAS — sql/v145_mission_capacity_goal.sql och/eller ' +
              'sql/v146_mission_contact_goal.sql är inte körda. FIX: kör dem i Supabase SQL Editor och kör om testet.',
          )
        }
        throw new Error(`Oväntat DB-fel vid v144/v145/v146-grinden: ${error.code ?? '?'} ${error.message}`)
      }
      return 'mission.goal_type + mission.goal_count finns (select limit 0 utan fel) — v144/v145/v146 är körda'
    })
  })

  test('Station 1 — Skapa förfallen testfaktura', async () => {
    await station('1', 'Kund + förfallen faktura, riktig business_id, riktig kanonisk förfallet-form', async () => {
      const supabase = getSupabaseAdmin()

      // Kunden — körunik telefon (samma skäl som flywheel.spec.ts: den
      // delade E2E_TEST_PHONE kolliderar med en befintlig kund).
      const customerNumber = await getNextCustomerNumber(supabase, DEMO_BUSINESS_ID)
      const { data: customer, error: custErr } = await supabase
        .from('customer')
        .insert({
          customer_id: genId('mpcust'),
          business_id: DEMO_BUSINESS_ID,
          name: KUND_NAMN,
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

      // Fakturan — den KANONISKA förfallet-formen (app/api/dashboard/pengar/
      // route.ts + lib/mission/opportunity-portfolio.ts:s repository): status
      // i (sent, overdue) OCH due_date < idag. invoice_id bär INGEN
      // test_/e2e_-prefix (lib/testdata.ts:s arTestId skulle annars gömma
      // fakturan för portföljen — RUN_TS-markören sitter i invoice_number
      // i stället, ett fält portföljens filter aldrig rör).
      const { data: invoice, error: invErr } = await supabase
        .from('invoice')
        .insert({
          invoice_id: genId('mpinv'),
          business_id: DEMO_BUSINESS_ID,
          customer_id: ids.customerId,
          invoice_number: INVOICE_NUMBER,
          invoice_type: 'standard',
          status: 'sent',
          items: [
            {
              id: 'ii_mp1',
              item_type: 'item',
              description: 'Missionsbevis — testrad',
              quantity: 1,
              unit: 'st',
              unit_price: INVOICE_TOTAL,
              total: INVOICE_TOTAL,
              type: 'material',
              is_rot_eligible: false,
            },
          ],
          subtotal: INVOICE_TOTAL,
          vat_rate: 0,
          vat_amount: 0,
          total: INVOICE_TOTAL,
          customer_pays: INVOICE_TOTAL,
          rot_rut_type: null,
          invoice_date: svDateStrPlusDays(-30),
          due_date: svDateStrPlusDays(-14),
        })
        .select('invoice_id')
        .single()
      if (invErr || !invoice) throw new Error(`Kunde inte seeda fakturan: ${invErr?.message}`)
      ids.invoiceId = invoice.invoice_id

      return `kund ${ids.customerId}, förfallen faktura ${ids.invoiceId} (${INVOICE_NUMBER}, ${INVOICE_TOTAL} kr, förföll ${svDateStrPlusDays(-14)})`
    })
  })

  test('Station 2 — Portföljen ser den', async () => {
    await station('2', 'loadOpportunityPortfolioForBusiness → indrivningsbart-item', async () => {
      const supabase = getSupabaseAdmin()
      const portfolio = await loadOpportunityPortfolioForBusiness(supabase, DEMO_BUSINESS_ID)

      const item = portfolio.by_class.indrivningsbart.find(i => i.evidence.ref_id === ids.invoiceId)
      if (!item) {
        throw new Error(
          `Portföljen innehöll INGET indrivningsbart-item med evidence.ref_id=${ids.invoiceId} ` +
            `(${portfolio.by_class.indrivningsbart.length} indrivningsbara items totalt, ` +
            `degraded_sources: ${JSON.stringify(portfolio.degraded_sources)}). ` +
            'Antingen läser portföljen inte fakturan, eller så filtrerade testdatafiltret bort den — riktigt produktfel om filtren är korrekta.',
        )
      }
      expect(item.measure.kind, 'indrivningsbart ska alltid vara ett kr-mått').toBe('kr')
      expect(item.measure.kind === 'kr' && item.measure.amountKr, 'beloppet ska vara fakturans totalbelopp').toBe(INVOICE_TOTAL)
      expect(item.evidence.table).toBe('invoice')
      expect(item.approval_type).toBe('invoice_reminder')

      return `item ${item.id}: evidence.ref_id=${item.evidence.ref_id}, amountKr=${item.measure.kind === 'kr' ? item.measure.amountKr : '?'}`
    })
  })

  test('Station 3 — Uppdraget skapas via den RIKTIGA vägen', async () => {
    await station('3', 'executeTool(confirm_mission) → mission-rad', async () => {
      const supabase = getSupabaseAdmin()
      const portfolio = await loadOpportunityPortfolioForBusiness(supabase, DEMO_BUSINESS_ID)
      const item = portfolio.by_class.indrivningsbart.find(i => i.evidence.ref_id === ids.invoiceId)
      if (!item) throw new Error(`item för fakturan ${ids.invoiceId} försvann ur portföljen mellan Station 2 och 3`)

      const deadline = svDateStrPlusDays(7)
      // Minimal ToolContext (interfacet är inte exporterat ur tool-router.ts
      // — strukturell typning räcker, executeTool bryr sig bara om formen).
      const toolContext = {
        businessName: 'Handymate Demo',
        contactEmail: 'demo@handymate.se',
        googleConnection: null,
        triggerSource: 'system' as const,
      }

      const result = await executeTool(
        'confirm_mission',
        {
          goal_kr: INVOICE_TOTAL, // Matchar fakturans belopp exakt — gap_kr blir 0 efter betalning i Station 5.
          deadline,
          steps: [{ item_id: item.id, motivation: `Missionsbevis ${RUN_TS} — driv in den förfallna fakturan` }],
        },
        supabase,
        DEMO_BUSINESS_ID,
        toolContext,
      )

      if (!result.success) {
        throw new Error(
          `confirm_mission svarade success:false — "${(result as { error?: string }).error}". ` +
            'Om felet är "Det finns redan ett aktivt uppdrag" är detta INTE ett testfel: demokontot har redan ' +
            'ett aktivt uppdrag från riktig användning och testet vägrar hellre kollidera med det än att avsluta ' +
            'det åt användaren. Avsluta det aktiva uppdraget manuellt och kör om.',
        )
      }
      const data = result.data as { mission_id: string; next_instruction: string; presentation: { state: string } }
      expect(data.mission_id, 'mission_id ska bära mis_-prefixet confirm_mission genererar').toMatch(/^mis_/)
      expect(data.next_instruction, 'koordineringsstarten ska peka på mission_id').toContain(data.mission_id)
      expect(data.presentation.state).toBe('confirmed')
      ids.missionId = data.mission_id

      const mission = await assertRow<MissionRow>('mission', { id: ids.missionId }, 'den nya mission-raden')
      expect(mission.status).toBe('active')
      expect(Number(mission.goal_kr)).toBe(INVOICE_TOTAL)
      const steps = mission.plan_snapshot?.steps ?? []
      expect(steps.length).toBe(1)
      expect(steps[0].evidence?.ref_id).toBe(ids.invoiceId)
      expect(steps[0].truth_class).toBe('indrivningsbart')

      return `mission ${ids.missionId} (goal_kr=${mission.goal_kr}, deadline=${mission.deadline}), plan_snapshot refererar faktura ${ids.invoiceId}`
    })
  })

  test('Station 4 — Mission-stämplat kort + godkännande + attribution', async () => {
    await station('4', 'pending_approvals(invoice_reminder, mission-stämplad) → godkänd → progress', async () => {
      const supabase = getSupabaseAdmin()

      // ── AVVIKELSE (dokumenterad i filhuvudet): den RIKTIGA POST /api/
      // approvals/[id]-vägen kör deliverInvoiceReminder på riktigt (ett
      // SMS-försök via 46elks) — redan bevisad av flywheel.spec.ts/
      // golden-path.spec.ts för andra korttyper. Kortet skapas här med
      // exakt den payload-form mission-progress.ts/mission-facit.ts läser,
      // och stämplas direkt till 'approved' med samma execution_result-
      // kontrakt en riktig leverans skulle skriva.
      const { data: approval, error: apprErr } = await supabase
        .from('pending_approvals')
        .insert({
          id: genId('mpappr'),
          business_id: DEMO_BUSINESS_ID,
          approval_type: 'invoice_reminder',
          title: `${MARKER} — betalningspåminnelse ${INVOICE_NUMBER}`,
          description: `Faktura ${INVOICE_NUMBER} är förfallen. Missionsbevis-körning ${RUN_TS}.`,
          status: 'pending',
          risk_level: 'medium',
          payload: {
            mission_id: ids.missionId,
            truth_class: 'indrivningsbart',
            invoice_id: ids.invoiceId,
            autonomy_key: 'invoice_reminder',
          },
        })
        .select('id')
        .single()
      if (apprErr || !approval) throw new Error(`Kunde inte skapa mission-kortet: ${apprErr?.message}`)
      ids.approvalId = approval.id

      const { error: resolveErr } = await supabase
        .from('pending_approvals')
        .update({
          status: 'approved',
          resolved_at: new Date().toISOString(),
          payload: {
            mission_id: ids.missionId,
            truth_class: 'indrivningsbart',
            invoice_id: ids.invoiceId,
            autonomy_key: 'invoice_reminder',
            execution_result: { outcome: 'success', artifacts: { invoice_id: ids.invoiceId } },
          },
        })
        .eq('id', ids.approvalId)
      if (resolveErr) throw new Error(`Kunde inte godkänna mission-kortet: ${resolveErr.message}`)

      const mission = await assertRow<MissionRow>('mission', { id: ids.missionId }, 'uppdraget')
      const { progress } = await getMissionProgressWithDecisions(supabase, mission)

      const klass = progress.per_class.indrivningsbart
      if (!klass) throw new Error('progress.per_class.indrivningsbart saknas helt — attributionen hittade ingenting')
      expect(klass.invoiced_kr, 'fakturerat ska vara fakturans belopp (fakturan är skickad, inte utkast)').toBe(INVOICE_TOTAL)
      expect(klass.verified_paid_kr, 'inget verifierat betalt än — fakturan är inte betald').toBe(0)
      expect(progress.decisions_outstanding, 'kortet är godkänt, inget väntar').toBe(0)

      return `kort ${ids.approvalId} approved, progress: invoiced_kr=${klass.invoiced_kr}, verified_paid_kr=${klass.verified_paid_kr}, decisions_outstanding=${progress.decisions_outstanding}`
    })
  })

  test('Station 5 — Betalning via riktiga skrivvägen', async () => {
    await station('5', 'invoice → paid → progress verifierat betalt + gap 0', async () => {
      const supabase = getSupabaseAdmin()

      // ── AVVIKELSE (dokumenterad i filhuvudet): den riktiga icke-HTTP-
      // vägen (lib/invoices/apply-payment.ts:s applyInvoicePayment) drar in
      // Fortnox-synk, pipeline-flytt och kundkommunikation den här fakturan
      // varken har eller behöver (inget fortnox_invoice_number, ingen
      // kopplad affär/projekt) — och den skapar sin egen Supabase-klient
      // via NEXT_PUBLIC_SUPABASE_URL, som INTE är satt i .env.test (bara
      // SUPABASE_URL, se fixtures/db.ts:s egen fallback-kedja). Skriver
      // därför EXAKT samma kolumner den funktionen skriver till invoice-
      // raden (status + paid_at) — inga sidoeffekter, samma sanning.
      const paidAt = new Date().toISOString()
      const { error: payErr } = await supabase
        .from('invoice')
        .update({
          status: 'paid',
          paid_at: paidAt,
          manual_paid_marked_at: paidAt,
          manual_paid_by_user_id: null,
        })
        .eq('invoice_id', ids.invoiceId)
        .eq('business_id', DEMO_BUSINESS_ID)
      if (payErr) throw new Error(`Kunde inte markera fakturan betald: ${payErr.message}`)

      const mission = await assertRow<MissionRow>('mission', { id: ids.missionId }, 'uppdraget')
      const { progress } = await getMissionProgressWithDecisions(supabase, mission)
      const klass = progress.per_class.indrivningsbart
      if (!klass) throw new Error('progress.per_class.indrivningsbart saknas helt efter betalning')
      expect(klass.verified_paid_kr, 'fakturan är direktrefererad, betald inom uppdragsfönstret').toBe(INVOICE_TOTAL)
      expect(progress.gap_kr, 'max(0, goal_kr - verifierat betalt) = max(0, 0)').toBe(0)

      return `faktura ${ids.invoiceId} betald ${paidAt}, progress: verified_paid_kr=${klass.verified_paid_kr}, gap_kr=${progress.gap_kr}`
    })
  })

  test('Station 6 — Slutförande + historik + lärandeunderlag', async () => {
    await station('6', 'mission → completed → byggMissionFacit/listMissionFacit + byggLearningRows', async () => {
      const supabase = getSupabaseAdmin()

      // ── AVVIKELSE (dokumenterad i filhuvudet): POST /api/mission/[id]/
      // resolve är redan en trivial, permissionsgrindad statusflipp utan
      // externa sidoeffekter (till skillnad från Station 5) — men att kräva
      // en riktig UI-inloggning bara för den raden hade gjort testet
      // beroende av DEMO_OWNER_PASSWORD + browserflakighet utan nytt bevis
      // (rollgrinden är redan låst av tests/permission-contract.spec.ts).
      // Skriver därför exakt vad routen skriver.
      const resolvedAt = new Date().toISOString()
      const { error: resolveErr } = await supabase
        .from('mission')
        .update({ status: 'completed', resolved_at: resolvedAt })
        .eq('id', ids.missionId)
        .eq('business_id', DEMO_BUSINESS_ID)
        .eq('status', 'active')
      if (resolveErr) throw new Error(`Kunde inte avsluta uppdraget: ${resolveErr.message}`)

      const facitLista = await listMissionFacit(supabase, DEMO_BUSINESS_ID, 20)
      const facit = facitLista.find(f => f.mission_id === ids.missionId)
      if (!facit) throw new Error(`listMissionFacit gav ingen rad för mission ${ids.missionId} (${facitLista.length} rader totalt)`)

      expect(facit.status).toBe('completed')
      expect(facit.learning_eligible, `borde vara lärandeberättigat, blockers: ${JSON.stringify(facit.learning_blockers)}`).toBe(true)
      expect(facit.learning_blockers).toEqual([])
      expect(facit.slutgap_kr, 'slutgapet ska vara 0 — hela målet verifierat betalt').toBe(0)
      expect(facit.verifierat_betalt_kr).toBe(INVOICE_TOTAL)

      const karin = facit.per_agent.find(a => a.agent_key === 'karin')
      if (!karin) throw new Error(`per_agent saknar karin helt — ${JSON.stringify(facit.per_agent)}`)
      expect(karin.utforda, 'Karins godkända invoice_reminder-kort ska räknas som utfört').toBeGreaterThanOrEqual(1)

      // byggMissionFacit direkt (ren kärna) ska ge samma svar som
      // listMissionFacit (fail-soft I/O-lagret) för samma uppdrag.
      const missionRow = await assertRow<MissionRow>('mission', { id: ids.missionId }, 'det avslutade uppdraget')
      const { loadMissionProgressInputs } = await import('@/lib/mission/mission-progress')
      const inputs = await loadMissionProgressInputs(supabase, missionRow, Date.now())
      const direktFacit = byggMissionFacit({ mission: missionRow, ...inputs, nowMs: Date.now() })
      expect(direktFacit.learning_eligible).toBe(true)
      expect(direktFacit.slutgap_kr).toBe(0)

      // ── Lärande-grinden: EN observation räcker aldrig (MIN_ELIGIBLE_PER_
      // GOAL_TYPE = 3) — grinden SJÄLV är en del av det som bevisas här.
      const learning = byggLearningRows([facit])
      expect(learning.antalEligible).toBe(1)
      expect(learning.forTidigt, 'ett enda avslutat pengauppdrag ska ALDRIG räcka för en lärandrad').toBe(true)
      expect(learning.rows).toEqual([])

      return `facit: status=completed, learning_eligible=true, slutgap_kr=0, karin.utforda=${karin.utforda}; ` +
        `byggLearningRows(1 facit): forTidigt=true (grinden höll, kräver ${3})`
    })
  })

  test('Station 7 — Misslyckat utfall syns', async () => {
    await station('7', 'ett andra, misslyckat mission-kort → per_agent.kunde_inte_verifieras', async () => {
      const supabase = getSupabaseAdmin()

      const { data: failedApproval, error: apprErr } = await supabase
        .from('pending_approvals')
        .insert({
          id: genId('mpappr'),
          business_id: DEMO_BUSINESS_ID,
          approval_type: 'invoice_reminder',
          title: `${MARKER} — misslyckad uppföljning`,
          description: `Missionsbevis-körning ${RUN_TS} — avsiktligt misslyckat utfall för facit-provet.`,
          status: 'approved',
          risk_level: 'medium',
          resolved_at: new Date().toISOString(),
          payload: {
            mission_id: ids.missionId,
            truth_class: 'indrivningsbart',
            // Ingen invoice_id-artefakt — detta korts poäng är att INTE
            // attribuera några kronor, bara ett misslyckat utfall.
            execution_result: { outcome: 'failed', error: 'Missionsbevis: avsiktligt simulerat misslyckande' },
          },
        })
        .select('id')
        .single()
      if (apprErr || !failedApproval) throw new Error(`Kunde inte skapa det misslyckade kortet: ${apprErr?.message}`)
      ids.failedApprovalId = failedApproval.id

      const facitLista = await listMissionFacit(supabase, DEMO_BUSINESS_ID, 20)
      const facit = facitLista.find(f => f.mission_id === ids.missionId)
      if (!facit) throw new Error(`listMissionFacit gav ingen rad för mission ${ids.missionId} efter det misslyckade kortet`)

      const karin = facit.per_agent.find(a => a.agent_key === 'karin')
      if (!karin) throw new Error(`per_agent saknar karin helt — ${JSON.stringify(facit.per_agent)}`)
      expect(karin.kunde_inte_verifieras, 'det misslyckade kortet ska synas ärligt, inte tystas eller räknas som utfört').toBeGreaterThanOrEqual(1)
      // Slutgapet/verifierat betalt ska vara OFÖRÄNDRAT — det misslyckade
      // kortet bär ingen invoice_id-artefakt och kan alltså aldrig
      // attribuera kronor, lyckade eller ej.
      expect(facit.slutgap_kr).toBe(0)
      expect(facit.verifierat_betalt_kr).toBe(INVOICE_TOTAL)

      return `misslyckat kort ${ids.failedApprovalId}: karin.kunde_inte_verifieras=${karin.kunde_inte_verifieras}, slutgap_kr oförändrat (${facit.slutgap_kr})`
    })
  })

  test('Station 8 — Mandatstationen (Mission Mandates V1, Etapp X, kräver sql/v150)', async () => {
    // ── Station-0-idiomet, men med SKIP i stället för FAIL: v150 är EN NY,
    // manuellt körd migration (till skillnad från v144/145/146 som Station 0
    // gatar hårt) — dess frånvaro är ett väntat, ofarligt läge i miljöer som
    // inte hunnit köra den, inte ett produktionsfel. Se planens explicita
    // instruktion: "skip-with-clear-message on 42P01".
    const supabase = getSupabaseAdmin()
    const probe = await supabase.from('mission_mandate').select('id').limit(0)
    if (probe.error?.code === '42P01') {
      pushResult({
        station: '8',
        steg: 'mission_mandate-grinden (sql/v150)',
        bevis: '',
        verdict: 'SKIP',
        detalj:
          'mission_mandate-tabellen SAKNAS — sql/v150_mission_mandate.sql är inte körd i den här miljön. ' +
          'FIX: kör sql/v150_mission_mandate.sql i Supabase SQL Editor och kör om testet för att bevisa mandatstationen.',
      })
      return
    }

    // Mandatet gäller det uppdrag Station 3 skapade — kräver att det uppdraget
    // fortfarande finns (körs allra sist, efter mission redan avslutats i
    // Station 6; det påverkar inte mandatlogiken, se stationens kommentar).
    if (!ids.missionId || !ids.invoiceId) {
      throw new Error('Station 8 kräver ids.missionId/ids.invoiceId från Station 1-3 — kunde inte köras isolerat')
    }

    const mission = await assertRow<MissionRow>('mission', { id: ids.missionId }, 'uppdraget (för plan_hash)')
    const steps = mission.plan_snapshot?.steps ?? []
    const planHash = computePlanHash(steps)
    ids.mandateId = `mnd_mp_${RUN_TS}`

    await station('8a', 'Mandatrad skapas direkt (service client), giltig för fakturans invoice_reminder-steg', async () => {
      const nowIso = new Date().toISOString()
      const { error } = await supabase.from('mission_mandate').insert({
        id: ids.mandateId,
        business_id: DEMO_BUSINESS_ID,
        mission_id: ids.missionId,
        plan_hash: planHash,
        allowed_action_types: ['invoice_reminder'],
        targets: { invoice_ids: [ids.invoiceId] },
        daily_cap: 5,
        total_cap: 20,
        amount_cap_kr: null,
        expires_at: svDateStrPlusDays(30),
        status: 'active',
        created_at: nowIso,
      })
      if (error) throw new Error(`Kunde inte skapa mandatraden: ${error.message}`)
      const row = await assertRow<MandateRow>('mission_mandate', { id: ids.mandateId }, 'den nya mandatraden')
      if (row.status !== 'active') throw new Error(`Mandatet skapades men status är "${row.status}", väntade "active"`)
      return `mandat ${ids.mandateId} skapat, plan_hash=${planHash.slice(0, 16)}…, mål=[${ids.invoiceId}]`
    })

    await station(
      '8b',
      'resolveMandateForAction (RIKTIGA caller-integrationen) täcker det namngivna målet',
      async () => {
        const cache = await loadMandateResolutionCache(supabase, DEMO_BUSINESS_ID)
        if (!cache.mandates.some(m => m.id === ids.mandateId)) {
          throw new Error(`loadMandateResolutionCache hittade inte det nyss skapade mandatet ${ids.mandateId}`)
        }
        const result = await resolveMandateForAction(supabase, DEMO_BUSINESS_ID, cache, {
          actionKey: 'invoice_reminder',
          targetRef: ids.invoiceId!,
          amountKr: 5000,
          nowIso: new Date().toISOString(),
        })
        if (!result.covered) throw new Error(`Väntade covered:true för det namngivna målet, fick: ${JSON.stringify(result)}`)
        if (result.mandate.id !== ids.mandateId) throw new Error(`Fel mandat matchade: ${result.mandate.id}`)
        return `resolveMandateForAction → covered:true, mandate.id=${result.mandate.id}`
      },
    )

    await station('8c', 'mandateCovers avvisar ett FRÄMMANDE mål med orsaken mal_utanfor', async () => {
      const mandateRow = await assertRow<MandateRow>('mission_mandate', { id: ids.mandateId }, 'mandatet')
      const result = mandateCovers(mandateRow, {
        actionKey: 'invoice_reminder',
        targetRef: `mp_frammande_faktura_${RUN_TS}`,
        amountKr: 5000,
        nowIso: new Date().toISOString(),
        dailyUsed: 0,
        totalUsed: 0,
      })
      if (result.covered || result.reason !== 'mal_utanfor') {
        throw new Error(`Väntade { covered:false, reason:'mal_utanfor' }, fick: ${JSON.stringify(result)}`)
      }
      return `mandateCovers(främmande mål) → covered:false, reason=${result.reason}`
    })

    await station('8d', 'over-cap-simulering: deriveMandateUsage → totalUsed når total_cap → mandateCovers avvisar (totaltak)', async () => {
      const mandateRow = await assertRow<MandateRow>('mission_mandate', { id: ids.mandateId }, 'mandatet')
      const nowIso = new Date().toISOString()
      // 20 syntetiska godkända mandat-kort, utspridda över flera dagar så
      // dailyUsed hålls under daily_cap (5) medan totalUsed når total_cap (20)
      // — renodlad in-memory-simulering, precis som planen ber om
      // ("over-cap simulation via deriveMandateUsage inputs").
      const syntheticCards = Array.from({ length: 20 }, (_, i) => ({
        created_at: svDateStrPlusDays(-(i + 1)) + 'T08:00:00.000Z',
        payload: { mandate_id: mandateRow.id },
        status: 'auto_approved',
      }))
      const usage = deriveMandateUsage(syntheticCards, nowIso)
      if (usage.totalUsed !== 20) throw new Error(`deriveMandateUsage gav totalUsed=${usage.totalUsed}, väntade 20`)
      const result = mandateCovers(mandateRow, {
        actionKey: 'invoice_reminder',
        targetRef: ids.invoiceId!,
        amountKr: 5000,
        nowIso,
        dailyUsed: usage.dailyUsed,
        totalUsed: usage.totalUsed,
      })
      if (result.covered || result.reason !== 'totaltak') {
        throw new Error(`Väntade { covered:false, reason:'totaltak' } vid totalUsed=20/total_cap=20, fick: ${JSON.stringify(result)}`)
      }
      return `deriveMandateUsage(20 syntetiska kort) → totalUsed=20, dailyUsed=${usage.dailyUsed}; mandateCovers → reason=totaltak`
    })

    await station('8e', 'återkallelse (riktig DB-skrivning) → mandateCovers avvisar med aterkallat', async () => {
      const { error } = await supabase
        .from('mission_mandate')
        .update({ status: 'revoked', revoked_at: new Date().toISOString() })
        .eq('id', ids.mandateId)
        .eq('business_id', DEMO_BUSINESS_ID)
      if (error) throw new Error(`Kunde inte återkalla mandatet: ${error.message}`)
      const revoked = await assertRow<MandateRow>('mission_mandate', { id: ids.mandateId }, 'det återkallade mandatet')
      if (revoked.status !== 'revoked') throw new Error(`Väntade status='revoked' efter uppdateringen, fick '${revoked.status}'`)
      const result = mandateCovers(revoked, {
        actionKey: 'invoice_reminder',
        targetRef: ids.invoiceId!,
        amountKr: 5000,
        nowIso: new Date().toISOString(),
        dailyUsed: 0,
        totalUsed: 0,
      })
      if (result.covered || result.reason !== 'aterkallat') {
        throw new Error(`Väntade { covered:false, reason:'aterkallat' } efter återkallelse, fick: ${JSON.stringify(result)}`)
      }
      return `mission_mandate.status='revoked' verifierat via SELECT; mandateCovers → reason=${result.reason}`
    })

    await station(
      '8f',
      'ett stämplat mandat-kort + loadMandateFacit (RIKTIGA I/O-vägen) → 1 utförd',
      async () => {
        ids.mandateApprovalId = genId('mpmandate')
        const { error: insertErr } = await supabase.from('pending_approvals').insert({
          id: ids.mandateApprovalId,
          business_id: DEMO_BUSINESS_ID,
          approval_type: 'invoice_reminder',
          title: `${MARKER} — mandatstämplad påminnelse`,
          description: `Mandatstationens exekveringsbevis, körning ${RUN_TS}.`,
          status: 'auto_approved',
          risk_level: 'medium',
          resolved_at: new Date().toISOString(),
          payload: {
            mandate_id: ids.mandateId,
            mission_id: ids.missionId,
            autonomy_key: 'invoice_reminder',
            invoice_id: ids.invoiceId,
            customer_id: ids.customerId,
            truth_class: 'indrivningsbart',
            execution_result: { outcome: 'success', artifacts: { invoice_id: ids.invoiceId } },
          },
        })
        if (insertErr) throw new Error(`Kunde inte skapa det mandatstämplade kortet: ${insertErr.message}`)

        const revokedMandate = await assertRow<MandateRow>('mission_mandate', { id: ids.mandateId }, 'mandatet (nu återkallat, facit ska ändå räkna det stämplade kortet)')
        const facit = await loadMandateFacit(supabase, DEMO_BUSINESS_ID, revokedMandate)
        if (!facit) throw new Error('loadMandateFacit svarade null — förväntade en riktig facit-rad')
        const invoiceRow = facit.per_type.find(r => r.action_type === 'invoice_reminder')
        if (!invoiceRow) throw new Error(`per_type saknar invoice_reminder helt: ${JSON.stringify(facit.per_type)}`)
        if (invoiceRow.utforda !== 1) throw new Error(`Väntade utforda=1, fick ${invoiceRow.utforda}`)
        if (!facit.agaraterkallelse) throw new Error('facit.agaraterkallelse ska vara true (mandatet återkallades i 8e)')

        return `pending_approvals ${ids.mandateApprovalId} stämplat mandate_id=${ids.mandateId} → loadMandateFacit: utforda=${invoiceRow.utforda}, leveransfel=${invoiceRow.leveransfel}, agaraterkallelse=${facit.agaraterkallelse}`
      },
    )
  })
})
