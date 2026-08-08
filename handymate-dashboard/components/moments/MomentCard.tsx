'use client'

import Link from 'next/link'
import { X } from 'lucide-react'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { AGENT_INFO } from '@/components/dashboard/agentPersonas'
import { formatKr, type AgentMoment } from '@/lib/moments/derive'

/**
 * Det globala fynd-kortet — en kollega som knackar på axeln.
 *
 * ═══ FORMSPRÅKET ═══
 *
 * Agentens porträtt och namn först: det är EN PERSON som kommer med ETT
 * FYND, inte ett system som notifierar. Beloppet är den största texten på
 * kortet när det finns — det är beloppet som motiverar avbrottet, och
 * finns inget belopp har interruption-motorn redan sett till att kortet
 * aldrig visas globalt.
 *
 * En primär CTA (utfallsspråk: "Fakturera 34 900 kr") och ett kryss.
 * Ingen sekundär knapprad — ett avbrott ska gå att agera på eller vifta
 * bort med EN tumme, inget mittemellan.
 *
 * ═══ VAD DET ALDRIG GÖR ═══
 *
 * Stänger sig aldrig självt (auto-dismiss mitt i läsning är att rycka
 * papperet ur handen på någon) och utför aldrig något — CTA:n är alltid
 * en LÄNK till ytan där beslutet fattas. Samma regel som nyhetsraderna:
 * skillnaden mellan berättar och föreslår måste hålla.
 *
 * Placeringen (nere till vänster på desktop, ovanför tumzonen på mobil)
 * krockar medvetet inte med Jobbkompisen-bubblan nere till höger.
 */
export function MomentCard({
  moment,
  onDismiss,
}: {
  moment: AgentMoment
  onDismiss: () => void
}) {
  const agent = AGENT_INFO[moment.agentId]

  return (
    <div
      role="status"
      className="fixed z-[100] bottom-24 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-24 sm:w-[380px] bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-900/10 p-4 animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      <div className="flex items-start gap-3">
        <AgentAvatar agentKey={moment.agentId} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 truncate">
              <b className="font-semibold text-slate-900">{agent?.name ?? 'Teamet'}</b>
              {agent?.role ? ` · ${agent.role}` : ''} hittade något
            </span>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Stäng"
              className="ml-auto shrink-0 w-8 h-8 -mr-1 -mt-1 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {typeof moment.amountKr === 'number' && (
            <div className="font-heading text-2xl font-bold text-slate-900 mt-1">
              {formatKr(moment.amountKr)}
            </div>
          )}

          <p className="m-0 mt-0.5 text-sm font-medium text-slate-800 leading-snug">
            {moment.headline}
          </p>
          <p className="m-0 mt-1 text-[13px] text-slate-500 leading-relaxed line-clamp-2">
            {moment.explanation}
          </p>

          <Link
            href={moment.action.href}
            onClick={onDismiss}
            className="mt-3 inline-flex items-center justify-center min-h-[44px] w-full px-4 rounded-xl bg-primary-700 text-white text-sm font-semibold"
          >
            {moment.action.label}
          </Link>
        </div>
      </div>
    </div>
  )
}
