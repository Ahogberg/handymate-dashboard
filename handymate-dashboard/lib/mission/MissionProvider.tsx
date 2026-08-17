'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { MissionRow, MissionProgress, MissionDecision } from './mission-progress'

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
 */

interface MissionState {
  mission: MissionRow | null
  progress: MissionProgress | null
  decisions: MissionDecision[]
  loading: boolean
  refresh: () => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
}

const MissionContext = createContext<MissionState>({
  mission: null,
  progress: null,
  decisions: [],
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
      value={{ mission, progress, decisions, loading, refresh: () => setTick(t => t + 1), panelOpen, setPanelOpen }}
    >
      {children}
    </MissionContext.Provider>
  )
}
