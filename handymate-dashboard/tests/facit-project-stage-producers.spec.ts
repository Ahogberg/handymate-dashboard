/**
 * Facit: stegen flyttar på riktiga händelser — genom EN brygga (Del B, 2026-08-26).
 *
 * Kartläggningen 2026-08-26: event-bussen och stegmotorn var helt frikopplade;
 * varje stegflytt var ett inline-anrop i just den rutten. ps-02 flyttades
 * bara om en bokning skapades i exakt ett läge, ps-04 kunde inte nås utan
 * ≥2 milstolpar, ps-05 triggades av avslut i stället för av besiktningen,
 * ps-07 hoppade på FÖRSTA betalda fakturan även om två var oskickade.
 *
 *   npx playwright test tests/facit-project-stage-producers.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test.describe('händelsebryggan — lib/project-stages/event-bridge.ts', () => {
  const s = read('lib/project-stages/event-bridge.ts')

  test('varje händelse mappar till ett systemsteg', () => {
    for (const ev of ['quote_signed', 'booking_created', 'work_logged', 'milestone_completed', 'ata_signed', 'checklist_completed', 'field_report_signed', 'project_completed', 'invoice_sent', 'invoice_settled', 'review_received']) {
      expect(s, `${ev} saknas i STAGE_FOR_EVENT`).toMatch(new RegExp(`${ev}:\\s+SYSTEM_STAGES\\.`))
    }
  })

  test('forward-only och kastar aldrig', () => {
    expect(s).toContain('advanceProjectStageForward(projectId, stage, businessId)')
    expect(s).not.toMatch(/await advanceProjectStage\(/)
    expect(s).toContain('catch (err: unknown)')
  })

  test('kund-fallback bara vid EXAKT ett aktivt projekt — aldrig "senaste"', () => {
    expect(s).toContain("if (projects && projects.length === 1) return { projectId: projects[0].project_id }")
    expect(s).toContain("skip: 'ambiguous_customer'")
    expect(s).not.toContain(".order('created_at', { ascending: false })")
  })

  test('ps-07 kräver att ALLA projektets fakturor är reglerade', () => {
    expect(s).toContain("if (event === 'invoice_settled')")
    expect(s).toContain('allProjectInvoicesSettled(businessId, projectId)')
    expect(s).toContain('data.every(inv => isCustomerSettled(inv.status))')
    expect(s).toContain("skip_reason: 'invoices_outstanding'")
  })

  test('bokningen sätter start_date bara om projektet saknar ett', () => {
    expect(s).toContain(".is('start_date', null)")
  })
})

test.describe('producenterna går genom bryggan', () => {
  const cases: Array<{ fil: string; event: string }> = [
    { fil: 'app/api/bookings/route.ts', event: 'booking_created' },
    { fil: 'app/api/cron/maintenance/route.ts', event: 'booking_created' },
    { fil: 'lib/project-ai-engine.ts', event: 'work_logged' },
    { fil: 'app/api/projects/[id]/milestones/route.ts', event: 'milestone_completed' },
    { fil: 'app/api/ata/sign/[token]/route.ts', event: 'ata_signed' },
    { fil: 'app/api/projects/[id]/checklists/[checklistId]/route.ts', event: 'checklist_completed' },
    { fil: 'app/api/field-reports/[id]/sign/route.ts', event: 'field_report_signed' },
    { fil: 'lib/invoices/send-invoice.ts', event: 'invoice_sent' },
    { fil: 'app/api/invoices/route.ts', event: 'invoice_settled' },
    { fil: 'lib/invoices/apply-payment.ts', event: 'invoice_settled' },
    { fil: 'lib/projects/create-from-quote.ts', event: 'quote_signed' },
  ]
  for (const c of cases) {
    test(`${c.fil} → ${c.event}`, () => {
      const s = read(c.fil)
      expect(s).toContain("await import('@/lib/project-stages/event-bridge')")
      expect(s).toContain(`'${c.event}'`)
    })
  }

  test('inga inline-flyttar kvar i de ompekade producenterna', () => {
    for (const fil of [
      'app/api/bookings/route.ts',
      'app/api/projects/[id]/milestones/route.ts',
      'lib/invoices/send-invoice.ts',
      'app/api/invoices/route.ts',
      'lib/invoices/apply-payment.ts',
    ]) {
      expect(read(fil), `${fil} anropar fortfarande advanceProjectStage direkt`).not.toMatch(/advanceProjectStage\(/)
    }
  })

  test('bokningsrutten joinar inte längre "senaste projektet på ps-01" via kunden', () => {
    const s = read('app/api/bookings/route.ts')
    expect(s).not.toContain(".eq('current_workflow_stage_id', SYSTEM_STAGES.CONTRACT_SIGNED)")
  })
})

test.describe('en stegtabell, tre konsumenter', () => {
  test('motorn och UI:t läser lib/project-stages/stages.ts', () => {
    expect(read('lib/project-stages/automation-engine.ts')).toContain("import { SYSTEM_STAGES, type SystemStageId } from '@/lib/project-stages/stages'")
    expect(read('components/pipeline/unified/flow-constants.ts')).toContain("from '@/lib/project-stages/stages'")
    expect(read('components/pipeline/unified/flow-constants.ts')).not.toMatch(/\{ id: 'ps-01', name: 'Kontrakt signerat'/)
  })

  test('stages.ts speglar SQL-seeden (id, namn, position)', () => {
    const sql = read('sql/v39_project_stages.sql')
    const ts = read('lib/project-stages/stages.ts')
    for (const [id, name] of [['ps-01', 'Kontrakt signerat'], ['ps-02', 'Startmöte bokat'], ['ps-03', 'Jobb påbörjat'], ['ps-04', 'Delmål uppnått'], ['ps-05', 'Slutbesiktning'], ['ps-06', 'Faktura skickad'], ['ps-07', 'Faktura betald'], ['ps-08', 'Recension mottagen']]) {
      expect(sql, `${id} saknas i seeden`).toContain(`'${id}'`)
      expect(sql, `${name} saknas i seeden`).toContain(name)
      expect(ts).toContain(`id: '${id}', name: '${name}'`)
    }
  })
})

test.describe('manuell flytt — bakåt är ett medvetet val, tyst', () => {
  test('advance-stage kräver allow_backwards och kör silent', () => {
    const s = read('app/api/projects/[id]/advance-stage/route.ts')
    expect(s).toContain('allow_backwards')
    expect(s).toContain('{ silent: isBackwards }')
    expect(s).toContain('requires_confirmation: true')
  })

  test('advanceProjectStage silent hoppar över automationer + portal-notis men loggar', () => {
    const s = read('lib/project-stages/automation-engine.ts')
    const fn = s.slice(s.indexOf('export async function advanceProjectStage('))
    const logIdx = fn.indexOf('await logProjectStageEvent(')
    const silentIdx = fn.indexOf('if (opts.silent) return { moved: true }')
    const autoIdx = fn.indexOf('await triggerStageAutomations(')
    expect(logIdx).toBeGreaterThan(-1)
    expect(silentIdx).toBeGreaterThan(logIdx)
    expect(autoIdx).toBeGreaterThan(silentIdx)
  })
})

test.describe('steglösa projekt visas ärligt', () => {
  test('ProjectStageStrip: null = position 0 (allt kommande), inte ps-01', () => {
    expect(read('components/projects/ProjectStageStrip.tsx')).toContain('?.position ?? 0')
  })
  test('projektsidans header säger "Inget steg ännu" i stället för att låtsas', () => {
    const s = read('app/dashboard/projects/[id]/page.tsx')
    expect(s).toContain('Inget steg ännu')
    expect(s).not.toContain('|| FLOW_SYSTEM_STAGES[0]')
  })
})
