'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface Options {
  tables: string[]
  businessId: string | null | undefined
  onChange: () => void
  pollIntervalMs?: number
}

/**
 * Håller sidan uppdaterad via Supabase Realtime med polling som fallback.
 *
 * Prenumererar på INSERT/UPDATE/DELETE på angivna tabeller filtrerade på
 * `business_id`. Om Realtime inte är aktiverat för tabellen kör en poll
 * var `pollIntervalMs` (default 30s) som bakup.
 */
export function useRealtimeRefresh({ tables, businessId, onChange, pollIntervalMs = 30_000 }: Options) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!businessId) return

    // Realtime-subscription per tabell
    const channels = tables.map(table => {
      const ch = supabase
        .channel(`rt-${table}-${businessId}`)
        .on(
          'postgres_changes' as any,
          {
            event: '*',
            schema: 'public',
            table,
            filter: `business_id=eq.${businessId}`,
          },
          () => { onChangeRef.current() }
        )
        .subscribe()
      return ch
    })

    // Polling-fallback (triggar även om Realtime fungerar — billigt och säkert)
    const pollId = setInterval(() => { onChangeRef.current() }, pollIntervalMs)

    return () => {
      channels.forEach(ch => { try { supabase.removeChannel(ch) } catch { /* noop */ } })
      clearInterval(pollId)
    }
  }, [tables.join(','), businessId, pollIntervalMs])
}
