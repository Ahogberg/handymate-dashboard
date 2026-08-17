'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { MissionRow, MissionProgress } from './mission-progress'

/**
 * Den globala kanalen för det aktiva uppdraget — Goal-to-Plan V1 (Etapp C,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * Speglar MomentsProvider.tsx/FuelProvider.tsx:s idiom rakt av: hämtar
 * `/api/mission/active` EN gång vid mount, exponerar en `refresh()` som
 * andra ytor (MissionPlanCard efter "Starta uppdraget", Uppdragsrad,
 * Jobbkompisens bubbelpillar) kan anropa. Ingen intervallpollning — bubblan
 * är monterad på varje dashboardsida ändå, så en `visibilitychange`-
 * omhämtning (flik/app tillbaka i fokus) räcker för att inte visa gammal
 * status en hel session.
 *
 * Fail-soft: rutten själv svarar redan { mission: null } på varje fel
 * (mission-tabellen kan saknas innan sql/v144 körts) — providern lägger
 * bara till att ETT nätverksfel inte kraschar konsumenterna.
 */

interface MissionState {
  mission: MissionRow | null
  progress: MissionProgress | null
  loading: boolean
  refresh: () => void
}

const MissionContext = createContext<MissionState>({
  mission: null,
  progress: null,
  loading: true,
  refresh: () => {},
})

export function useMission(): MissionState {
  return useContext(MissionContext)
}

export function MissionProvider({ children }: { children: React.ReactNode }) {
  const [mission, setMission] = useState<MissionRow | null>(null)
  const [progress, setProgress] = useState<MissionProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let aktiv = true
    setLoading(true)
    fetch('/api/mission/active')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!aktiv) return
        setMission(d?.mission ?? null)
        setProgress(d?.progress ?? null)
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
    <MissionContext.Provider value={{ mission, progress, loading, refresh: () => setTick(t => t + 1) }}>
      {children}
    </MissionContext.Provider>
  )
}
