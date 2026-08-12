'use client'

import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'
import type {
  MandagskortResultatRad,
  MandagskortLardomar,
  MandagskortRiskRad,
  MandagskortFortroendeRad,
} from '@/lib/jarvis/monday-brief'

/**
 * MandagskortCard — Måndagskortets detaljvy (Måndagsmötet etapp 1, 2026-08-13).
 *
 * Radstilen är TeamBevakning.tsx (AgentAvatar + AGENT_INFO[agentId].name +
 * en mening per rad), grupperad i fyra rubricerade sektioner. Ren
 * presentation — kortet är INFORMATIONAL (lib/approvals/action-contract.ts),
 * inget här kan utlösa en åtgärd.
 *
 * Agenten per sektion:
 *   Resultat   → Matte (ledgern är hennes/hans domän, lib/value/ledger.ts)
 *   Lärdomar   → Daniel (offert-intelligens, samma som project_lesson-läsningen)
 *   Risker     → Karin (samma röst Guardian-varningar redan har,
 *                se lib/jarvis/approval-view.ts agentForApproval:
 *                approval_type === 'profitability_warning' → 'karin')
 *   Förtroende → nyckelns egen agent (lib/autonomy/earned-autonomy.ts AUTONOMY_META)
 */

const RESULTAT_LABEL: Record<MandagskortResultatRad['key'], string> = {
  identifierat: 'Identifierat',
  agerat: 'Agerat',
  fakturerat: 'Fakturerat',
  betalt: 'Betalt',
}

function krText(kr: number): string {
  return `${Math.round(kr).toLocaleString('sv-SE')} kr`
}

function Sektion({ rubrik, children }: { rubrik: string; children: React.ReactNode }) {
  return (
    <div className="pt-3 first:pt-0">
      <p className="m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{rubrik}</p>
      <ul className="m-0 p-0 list-none flex flex-col gap-2">{children}</ul>
    </div>
  )
}

function Rad({ agentId, children }: { agentId: string; children: React.ReactNode }) {
  const namn = AGENT_INFO[agentId]?.name ?? agentId
  return (
    <li className="flex items-start gap-2.5">
      <AgentAvatar agentKey={agentId} size="sm" />
      <span className="flex-1 min-w-0 text-sm text-slate-700 leading-snug">
        <b className="font-semibold text-slate-900">{namn}:</b> {children}
      </span>
    </li>
  )
}

export function MandagskortCard({
  resultat,
  lardomar,
  risker,
  fortroende,
}: {
  resultat: MandagskortResultatRad[] | null
  lardomar: MandagskortLardomar | null
  risker: MandagskortRiskRad[] | null
  fortroende: MandagskortFortroendeRad[] | null
}) {
  if (!resultat && !lardomar && !risker && !fortroende) return null

  return (
    <div className="mt-2 bg-white rounded-xl border border-slate-200 p-3.5 divide-y divide-slate-100">
      {resultat && (
        <Sektion rubrik="Resultat den här månaden">
          {resultat.map(rad => (
            <Rad key={rad.key} agentId="matte">
              {RESULTAT_LABEL[rad.key]}: {rad.antal} st · {krText(rad.kr)}
            </Rad>
          ))}
        </Sektion>
      )}

      {lardomar && (
        <Sektion rubrik="Lärdomar sedan förra veckan">
          <Rad agentId="daniel">
            {lardomar.antal} ny{lardomar.antal === 1 ? '' : 'a'} lärdom{lardomar.antal === 1 ? '' : 'ar'} från avslutade projekt
          </Rad>
        </Sektion>
      )}

      {risker && (
        <Sektion rubrik="Risker som väntar på dig">
          {risker.map(rad => (
            <Rad key={rad.project_id} agentId="karin">
              {rad.project_name}
              {typeof rad.cost_percent === 'number' && (
                <>
                  {' — '}
                  {rad.cost_percent}% av kalkylen använt
                  {rad.status === 'over_budget' ? ' (budgeten är överskriden)' : ''}
                </>
              )}
            </Rad>
          ))}
        </Sektion>
      )}

      {fortroende && (
        <Sektion rubrik="Det här sköter teamet själv nu">
          {fortroende.map(rad => (
            <Rad key={rad.key} agentId={rad.agent}>
              {rad.label} sköts automatiskt — {rad.streak} godkända i rad
              {typeof rad.cap_kr === 'number' ? `, upp till ${krText(rad.cap_kr)}` : ''}
            </Rad>
          ))}
        </Sektion>
      )}
    </div>
  )
}

export default MandagskortCard
