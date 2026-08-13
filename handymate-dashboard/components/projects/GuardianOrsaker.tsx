'use client'

import Link from 'next/link'
import { ExternalLink, AlertTriangle } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import type { LonsamhetsVarning } from '@/lib/projects/margin-guardian'

/**
 * Delad orsaksrads-rendering för Margin Guardian — Kvittoprincipen Fall 2
 * (docs/design/SYNLIG-INTELLIGENS.md, 2026-08-13). En sanning, två ytor:
 * lyft ur den tidigare inline-renderingen i approvals/page.tsx, monterad
 * där OCH på projektdetaljsidans ekonomiyta (live, oavsett om kortet är
 * hanterat — data kommer från lib/profitability.ts's
 * computeGuardianVarningForProject, samma källa som skriver kortet).
 *
 * agent_id är 'karin' (ekonomi), inte Lars — se checkProfitabilityWarnings
 * payload.agent_id och agentForApproval()'s approval_type-routing, båda
 * i lib/profitability.ts respektive lib/jarvis/approval-view.ts.
 */

interface Props {
  varning: LonsamhetsVarning
  /** Fullt kort med rubrik+agent+amber-ram (projektsidan, som inte har
      någon egen omslutande kort-chrome) vs bara raderna (approvals-
      sidan, där approval-kortet redan äger rubrik/agent). */
  variant?: 'full' | 'rows'
  /** Deep-link till projektet — utelämnas när komponenten redan
      MONTERAS på projektets egen sida. */
  projectId?: string
}

export function GuardianOrsaker({ varning, variant = 'rows', projectId }: Props) {
  const { orsaker, status, ata_signal } = varning
  if (orsaker.length === 0 && !projectId) return null

  const lank = projectId
    ? ata_signal
      ? { label: 'Skapa ÄTA →', href: `/dashboard/projects/${projectId}?tab=changes` }
      : { label: 'Öppna projektet →', href: `/dashboard/projects/${projectId}` }
    : null

  const rader = orsaker.length > 0 && (
    <div className="divide-y divide-amber-100">
      {orsaker.map((o, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 py-1.5 text-xs ${o.kind === 'UPPSKATTAT' ? 'text-gray-400 italic' : 'text-gray-700'}`}
        >
          {o.approval_id ? (
            <Link
              href={`/dashboard/approvals#approval-${o.approval_id}`}
              className="flex-1 min-w-0 underline decoration-dotted hover:text-primary-700"
            >
              {o.text}
            </Link>
          ) : (
            <span className="flex-1 min-w-0">{o.text}</span>
          )}
          {typeof o.amount_kr === 'number' && o.amount_kr > 0 && (
            <span className="font-medium text-right shrink-0 whitespace-nowrap">
              {o.amount_kr.toLocaleString('sv-SE')} kr
            </span>
          )}
        </div>
      ))}
    </div>
  )

  if (variant === 'rows') {
    return (
      <div className="mt-2 bg-amber-50 rounded-lg p-3 space-y-2 border border-amber-200">
        {rader}
        {lank && (
          <Link href={lank.href} className="inline-flex items-center gap-1 text-xs text-primary-700 hover:text-primary-800 font-medium">
            {lank.label} <ExternalLink className="w-3 h-3" />
          </Link>
        )}
      </div>
    )
  }

  // variant='full' — egen kort-chrome för projektsidan, ingen omslutande
  // approval-kort att luta sig mot.
  return (
    <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
      <div className="flex items-center gap-2 mb-2.5">
        <AgentAvatar agentKey="karin" size="sm" />
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="text-sm font-semibold text-amber-900">
          {status === 'over_budget' ? 'Budget överskriden' : 'Lönsamhetsvarning'}
        </span>
      </div>
      {rader}
      {lank && (
        <Link
          href={lank.href}
          className="inline-flex items-center gap-1 mt-2.5 text-xs text-primary-700 hover:text-primary-800 font-medium"
        >
          {lank.label} <ExternalLink className="w-3 h-3" />
        </Link>
      )}
    </div>
  )
}

export default GuardianOrsaker
