'use client'

import Link from 'next/link'
import { AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { agentIdentity } from '@/lib/agents/interaction'
import type { CloseoutCandidate } from '@/lib/agents/lars/closeout-copilot'

/**
 * Matte äger samtalet, Lars äger projektbedömningen. Kortet är strikt
 * läsande: enda handlingen är en länk till projektets befintliga avslut.
 */
export function ProjectCloseoutCopilotCard({ candidate }: { candidate: CloseoutCandidate }) {
  const matte = agentIdentity('matte')
  const lars = agentIdentity('lars')

  return (
    <div className="mb-2.5 rounded-2xl border border-primary-200 border-l-[3px] border-l-primary-600 bg-white px-4 py-3.5">
      <div className="flex items-start gap-2.5">
        <AgentAvatar agentKey="matte" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs text-slate-500">{matte.name} · samordnar</p>
          <h3 className="m-0 mt-0.5 text-sm font-semibold text-primary-900">
            Lars vill stämma av om {candidate.project_name} är klart
          </h3>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
        <AgentAvatar agentKey="lars" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs font-medium text-slate-700">
            {lars.name}{lars.role ? ` · ${lars.role}` : ''} {lars.shortVerb}
          </p>
          <p className="m-0 mt-1 text-sm leading-relaxed text-slate-600">{candidate.evidence}</p>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5 pl-0">
        {candidate.evidence_points.slice(0, 3).map(point => (
          <li key={point} className="flex items-start gap-2 text-xs text-slate-600">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-600" />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      {candidate.learning_gaps.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            För ett bättre efterutfall saknas {candidate.learning_gaps.join(', ')}. Projektet kan fortfarande granskas för avslut.
          </span>
        </div>
      )}

      <Link
        href={candidate.target_route}
        className="mt-3 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800"
      >
        Granska och avsluta
        <ChevronRight className="h-4 w-4" />
      </Link>
      <p className="m-0 mt-1.5 text-center text-[11px] text-slate-400">
        Du bekräftar själv i projektet. Inget avslutas automatiskt.
      </p>
    </div>
  )
}

export default ProjectCloseoutCopilotCard
