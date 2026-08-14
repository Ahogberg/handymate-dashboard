/**
 * Cross-Agent Case — flera agenters signaler om SAMMA projekt (Business
 * Twin-epiken, 2026-08-14).
 *
 * ═══ VARFÖR ═══
 *
 * Ett projekt som går snett syns idag som separata, orelaterade kort i
 * godkännande-kön: Karin varnar för lönsamheten, Daniel föreslår en ÄTA,
 * Lars flaggar en missad intäkt — samma projekt, tre agenter, tre kort
 * ingen läser som en enda berättelse. Den här filen grupperar signalerna
 * PER PROJEKT så ytan (app/api/project-cases/route.ts) kan visa "det här
 * projektet behöver uppmärksamhet, och här är varför" i stället för tre
 * lösryckta rader.
 *
 * Ren härledning — ingen I/O, inget supabase-beroende. Facit:
 * tests/project-case.spec.ts.
 *
 * ═══ VARFÖR STÄNGNINGSCEREMONINS TYPER ÄR MEDVETET UTELÄMNADE ═══
 *
 * project_debrief, review_auto_invoice och scheduled_review_request hör
 * till projektstängningen — de tre kort som skapas när ett projekt
 * markeras klart (app/api/projects/route.ts:835). De berättas redan där,
 * grupperade under samma completion_batch_id-rubrik. Om de även dök upp
 * här skulle samma händelse berättas två gånger på två olika ytor — det
 * är förbjudet (samma princip som agentkopior-buggen i approval-view.ts).
 */

import { agentForApproval } from '@/lib/jarvis/approval-view'

/** De fyra "projektet går snett"-signalerna. Stängningsceremonins tre
 *  typer (project_debrief, review_auto_invoice, scheduled_review_request)
 *  hör INTE hit — se filhuvudet. */
export const CASE_APPROVAL_TYPES = [
  'profitability_warning',
  'create_ata_draft',
  'missad_intakt',
  'fakturera_projekt',
] as const

export interface CasebarApproval {
  id: string
  approval_type: string
  title: string
  payload: Record<string, unknown> | null
}

export interface ProjektCaseSignal {
  approval_id: string
  approval_type: string
  agentId: string
  title: string
}

export interface ProjektCase {
  project_id: string
  project_name: string | null
  signals: ProjektCaseSignal[]
}

/**
 * Grupperar godkännanden till projekt-case. Ett case kräver MINST TVÅ
 * DISTINKTA approval_types i samma projektgrupp — två profitability_warning
 * på samma projekt är samma signal upprepad, inte en berättelse med flera
 * röster. project_id/project_name gissas aldrig fram; saknas de hoppas
 * raden/fältet tyst.
 */
export function hittaProjektCase(approvals: CasebarApproval[]): ProjektCase[] {
  const caseTypes: readonly string[] = CASE_APPROVAL_TYPES
  const grupper = new Map<string, CasebarApproval[]>()

  for (const a of approvals) {
    if (!caseTypes.includes(a.approval_type)) continue
    const projectId = a.payload?.project_id
    if (typeof projectId !== 'string') continue
    const bucket = grupper.get(projectId)
    if (bucket) bucket.push(a)
    else grupper.set(projectId, [a])
  }

  const cases: ProjektCase[] = []
  for (const [projectId, gruppApprovals] of Array.from(grupper.entries())) {
    const distinctTypes = new Set(gruppApprovals.map(a => a.approval_type))
    if (distinctTypes.size < 2) continue // upprepad signal, inte ett case

    const namePayload = gruppApprovals.find(a => typeof a.payload?.project_name === 'string')
    const projectName = namePayload ? (namePayload.payload!.project_name as string) : null

    const signals: ProjektCaseSignal[] = gruppApprovals.map(a => ({
      approval_id: a.id,
      approval_type: a.approval_type,
      agentId: agentForApproval({ approval_type: a.approval_type, payload: a.payload }),
      title: a.title,
    }))

    cases.push({ project_id: projectId, project_name: projectName, signals })
  }

  // Flest signaler först; insättningsordning (Map bevarar den) avgör inom
  // samma antal — deterministiskt utan en egen tie-break-regel.
  cases.sort((a, b) => b.signals.length - a.signals.length)
  return cases
}
