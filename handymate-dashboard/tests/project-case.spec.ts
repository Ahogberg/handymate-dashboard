/**
 * Facit för Cross-Agent Case (Business Twin-epiken, 2026-08-14).
 *
 * ═══ DET SOM VAKTAS ═══
 *
 * `hittaProjektCase` (lib/jarvis/project-case.ts) avgör om flera agenters
 * signaler om samma projekt visas som EN berättelse i stället för lösryckta
 * kort. Fel här är antingen en enda upprepad varning som felaktigt blir ett
 * "case" (skriker på ingenting), eller ett riktigt flerfrågeprojekt som
 * aldrig grupperas (tystnad när det borde synas).
 *
 * Ren funktion — inga browser/session. Körs:
 *   npx playwright test tests/project-case.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  hittaProjektCase,
  CASE_APPROVAL_TYPES,
  type CasebarApproval,
} from '../lib/jarvis/project-case'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

function approval(overrides: Partial<CasebarApproval> & { id: string; approval_type: string }): CasebarApproval {
  return {
    title: 'Titel',
    payload: null,
    ...overrides,
  }
}

test.describe('hittaProjektCase — tom lista', () => {
  test('inga approvals → tom lista', () => {
    expect(hittaProjektCase([])).toEqual([])
  })
})

test.describe('hittaProjektCase — kräver minst 2 DISTINKTA typer', () => {
  test('två profitability_warning på samma projekt → INGET case (samma signal upprepad)', () => {
    const approvals = [
      approval({ id: 'a1', approval_type: 'profitability_warning', payload: { project_id: 'p1' } }),
      approval({ id: 'a2', approval_type: 'profitability_warning', payload: { project_id: 'p1' } }),
    ]
    expect(hittaProjektCase(approvals)).toEqual([])
  })

  test('profitability_warning + missad_intakt på samma projekt → ETT case med 2 signaler', () => {
    const approvals = [
      approval({ id: 'a1', approval_type: 'profitability_warning', payload: { project_id: 'p1' } }),
      approval({ id: 'a2', approval_type: 'missad_intakt', payload: { project_id: 'p1' } }),
    ]
    const cases = hittaProjektCase(approvals)
    expect(cases).toHaveLength(1)
    expect(cases[0].project_id).toBe('p1')
    expect(cases[0].signals).toHaveLength(2)
  })
})

test.describe('hittaProjektCase — project_id gissas aldrig', () => {
  test('saknad project_id (ingen payload) hoppas tyst', () => {
    const approvals = [
      approval({ id: 'a1', approval_type: 'profitability_warning', payload: null }),
      approval({ id: 'a2', approval_type: 'missad_intakt', payload: null }),
    ]
    expect(hittaProjektCase(approvals)).toEqual([])
  })

  test('null project_id hoppas tyst', () => {
    const approvals = [
      approval({ id: 'a1', approval_type: 'profitability_warning', payload: { project_id: null } }),
      approval({ id: 'a2', approval_type: 'missad_intakt', payload: { project_id: null } }),
    ]
    expect(hittaProjektCase(approvals)).toEqual([])
  })

  test('icke-sträng project_id (t.ex. number) hoppas tyst', () => {
    const approvals = [
      approval({ id: 'a1', approval_type: 'profitability_warning', payload: { project_id: 123 } }),
      approval({ id: 'a2', approval_type: 'missad_intakt', payload: { project_id: 123 } }),
    ]
    expect(hittaProjektCase(approvals)).toEqual([])
  })
})

test.describe('hittaProjektCase — typer utanför CASE_APPROVAL_TYPES deltar aldrig', () => {
  test('project_debrief med project_id deltar aldrig, även ihop med en case-typ', () => {
    const approvals = [
      approval({ id: 'a1', approval_type: 'profitability_warning', payload: { project_id: 'p1' } }),
      approval({ id: 'a2', approval_type: 'project_debrief', payload: { project_id: 'p1' } }),
    ]
    // Bara EN case-typ deltar (profitability_warning) → ingen distinkt andra typ → inget case.
    expect(hittaProjektCase(approvals)).toEqual([])
  })

  test('invoice_reminder med project_id deltar aldrig', () => {
    const approvals = [
      approval({ id: 'a1', approval_type: 'invoice_reminder', payload: { project_id: 'p1' } }),
      approval({ id: 'a2', approval_type: 'missad_intakt', payload: { project_id: 'p1' } }),
    ]
    expect(hittaProjektCase(approvals)).toEqual([])
  })

  test('regressionsskydd: stängningsceremonins tre typer finns INTE i CASE_APPROVAL_TYPES (dubbel narration förbjuden)', () => {
    const closingTypes = ['project_debrief', 'review_auto_invoice', 'scheduled_review_request']
    for (const t of closingTypes) {
      expect((CASE_APPROVAL_TYPES as readonly string[]).includes(t)).toBe(false)
    }
  })
})

test.describe('hittaProjektCase — project_name ur första payload som har det', () => {
  test('första approval med project_name (i insättningsordning) vinner', () => {
    const approvals = [
      approval({ id: 'a1', approval_type: 'profitability_warning', payload: { project_id: 'p1' } }),
      approval({ id: 'a2', approval_type: 'missad_intakt', payload: { project_id: 'p1', project_name: 'Villa Ek' } }),
    ]
    const cases = hittaProjektCase(approvals)
    expect(cases[0].project_name).toBe('Villa Ek')
  })

  test('ingen payload har project_name → null, gissas aldrig', () => {
    const approvals = [
      approval({ id: 'a1', approval_type: 'profitability_warning', payload: { project_id: 'p1' } }),
      approval({ id: 'a2', approval_type: 'missad_intakt', payload: { project_id: 'p1' } }),
    ]
    const cases = hittaProjektCase(approvals)
    expect(cases[0].project_name).toBeNull()
  })
})

test.describe('hittaProjektCase — sortering: flest signaler först', () => {
  test('projekt med 3 signaler placeras före projekt med 2', () => {
    const approvals = [
      approval({ id: 'a1', approval_type: 'profitability_warning', payload: { project_id: 'p_liten' } }),
      approval({ id: 'a2', approval_type: 'missad_intakt', payload: { project_id: 'p_liten' } }),
      approval({ id: 'b1', approval_type: 'profitability_warning', payload: { project_id: 'p_stor' } }),
      approval({ id: 'b2', approval_type: 'missad_intakt', payload: { project_id: 'p_stor' } }),
      approval({ id: 'b3', approval_type: 'create_ata_draft', payload: { project_id: 'p_stor' } }),
    ]
    const cases = hittaProjektCase(approvals)
    expect(cases.map(c => c.project_id)).toEqual(['p_stor', 'p_liten'])
  })
})

test.describe('hittaProjektCase — agentId per signal', () => {
  test('profitability_warning utan routed_agent → karin (agentForApproval-regeln)', () => {
    const approvals = [
      approval({ id: 'a1', approval_type: 'profitability_warning', payload: { project_id: 'p1' } }),
      approval({ id: 'a2', approval_type: 'missad_intakt', payload: { project_id: 'p1' } }),
    ]
    const cases = hittaProjektCase(approvals)
    const signal = cases[0].signals.find(s => s.approval_type === 'profitability_warning')
    expect(signal?.agentId).toBe('karin')
  })

  test('payload.agent_id respekteras när satt, t.ex. agent_id karin på missad_intakt', () => {
    const approvals = [
      approval({ id: 'a1', approval_type: 'profitability_warning', payload: { project_id: 'p1' } }),
      approval({ id: 'a2', approval_type: 'missad_intakt', payload: { project_id: 'p1', agent_id: 'karin' } }),
    ]
    const cases = hittaProjektCase(approvals)
    const signal = cases[0].signals.find(s => s.approval_type === 'missad_intakt')
    expect(signal?.agentId).toBe('karin')
  })
})

test.describe('lib/jarvis/project-case.ts — ingen I/O, ingen supabase-import', () => {
  const s = read('lib/jarvis/project-case.ts')

  test('importerar aldrig från @/lib/supabase', () => {
    expect(s).not.toContain("from '@/lib/supabase'")
  })

  test('importerar aldrig @supabase/supabase-js', () => {
    expect(s).not.toContain('@supabase/supabase-js')
  })
})
