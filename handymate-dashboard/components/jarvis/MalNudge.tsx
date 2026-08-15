'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Target, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

/**
 * Mål-nudge (2026-08-15, backlog #11) — onboarding-fixen når bara NYA
 * konton. De befintliga 22 som redan onboardat före det här bygget får
 * annars aldrig se att omsättningsmål finns. En rad text + länk, ingen
 * ny kortyp, ingen ny approval-mekanik — samma "systemnivå-innehåll före
 * individuella beslutskort"-princip som mandagskortApproval-bannern i
 * JarvisHome.tsx, men avvisningsbar via localStorage (inte databasen —
 * det här är en nudge, inte ett beslut att spåra).
 *
 * Fail-soft: laddningsläge och läsfel visar INGET (hellre tyst än en
 * felaktig nudge när vi faktiskt inte vet om målet är satt).
 */
const DISMISS_KEY_PREFIX = 'hm_mal_nudge_dismissed_'

export function MalNudge() {
  const business = useBusiness()
  const [revenueTargetSet, setRevenueTargetSet] = useState<boolean | null>(null)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY_PREFIX + business.business_id) === '1')
    } catch {
      setDismissed(false)
    }
  }, [business.business_id])

  useEffect(() => {
    let aktiv = true
    supabase
      .from('business_config')
      .select('revenue_target_annual_sek')
      .eq('business_id', business.business_id)
      .single()
      .then(({ data, error }: { data: { revenue_target_annual_sek: number | null } | null; error: { message?: string } | null }) => {
        if (!aktiv) return
        if (error || !data) {
          console.error('[MalNudge] business_config-läsning misslyckades:', error?.message)
          return
        }
        setRevenueTargetSet(data.revenue_target_annual_sek != null)
      })
    return () => { aktiv = false }
  }, [business.business_id])

  if (dismissed || revenueTargetSet !== false) return null

  function stang() {
    try { localStorage.setItem(DISMISS_KEY_PREFIX + business.business_id, '1') } catch { /* best effort */ }
    setDismissed(true)
  }

  return (
    <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-2.5">
      <Target className="w-4 h-4 text-primary-600 shrink-0" />
      <p className="flex-1 min-w-0 m-0 text-sm text-slate-700">
        Inget omsättningsmål satt än —{' '}
        <Link href="/dashboard/settings?tab=economics" className="text-primary-700 font-medium hover:underline">
          sätt ett i Inställningar
        </Link>{' '}
        så kan Matte visa hur ni ligger till.
      </p>
      <button
        type="button"
        onClick={stang}
        className="text-slate-400 hover:text-slate-600 shrink-0"
        aria-label="Stäng"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export default MalNudge
