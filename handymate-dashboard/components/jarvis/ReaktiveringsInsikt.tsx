'use client'

import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { useJobbuddy } from '@/lib/JobbuddyContext'

/**
 * "Låt Matte väga in det" — narrow slice av Mission-Control-förslaget
 * (tasks/jaunty-pondering-hummingbird.md). Hannas agenttips: en grupp
 * tysta tidigare kunder av samma jobbtyp (ur
 * lib/customers/reactivation-signal.ts / /api/jarvis/reactivation-signal),
 * men INGEN direktaktion-knapp. Kortets enda knapp handoffar frågan in i
 * den befintliga Matte-chatten (samma mekanism som Hem-sidans
 * snabbknappar, se lib/JobbuddyContext.tsx pendingPrompt) — hantverkaren
 * ser och kan redigera frågan innan den skickas, ingenting går iväg
 * automatiskt härifrån.
 *
 * Det här är en MEDVETEN avvikelse från GorDettaForst-mönstret (par av
 * knappar för ett beslut) — se planfilen för resonemanget. Testad
 * mekaniskt i tests/reaktiverings-insikt.spec.ts: filen får inte
 * innehålla de vanliga beslutsknapparnas etiketter, bara handoff-anropet
 * och den egna knappens text.
 */

export interface ReaktiveringsSignal {
  job_type: string
  count: number
  /** Tröskeln (i månader) som DEFINIERAR gruppen — inte ett per-kund snitt. */
  quietMonths: number
}

interface Props {
  signal: ReaktiveringsSignal | null
}

/**
 * Naturlig svensk possessiv-/adjektivform för de vanligaste jobbtyperna
 * i produktionsdatan (se app/api/agent/trigger/tool-definitions.ts och
 * lib/proactive-care.ts JOB_LIFECYCLE för värdemängden). Okänd jobbtyp →
 * rå strängen med versal — ingen påhittad grammatik för en typ vi inte
 * känner igen.
 */
function jobTypeLabel(jobType: string): string {
  const known: Record<string, string> = {
    badrum: 'badrums',
    kök: 'köks',
    el: 'el',
    tak: 'tak',
    vvs: 'vvs',
  }
  const knownLabel = known[jobType.toLowerCase()]
  if (knownLabel) return knownLabel
  return jobType.charAt(0).toUpperCase() + jobType.slice(1)
}

export function ReaktiveringsInsikt({ signal }: Props) {
  const { setPendingPrompt, setActiveTab, setIsOpen } = useJobbuddy()

  if (!signal) return null

  const { job_type, count, quietMonths } = signal
  const label = jobTypeLabel(job_type)

  const oppnaMatte = () => {
    setPendingPrompt(
      `Jag ser ${count} tidigare ${label}-kunder som varit tysta i minst ${quietMonths} månader. Väg in om det är läge att kontakta dem — kolla mot kapacitet och pågående kundkontakter innan du föreslår något.`,
    )
    setActiveTab('chat')
    setIsOpen(true)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-2.5">
      <div className="flex items-center gap-2.5 mb-2">
        <AgentAvatar agentKey="hanna" size="sm" />
        <span className="flex-1 min-w-0 text-sm font-semibold text-slate-900">Hanna märker något</span>
      </div>

      <p className="m-0 text-[13px] leading-relaxed text-slate-600">
        Jag ser {count} tidigare {label}-kunder som varit tysta i minst {quietMonths} månader.
      </p>

      <button
        type="button"
        onClick={oppnaMatte}
        className="mt-3 px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800 transition-colors"
      >
        Låt Matte väga in det
      </button>
    </div>
  )
}
