'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { FuelLevel } from '@/lib/costs/fuel'

interface FuelState {
  level: FuelLevel | null
  loading: boolean
  refresh: () => void
}

const FuelContext = createContext<FuelState>({
  level: null,
  loading: true,
  refresh: () => {},
})

export function useFuel(): FuelState {
  return useContext(FuelContext)
}

/**
 * Mirrors MomentsProvider.tsx: fetch:ar server-data en gång, exponerar den
 * via useFuel() till valfritt antal konsumenter (Sidebar-badgen, billing-
 * sidans mätare, JarvisHome:s varningskort — alla delar samma hämtning).
 *
 * Fail-soft (Bränsle-mätaren, 2026-08-14): ett fel eller ett trasigt svar
 * lämnar `level` som null — konsumenterna tolkar null som "visa inget",
 * ALDRIG som "0 % kvar". En mätare som ljuger om att bränslet är slut är
 * värre än en mätare som tillfälligt inte syns.
 */
export function FuelProvider({ children }: { children: React.ReactNode }) {
  const [level, setLevel] = useState<FuelLevel | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let aktiv = true
    setLoading(true)
    fetch('/api/billing/fuel')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (aktiv && d && !d.error) setLevel(d as FuelLevel)
      })
      .catch(err => console.error('[fuel] kunde inte hämtas:', err))
      .finally(() => {
        if (aktiv) setLoading(false)
      })
    return () => {
      aktiv = false
    }
  }, [tick])

  return (
    <FuelContext.Provider value={{ level, loading, refresh: () => setTick(t => t + 1) }}>
      {children}
    </FuelContext.Provider>
  )
}
