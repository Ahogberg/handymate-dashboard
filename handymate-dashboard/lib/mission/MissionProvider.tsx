'use client'

import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import type { MissionHandover } from './handover'
import { createContext, useContext, useEffect, useState } from 'react'
import type { MissionRow, MissionProgress, MissionDecision } from './mission-progress'
import type { MandateRow } from '@/lib/mandates/mission-mandate'
import type { MandateFacitResult } from '@/lib/mandates/mandate-facit'

/** Shared, account-scoped mission read. Failures are visible, never empty success.
 * Refresh on return to the app; this is not a background execution scheduler.
 */

interface MissionState {
  mission: MissionRow | null
  progress: MissionProgress | null
  decisions: MissionDecision[]
  mandate: MandateRow | null
  mandateFacit: MandateFacitResult | null
  handover: MissionHandover | null
  error: string | null
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
  handover: null, error: null,
  loading: true,
  refresh: () => {},
  panelOpen: false,
  setPanelOpen: () => {},
})

export function useMission(): MissionState {
  return useContext(MissionContext)
}

export function MissionProvider({ children }: { children: React.ReactNode }) {
  const business = useBusiness()
  const { user } = useCurrentUser()
  const scope = `${business.business_id}:${user?.id || ''}`
  const [loadedScope, setLoadedScope] = useState('')
  const [handover, setHandover] = useState<MissionHandover | null>(null)
  const [error, setError] = useState<string | null>(null)
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
    setError(null)
    setMission(null); setProgress(null); setDecisions([]); setMandate(null); setMandateFacit(null); setHandover(null)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    fetch('/api/mission/active', { signal: controller.signal, cache: 'no-store' })
      .then(r => { if (r.status === 401 || r.status === 403) return null; if (!r.ok) throw new Error('Uppdraget kunde inte kontrolleras. Försök igen.'); return r.json() })
      .then(d => {
        if (!aktiv) return
        if (d && (!Object.prototype.hasOwnProperty.call(d, 'mission') || d.mission && d.mission.business_id !== business.business_id)) throw new Error('invalid mission scope')
        setLoadedScope(scope)
        setHandover(d?.handover ?? null)
        setMission(d?.mission ?? null)
        setProgress(d?.progress ?? null)
        setDecisions(Array.isArray(d?.decisions) ? d.decisions : [])
        setMandate(d?.mandate ?? null)
        setMandateFacit(d?.mandateFacit ?? null)
      })
      .catch(() => { if (aktiv) { setLoadedScope(scope); setError('Uppdraget kunde inte kontrolleras. Försök igen.') } })
      .finally(() => {
        clearTimeout(timeout)
        if (aktiv) setLoading(false)
      })
    return () => {
      aktiv = false
      clearTimeout(timeout); controller.abort()
    }
  }, [tick, business.business_id, user?.id, scope])

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
        mission: loadedScope === scope ? mission : null,
        progress: loadedScope === scope ? progress : null,
        decisions: loadedScope === scope ? decisions : [],
        mandate: loadedScope === scope ? mandate : null,
        mandateFacit: loadedScope === scope ? mandateFacit : null,
        handover: loadedScope === scope ? handover : null,
        error: loadedScope === scope ? error : null,
        loading: loading || loadedScope !== scope,
        refresh: () => setTick(t => t + 1), panelOpen, setPanelOpen,
      }}
    >
      {children}
    </MissionContext.Provider>
  )
}
