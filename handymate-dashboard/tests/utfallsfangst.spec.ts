/**
 * OperatingExperiment-fångstskydd (2026-08-19) — läcka 3: byggstart saknas
 * från projektets födelse.
 *
 * Historiskt fynd (Golden Path-harnesset, 2026-08-13): 29/33 projekt hade
 * current_workflow_stage_id = NULL, för att workflow_stage_history bara
 * initieras av EN av flera creation-vägar. Fyra vägar var redan fixade
 * (create-from-quote.ts, project-ai-engine.ts:onQuoteAccepted,
 * e2e-deal-flow.ts:executeProjectCreation, app/api/projects/route.ts POST).
 * Två saknade det helt: create-from-lead.ts och maybe-create-from-
 * booking.ts (minimal-projekt-grenen). Båda fixade 2026-08-19.
 *
 * REN KÄLLKODSSKANNING — ingen DB, inget Supabase. Facit att varje verklig
 * projekt-skapelseväg sätter ett startsteg, och att de två nyfixade vägarna
 * INTE anropar advanceProjectStage (som skulle trigga ps-01:s
 * default-automation: ett SMS till kunden om "mottagen signerad offert" —
 * felaktigt för lead-/bokningsbaserad skapelse där inget kontrakt
 * nödvändigtvis är signerat).
 *
 * Debug-/demo-/test-vägar (app/api/debug/e2e-lifecycle/route.ts,
 * lib/demo/seed-demo-account.ts) är MEDVETET exkluderade — de skapar aldrig
 * riktiga kunders projekt och matas aldrig in i OperatingExperiment-
 * underlaget.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test.describe('Nyfixade vägar (2026-08-19) — inline stage-init, ingen automation-sideeffekt', () => {
  test('create-from-lead.ts sätter ps-01 inline i insert:en, inte via advanceProjectStage', () => {
    const kalla = read('lib/projects/create-from-lead.ts')
    expect(kalla).toContain("import { SYSTEM_STAGES } from '@/lib/project-stages/automation-engine'")
    expect(kalla).toContain('current_workflow_stage_id: SYSTEM_STAGES.CONTRACT_SIGNED')
    expect(kalla).toContain('workflow_stage_entered_at: nuIso')
    expect(kalla).toContain('stage_id: SYSTEM_STAGES.CONTRACT_SIGNED, entered_at: nuIso, previous_stage_id: null')
    // Får INTE ANROPA advanceProjectStage (bara nämna varför i en kommentar)
    // — quote?.status tillåter 'sent' (ej signerad), och den funktionen
    // triggar en kund-SMS-automation för ps-01 som skulle vara felaktig här.
    expect(kalla).not.toContain('advanceProjectStage(')
  })

  test('maybe-create-from-booking.ts sätter ps-01 inline i minimal-projekt-grenen, inte via advanceProjectStage', () => {
    const kalla = read('lib/projects/maybe-create-from-booking.ts')
    expect(kalla).toContain("import { SYSTEM_STAGES } from '@/lib/project-stages/automation-engine'")
    expect(kalla).toContain('current_workflow_stage_id: SYSTEM_STAGES.CONTRACT_SIGNED')
    expect(kalla).toContain('workflow_stage_entered_at: nuIso')
    expect(kalla).toContain('stage_id: SYSTEM_STAGES.CONTRACT_SIGNED, entered_at: nuIso, previous_stage_id: null')
    // Offert-lös väg per filhuvudet — inget kontrakt signerat, bara en
    // bokning gjord. Samma resonemang som create-from-lead.ts ovan (bara
    // nämnt i en kommentar, aldrig faktiskt anropad).
    expect(kalla).not.toContain('advanceProjectStage(')
  })

  test('lead-grenen i maybe-create-from-booking.ts återanvänder createProjectFromLead (redan täckt, ingen dubblettlogik)', () => {
    const kalla = read('lib/projects/maybe-create-from-booking.ts')
    expect(kalla).toContain("await import('./create-from-lead')")
    expect(kalla).toContain('createProjectFromLead(businessId, lead.lead_id)')
  })
})

test.describe('Redan fixade vägar (2026-08-13) — regressionslås', () => {
  test('create-from-quote.ts anropar advanceProjectStage(CONTRACT_SIGNED) — genuint signerad offert, automation OK', () => {
    const kalla = read('lib/projects/create-from-quote.ts')
    expect(kalla).toContain('advanceProjectStage(projectId, SYSTEM_STAGES.CONTRACT_SIGNED, businessId)')
  })

  test('project-ai-engine.ts (onQuoteAccepted) delegerar till createProjectFromQuote — EN skapare, steget initieras där', () => {
    // 2026-08-26: onQuoteAccepted var en hel duplicerad projektskapare
    // (REALITY-WEEK #2). Nu delegerar den; stegstarten ägs av
    // create-from-quote.ts (låst i testet ovan).
    const kalla = read('lib/project-ai-engine.ts')
    expect(kalla).toContain('createProjectFromQuote(businessId, quoteId, { sendSms: false })')
    const fn = kalla.slice(kalla.indexOf('async function onQuoteAccepted'), kalla.indexOf('async function onTimeLogged'))
    expect(fn, 'onQuoteAccepted får inte ha ett eget project-insert').not.toMatch(/\.from\('project'\)\s*\.insert\(/)
    expect(fn, 'ingen egen stegstart — den ägs av create-from-quote').not.toContain('advanceProjectStage(')
  })

  test('e2e-deal-flow.ts (executeProjectCreation, pipeline-flödet) initierar steget', () => {
    const kalla = read('lib/e2e-deal-flow.ts')
    expect(kalla).toContain('advanceProjectStage(projectId, SYSTEM_STAGES.CONTRACT_SIGNED, businessId)')
  })

  test('app/api/projects/route.ts POST väljer steg villkorat (offert→signerat, aktiv→jobb igång, planering→inget påstående)', () => {
    const kalla = read('app/api/projects/route.ts')
    expect(kalla).toMatch(/body\.from_quote_id\s*\r?\n\s*\?\s*'CONTRACT_SIGNED' as const/)
    expect(kalla).toMatch(/projectData\.status === 'active'\s*\r?\n\s*\?\s*'JOB_STARTED' as const/)
    expect(kalla).toContain('advanceProjectStage(project.project_id, SYSTEM_STAGES[initStage], businessId)')
  })
})

test.describe('SYSTEM_STAGES-kontraktet (automation-engine.ts) — oförändrat av denna fix', () => {
  test('ps-01 är fortfarande CONTRACT_SIGNED och stegen är strängordnade', () => {
    const kalla = read('lib/project-stages/automation-engine.ts')
    expect(kalla).toContain("CONTRACT_SIGNED:   'ps-01'")
  })
})
