/**
 * Spärrhake för Canonical Project Completion V1 (2026-08-15).
 *
 * Ett projekt får stängas från desktop, sista mobilbokningen och ett
 * godkänt fyra-ögon-kort. Alla produktdörrar ska använda samma kommando;
 * debug-harnesset får använda den delade atomiska övergångsprimitiven men
 * inte skriva statusen självt.
 *
 *   npx playwright test tests/canonical-project-completion.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const kod = (p: string) =>
  read(p)
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

const COMMAND = 'lib/projects/complete-project.ts'
const PROJECTS = 'app/api/projects/route.ts'
const BOOKING = 'app/api/booking/complete-job/route.ts'
const APPROVAL = 'app/api/approvals/[id]/route.ts'
const DEBUG = 'app/api/debug/e2e-lifecycle/route.ts'
const APPROVAL_UI = 'app/dashboard/approvals/page.tsx'

function approvalCase(): string {
  const s = kod(APPROVAL)
  const start = s.indexOf("case 'four_eyes_project_close'")
  expect(start).toBeGreaterThan(-1)
  return s.slice(start, s.indexOf('case ', start + 10))
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })
}

test.describe('en kanonisk produktdörr', () => {
  test('desktop, mobil och godkännande använder completeProject', () => {
    for (const file of [PROJECTS, BOOKING, APPROVAL]) {
      expect(kod(file), `${file} går runt kommandot`).toContain('completeProject(')
    }
  })

  test('de tre dörrarna duplicerar inte avslutets sidoeffekter', () => {
    const forbidden = [
      'autoInvoiceOnComplete(',
      'freezeProjectOutcome(',
      'skapaDebriefKort(',
      "fireEvent(supabase, 'job_completed'",
      'SYSTEM_STAGES.FINAL_INSPECTION',
      'completion_batch_id:',
    ]
    for (const file of [PROJECTS, BOOKING, APPROVAL]) {
      const s = kod(file)
      for (const call of forbidden) {
        expect(s, `${file} duplicerar ${call}`).not.toContain(call)
      }
    }
  })

  test('godkännandet går genom kommandots uttryckliga approved-väg', () => {
    const block = approvalCase()
    expect(block).toContain("authorization: { kind: 'approved'")
    expect(block).not.toContain("update({ status: 'completed'")
  })

  test('debug-harnesset använder samma atomiska övergångsprimitiv', () => {
    const s = kod(DEBUG)
    expect(s).toContain('transitionProjectToCompleted(')
    expect(s).not.toContain("update({ status: 'completed'")
  })

  test('ingen annan app/lib-fil skriver project.status=completed direkt', () => {
    const allowed = path.normalize(path.join(ROOT, COMMAND))
    const offenders = sourceFiles(path.join(ROOT, 'app'))
      .concat(sourceFiles(path.join(ROOT, 'lib')))
      .filter((file) => file !== allowed)
      .filter((file) => {
        const s = fs.readFileSync(file, 'utf8')
        return /\.from\(['"]project['"]\)[\s\S]{0,180}?\.update\(\{[\s\S]{0,180}?status:\s*['"]completed['"]/.test(s)
      })
      .map((file) => path.relative(ROOT, file))
    expect(offenders).toEqual([])
  })
})

test.describe('primär övergång före sidoeffekter', () => {
  test('projektet läses och skrivs alltid tenantfiltrerat', () => {
    const s = kod(COMMAND)
    expect(s).toContain("eq('business_id', businessId)")
    expect(s).toContain("eq('project_id', projectId)")
  })

  test('bara vinnaren av inte-klart→klart får köra kedjan', () => {
    const s = kod(COMMAND)
    // 2026-08-25: or() ersatt av två atomära försök (neq + is-null) —
    // PostgREST-buggen där eq()+or() på en update-representation gav tom
    // retur trots lyckad skrivning (verkligt prod-repro, avvikelse #14).
    // Vaktens semantik är oförändrad: bara den som faktiskt flippar
    // status får köra sidoeffektskedjan.
    const compareAndSet = s.indexOf(".neq('status', 'completed')")
    const nullBranch = s.indexOf(".is('status', null)")
    const effects = s.indexOf('runCompletionEffects(')
    expect(compareAndSet, 'atomisk övergångsvakt saknas').toBeGreaterThan(-1)
    expect(nullBranch, 'NULL-status-grenen saknas').toBeGreaterThan(compareAndSet)
    expect(effects, 'gemensam sidoeffektskedja saknas').toBeGreaterThan(compareAndSet)
    expect(s).toContain("already_completed: true")
  })

  test('ett primärt skrivfel returneras före första sidoeffekten', () => {
    const s = kod(COMMAND)
    const errorCheck = s.indexOf('if (transition.error)')
    const effects = s.indexOf('runCompletionEffects(')
    expect(errorCheck).toBeGreaterThan(-1)
    expect(errorCheck).toBeLessThan(effects)
    expect(s.slice(errorCheck, effects)).toContain('ok: false')
  })

  test('direkta anrop grindas före övergången; godkänt kort är explicit', () => {
    const full = kod(COMMAND)
    const s = full.slice(full.indexOf('export async function completeProject'))
    const gate = s.indexOf('checkFourEyesGate(')
    const transition = s.indexOf('await transitionProjectToCompleted(')
    expect(gate).toBeGreaterThan(-1)
    expect(gate).toBeLessThan(transition)
    expect(s).toContain("authorization.kind === 'direct'")
    expect(s).toContain("authorization.kind === 'approved'")
  })

  test('approved-kapabiliteten verifieras mot samma tenant, projektreferens och korttyp', () => {
    const service = read('lib/projects/complete-project.ts')
    const validation = service.indexOf(".from('pending_approvals')")
    const transition = service.indexOf('transitionProjectToCompleted(supabase, businessId, projectId)')

    expect(validation).toBeGreaterThan(-1)
    expect(validation).toBeLessThan(transition)
    expect(service).toContain(".eq('id', authorization.approvalId)")
    expect(service).toContain(".eq('business_id', businessId)")
    expect(service).toContain(".eq('approval_type', 'four_eyes_project_close')")
    expect(service).toContain(".eq('status', 'approved')")
    expect(service).toContain(".contains('payload', { project_id: projectId })")
  })

  test('redan stängt kortsluts före grinden så replay inte skapar nytt kort', () => {
    const full = kod(COMMAND)
    const s = full.slice(full.indexOf('export async function completeProject'))
    const replay = s.indexOf("existing.data.status === 'completed'")
    const gate = s.indexOf('checkFourEyesGate(')
    expect(replay).toBeGreaterThan(-1)
    expect(replay).toBeLessThan(gate)
  })
})

test.describe('sanningsenligt resultat', () => {
  test('kommandot redovisar varje befintlig sidoeffekt', () => {
    const s = kod(COMMAND)
    for (const effect of [
      'workflow_stage',
      'job_completed_event',
      'auto_invoice',
      'project_outcome',
      'project_debrief',
      'agent_trigger',
      'review_request',
      'deal_stage',
      'completion_batch',
    ]) {
      expect(s, `resultatet saknar ${effect}`).toContain(effect)
    }
    expect(s).toContain('effects: CloseoutEffectResult[]')
  })

  test('mobilsvaret bär samma closeout-resultat och påstår aldrig klart vid primärfel', () => {
    const s = kod(BOOKING)
    expect(s).toContain('closeout: closeoutResult')
    expect(s).toContain('project_completed: closeoutResult?.completed ?? false')
    expect(s).not.toContain('projectCompleted = true')
  })

  test('fyra-ögon-godkännandet återanvänder den befintliga resultatskärmen', () => {
    const s = kod(APPROVAL_UI)
    expect(s).toContain("approvedItem?.approval_type === 'four_eyes_project_close'")
    expect(s).toContain('closeout?.completed')
    expect(s).toContain('<ProjectCloseoutModal')
    expect(s).toContain('warnings={closeoutProject.warnings}')
    expect(kod('components/projects/ProjectCloseoutModal.tsx')).toContain('allt efterarbete blev inte klart')
  })
})
