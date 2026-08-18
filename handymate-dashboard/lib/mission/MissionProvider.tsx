'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { MissionRow, MissionProgress, MissionDecision } from './mission-progress'
import type { MandateRow } from '@/lib/mandates/mission-mandate'
import type { MandateFacitResult } from '@/lib/mandates/mandate-facit'

/**
 * Den globala kanalen för det aktiva uppdraget — Goal-to-Plan V1 (Etapp C,
 * tasks/jaunty-pondering-hummingbird.md; utökad i Etapp G:
 * expansionspanelen).
 *
 * Speglar MomentsProvider.tsx/FuelProvider.tsx:s idiom rakt av: hämtar
 * `/api/mission/active` EN gång vid mount, exponerar en `refresh()` som
 * andra ytor (MissionPlanCard efter "Starta uppdraget", Uppdragsrad,
 * Jobbkompisens bubbelpillar, MissionPanel efter avsluta/klarmarkera) kan
 * anropa. Ingen intervallpollning — bubblan är monterad på varje
 * dashboardsida ändå, så en `visibilitychange`-omhämtning (flik/app
 * tillbaka i fokus) räcker för att inte visa gammal status en hel session.
 *
 * Fail-soft: rutten själv svarar redan { mission: null } på varje fel
 * (mission-tabellen kan saknas innan sql/v144 körts) — providern lägger
 * bara till att ETT nätverksfel inte kraschar konsumenterna.
 *
 * Etapp G: `decisions` kommer ur SAMMA /api/mission/active-svar som
 * mission/progress (fetch-semantiken är oförändrad — bara ytterligare ett
 * fält ur samma JSON läses av). `panelOpen`/`setPanelOpen` är expansions-
 * panelens (components/mission/MissionPanel.tsx) egna öppna/stängd-state —
 * samma delade-context-mönster som Jobbkompisens isOpen, fast för panelen
 * i stället för chattbubblan.
 *
 * Etapp X (Mission Mandates V1, ägarens upplevelse): `mandate`/`mandateFacit`
 * kommer likaså ur SAMMA svar (nollor bara flyttades ut till ett eget fält
 * i stället för att läggas till en tredje fetch) — `refresh()` uppdaterar
 * alltså redan mandatets läge tillsammans med mission/progress/decisions.
 */

interface MissionState {
  mission: MissionRow | null
  progress: MissionProgress | null
  decisions: MissionDecision[]
  mandate: MandateRow | null
  mandateFacit: MandateFacitResult | null
  loading: boolean
  refresh: () => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
}

const MissionContext = createContext<MissionState>({
  mission: null,
  progress: null,
  decisions: [],
  mandate: null,
  mandateFacit: null,
  loading: true,
  refresh: () => {},
  panelOpen: false,
  setPanelOpen: () => {},
})

export function useMission(): MissionState {
  return useContext(MissionContext)
}

export function MissionProvider({ children }: { children: React.ReactNode }) {
  const [mission, setMission] = useState<MissionRow | null>(null)
  const [progress, setProgress] = useState<MissionProgress | null>(null)
  const [decisions, setDecisions] = useState<MissionDecision[]>([])
  const [mandate, setMandate] = useState<MandateRow | null>(null)
  const [mandateFacit, setMandateFacit] = useState<MandateFacitResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    let aktiv = true
    setLoading(true)
    fetch('/api/mission/active')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!aktiv) return
        setMission(d?.mission ?? null)
        setProgress(d?.progress ?? null)
        setDecisions(Array.isArray(d?.decisions) ? d.decisions : [])
        setMandate(d?.mandate ?? null)
        setMandateFacit(d?.mandateFacit ?? null)
      })
      .catch(err => console.error('[mission] kunde inte hämtas:', err))
      .finally(() => {
        if (aktiv) setLoading(false)
      })
    return () => {
      aktiv = false
    }
  }, [tick])

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') setTick(t => t + 1)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return (
    <MissionContext.Provider
      value={{
        mission, progress, decisions, mandate, mandateFacit, loading,
        refresh: () => setTick(t => t + 1), panelOpen, setPanelOpen,
      }}
    >
      {children}
    </MissionContext.Provider>
  )
}
