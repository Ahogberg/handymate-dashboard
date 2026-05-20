'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Session-keepalive: refreshar Supabase JWT-tokens i bakgrunden så att
 * användaren inte tappar sessionen efter idle-period.
 *
 * Problem (pilot 2026-05-19): Christoffer rapporterade att efter en stund
 * utan aktivitet kunde han inte spara ändringar — fick 401 från API-routes.
 * Supabase JWT default-expiry är 1h. Auto-refresh i v2-klienten triggas
 * främst vid getUser/getSession-anrop eller window-focus-events — men om
 * en sida är öppen länge utan navigation triggas det inte.
 *
 * Fix: setInterval var 45 min anropar refreshSession() explicit. Detta
 * uppdaterar både in-memory-state och cookies så server-side
 * getAuthenticatedBusiness ser fortsatt giltig session vid nästa anrop.
 *
 * Anropas från app/dashboard/layout.tsx så den är aktiv på alla dashboard-
 * sidor. Inaktiveras automatiskt vid unmount (logout/navigation till
 * login).
 */
const REFRESH_INTERVAL_MS = 45 * 60 * 1000 // 45 minutes — säkerhetsmargin före 1h-expiry

export function useSessionKeepalive(): void {
  useEffect(() => {
    if (!supabase) return

    let cancelled = false

    const refresh = async () => {
      if (cancelled) return
      try {
        const { data, error } = await supabase.auth.refreshSession()
        if (error) {
          console.warn('[session-keepalive] refresh failed:', error.message)
          return
        }
        if (data.session) {
          console.log('[session-keepalive] session refreshed at', new Date().toISOString())
        }
      } catch (err: any) {
        console.warn('[session-keepalive] refresh threw:', err?.message || err)
      }
    }

    // Refresha också när användaren kommer tillbaka från annan tab (browser
    // pausar timers i bakgrunden, så vi kanske missat ett 45-min-fönster).
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }

    const interval = setInterval(refresh, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])
}
