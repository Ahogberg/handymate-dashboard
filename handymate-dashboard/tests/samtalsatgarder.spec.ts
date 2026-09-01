import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Facit för samtalsefterarbete-sprinten (2026-09-01):
 *   Steg 1  kundmatchning på telefonnummer i EN delad funktion,
 *   Steg 2  Lisas get_customer ser de senaste samtalen,
 *   Steg 3  pipeline-kvalificeringen bär ett nästa steg (suggested_action)
 *           och en deal_note — och DealModal visar det även utan lead_score,
 *   Steg 4  ÄTA-utkast ur samtalet (create_ata_draft via byggAtaUtkast),
 *   Steg 5  dagboksrad via godkännande (project_log_note).
 *
 * Källfacit (samma mönster som tests/partner-attribution-lock.spec.ts):
 * läser filerna och låser strängarna som bär kontraktet.
 */

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r/g, '')

test.describe('v192 — RPC:n släpper in de nya korttyperna', () => {
  test('vitlistan i manage_call_processing har create_ata_draft och project_log_note', () => {
    const sql = read('sql/v192_samtalsefterarbete.sql')
    const notIn = sql.slice(sql.indexOf("NOT IN ('meeting_summary'"), sql.indexOf(')', sql.indexOf("NOT IN ('meeting_summary'")))
    expect(notIn).toContain("'create_ata_draft','project_log_note'")
  })

  test('call_recording får deal_id', () => {
    expect(read('sql/v192_samtalsefterarbete.sql')).toContain('ADD COLUMN IF NOT EXISTS deal_id')
  })
})

test.describe('Steg 1 — kundmatchning på telefonnummer i EN funktion', () => {
  test('lib/voice/find-customer-by-phone.ts exporterar phoneCandidates och findCustomerByPhone', () => {
    const s = read('lib/voice/find-customer-by-phone.ts')
    expect(s).toMatch(/export function phoneCandidates\(/)
    expect(s).toMatch(/export async function findCustomerByPhone\(/)
  })

  for (const fil of ['app/api/voice/incoming/route.ts', 'lib/pipeline-ai.ts', 'app/api/voice/analyze/route.ts']) {
    test(`${fil} matchar via findCustomerByPhone — ingen egen .eq('phone_number')`, () => {
      const s = read(fil)
      expect(s).toContain('findCustomerByPhone(')
      expect(s, `${fil} har kvar en egen exakt-matchning på phone_number`).not.toContain(".eq('phone_number', ")
    })
  }
})

test.describe('Steg 2 — Lisas get_customer ser de senaste samtalen', () => {
  test('call_recording-blocket i getCustomer returnerar recent_calls, max fem', () => {
    const s = read('app/api/agent/trigger/tool-router.ts')
    const fn = s.slice(s.indexOf('async function getCustomer('), s.indexOf('recent_calls: recentCalls'))
    const block = fn.slice(fn.indexOf(".from('call_recording')"))
    expect(block, 'call_recording-blocket saknas i getCustomer').not.toBe('')
    expect(block).toContain('.limit(5)')
    expect(s).toContain('recent_calls')
  })
})

test.describe('Steg 3 — kvalificeringen bär ett nästa steg', () => {
  test('pipeline-ai sätter suggested_action och skriver en deal_note', () => {
    const s = read('lib/pipeline-ai.ts')
    expect(s).toContain('suggested_action:')
    expect(s).toContain("from('deal_note')")
  })

  test('DealModal visar suggested_action även när lead_score saknas', () => {
    const s = read('app/dashboard/pipeline/components/DealModal.tsx')
    // Blocket får inte ligga INUTI lead_score-vakten — utan poäng var
    // förslaget osynligt. Formen: suggested_action && !(lead_score ...).
    expect(s).toMatch(/selectedDeal\.suggested_action && !\(selectedDeal\.lead_score/)
  })
})

test.describe('Steg 4 — ÄTA-utkast ur samtalet', () => {
  test("'ata' är en tillåten analystyp och ligger sist i listan", () => {
    const { ANALYS_TILLATNA_TYPER } = require('../lib/voice/analysis-scope')
    expect(ANALYS_TILLATNA_TYPER).toContain('ata')
    expect(ANALYS_TILLATNA_TYPER[ANALYS_TILLATNA_TYPER.length - 1]).toBe('ata')
  })

  test('suggest-ata-draft.ts exporterar dedup + utkastbygge separat', () => {
    const s = read('lib/ata/suggest-ata-draft.ts')
    expect(s).toMatch(/export async function harPendingAtaForProjekt\(/)
    expect(s).toMatch(/export async function byggAtaUtkast\(/)
    // Orkestreringen kvar för Daniel/Matte — anroparna är oförändrade.
    expect(s).toMatch(/export async function suggestAtaDraft\(/)
    expect(read('lib/matte/action-executor.ts')).toContain('suggestAtaDraft(')
    expect(read('app/api/agent/trigger/tool-router.ts')).toContain('suggestAtaDraft(')
  })

  test('analysen bygger ÄTA-kortet via byggAtaUtkast på ett upplöst projekt', () => {
    const s = read('app/api/voice/analyze/route.ts')
    expect(s).toContain('resolveCallProject(')
    expect(s).toContain('byggAtaUtkast(')
    expect(s).toContain('harPendingAtaForProjekt(')
    expect(s).toContain("approval_type: 'create_ata_draft'")
    // Utan projekt/med väntande ÄTA: uppföljningskort, aldrig ett gissat utkast.
    expect(s).toContain('Förbered ÄTA: ${s.title}')
    // Telefonprompten erbjuder typen.
    expect(s).toContain('"type": "quote|callback|follow_up|reminder|reschedule|customer_fact|ata"')
  })
})

test.describe('Steg 5 — dagboksrad via godkännande', () => {
  test('project_log_note är ett utförbart kort i kontraktet', () => {
    const { ACTION_CONTRACT } = require('../lib/approvals/action-contract')
    expect(ACTION_CONTRACT.project_log_note).toBe('EXECUTABLE_ACTION')
  })

  test('exekveraren skriver project_log med LIVE-kolumnerna', () => {
    const s = read('app/api/approvals/[id]/route.ts')
    const i = s.indexOf("case 'project_log_note':")
    expect(i, 'case project_log_note saknas').toBeGreaterThan(-1)
    const gren = s.slice(i, s.indexOf("case 'customer_fact':", i))
    expect(gren).toContain("from('project_log')")
    expect(gren).toContain('log_call_')
    expect(gren).toContain("work_performed: 'Samtal med kund'")
    expect(gren).toContain('order_id: pl.project_id')
    // Projektet verifieras på tenant före skrivningen.
    expect(gren.indexOf(".from('project')")).toBeLessThan(gren.indexOf(".from('project_log')"))
    // Dubblett (23505) kvitteras, inte fel.
    expect(gren).toContain("'23505'")
    expect(gren).toContain('duplicate: true')
  })

  test('log_id är en vitlistad artefakt', () => {
    const { ARTIFACT_ID_KEYS } = require('../lib/approvals/execution-outcome')
    expect(ARTIFACT_ID_KEYS).toContain('log_id')
  })

  test('samtalsutfallet känner båda korten och länkar till projektet', () => {
    const { deriveCallOutcome } = require('../lib/voice/call-outcome')
    const rows = [
      { id: 'a', title: 'Dagbok', status: 'approved', approval_type: 'project_log_note',
        payload: { recording_id: 'r', project_id: 'p1', execution_result: { outcome: 'success', artifacts: { log_id: 'log_call_r' } } } },
      { id: 'b', title: 'ÄTA', status: 'approved', approval_type: 'create_ata_draft',
        payload: { recording_id: 'r', project_id: 'p1', execution_result: { outcome: 'success', artifacts: { ata_id: 'c1' } } } },
    ]
    const o = deriveCallOutcome({}, rows)
    expect(o.done).toHaveLength(2)
    expect(o.done[0].label).toContain('intern anteckning')
    expect(o.done[0].href).toBe('/dashboard/projects/p1')
    expect(o.done[1].label).toContain('inte skickat')
    expect(o.done[1].href).toBe('/dashboard/projects/p1')
  })

  test('kortet har svensk etikett och en knapp som säger vad som händer', () => {
    const { approveLabel } = require('../lib/jarvis/approval-view')
    expect(approveLabel('project_log_note', {})).toBe('Spara i dagboken')
    expect(read('lib/jarvis/approval-view.ts')).toContain("project_log_note: 'Dagboksanteckning'")
    expect(read('app/dashboard/approvals/page.tsx')).toContain("project_log_note: { label: 'Dagboksanteckning'")
  })

  test('analysen lägger dagbokskortet bara med ett upplöst projekt', () => {
    const s = read('app/api/voice/analyze/route.ts')
    const i = s.indexOf("approval_type: 'project_log_note'")
    expect(i).toBeGreaterThan(-1)
    const fore = s.slice(s.lastIndexOf('if (samtalsProjekt)', i), i)
    expect(fore).toContain('if (samtalsProjekt)')
    const kort = s.slice(i, i + 900)
    expect(kort).toContain("call_card_key: 'diary'")
    expect(kort).toContain("routed_agent: 'matte'")
    expect(kort).toContain('project_id: samtalsProjekt.project_id')
  })
})
