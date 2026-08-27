'use client'

/**
 * KomIgangRail — "Teamet behöver detta för att hjälpa dig bättre"
 * (docs/design/FORSTA-30-MINUTERNA.md DEL 4; Lager 3 / B7, 2026-08-27).
 *
 * Förut tre identiska rader för alla konton. Nu uppgifter härledda ur
 * kontots RIKTIGA luckor (app/api/onboarding/kom-igang/route.ts →
 * lib/onboarding/kom-igang-tasks.ts): en primär med agent, värde och
 * tidsuppskattning, upp till två sekundära. Completion kommer alltid ur
 * signalen, aldrig ur ett kryss användaren sätter själv.
 *
 * Synlig bara för NYA konton (< 30 dagar, business.created_at) med minst en
 * öppen uppgift. Döljs för gott när allt är klart — localStorage-minnet gör
 * det permanent så kortet inte flimrar fram igen vid nästa hämtning.
 * Fail-safe: ett rutt-fel gör att railen inte renderas alls.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { AgentAvatar } from '@/components/agents/AgentAvatar'
import { KOM_IGANG_HEADING, visibleKomIgangTasks, type KomIgangTask } from '@/lib/onboarding/kom-igang-tasks'

const DONE_KEY = 'hm_kom_igang_klar'
const KONTO_MAX_DAGAR = 30

interface KomIgangData {
  ring_test: boolean
  forsta_artefakten: boolean
  pwa: boolean
  /** Lager 3 / B7 — saknas på ett äldre API-svar: då faller vi till de tre booleanerna. */
  tasks?: KomIgangTask[]
}

/** Fallback när rutten (ännu) inte skickar tasks — samma tre rader som förut. */
function fallbackTasks(d: KomIgangData): KomIgangTask[] {
  return [
    { key: 'ring', agent: 'lisa', label: 'Ring ditt nummer — hör Lisa fånga samtalet', varde: '', minuter: 2, href: '/dashboard/settings/phone', klar: d.ring_test },
    { key: 'daniel_quote', agent: 'daniel', label: 'Spela in ett testmöte eller skapa din första offert', varde: '', minuter: 5, href: '/dashboard/inkorg?tab=mote', klar: d.forsta_artefakten },
    { key: 'pwa', agent: 'matte', label: 'Lägg appen på hemskärmen', varde: '', minuter: 1, href: '/dashboard/help', klar: d.pwa },
  ]
}

export function KomIgangRail() {
  const business = useBusiness()
  const [data, setData] = useState<KomIgangData | null>(null)
  const [failed, setFailed] = useState(false)
  const [dismissedForGood, setDismissedForGood] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(DONE_KEY)) setDismissedForGood(true)
    } catch { /* trasig localStorage — railen får bara visas normalt */ }
  }, [])

  useEffect(() => {
    if (dismissedForGood) return
    let aktiv = true
    fetch('/api/onboarding/kom-igang')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('fel svar'))))
      .then(d => { if (aktiv) setData(d) })
      .catch(() => { if (aktiv) setFailed(true) })
    return () => { aktiv = false }
  }, [dismissedForGood])

  const tasks = data ? (Array.isArray(data.tasks) ? data.tasks : fallbackTasks(data)) : []
  const allaKlara = data !== null && tasks.length > 0 && tasks.every(t => t.klar)

  useEffect(() => {
    if (allaKlara) {
      try {
        localStorage.setItem(DONE_KEY, '1')
      } catch { /* kortet döljer sig ändå just den här sessionen (allaKlara nedan) */ }
    }
  }, [allaKlara])

  if (failed || dismissedForGood || !data) return null
  if (allaKlara || tasks.length === 0) return null

  const kontotsAlderDagar = business.created_at
    ? (Date.now() - new Date(business.created_at).getTime()) / 86_400_000
    : null
  // Saknas created_at (borde inte hända) — fail-safe åt "nytt konto" hellre
  // än att tyst gömma railen för alla.
  const nyttKonto = kontotsAlderDagar === null || kontotsAlderDagar < KONTO_MAX_DAGAR
  if (!nyttKonto) return null

  const { primary, secondary } = visibleKomIgangTasks(tasks)
  if (!primary) return null
  const klaraAntal = tasks.filter(t => t.klar).length

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="m-0 text-sm font-semibold text-slate-900">{KOM_IGANG_HEADING}</h2>
        <span className="text-[11px] text-slate-400 shrink-0">{klaraAntal}/{tasks.length} klart</span>
      </div>

      {/* Primär — agenten som behöver den, värdet, tiden */}
      <Link href={primary.href} className="block rounded-xl border border-primary-100 bg-primary-50/60 p-3 mb-2.5 group hover:border-primary-300 transition-colors">
        <div className="flex items-start gap-2.5">
          <AgentAvatar agentKey={primary.agent} size="sm" />
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-semibold text-slate-900 leading-snug group-hover:text-primary-700">{primary.label}</p>
            {primary.varde && <p className="m-0 mt-1 text-xs text-slate-600 leading-snug">{primary.varde}</p>}
            <p className="m-0 mt-1.5 text-[11px] text-slate-400">~{primary.minuter} min</p>
          </div>
        </div>
      </Link>

      {secondary.length > 0 && (
        <div className="flex flex-col gap-2">
          {secondary.map(u => (
            <Link key={u.key} href={u.href} className="flex items-start gap-2.5 min-h-[32px] group">
              <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 border border-slate-300 text-transparent">
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
              <span className="text-[13px] leading-snug text-slate-700 group-hover:text-primary-700">
                {u.label} <span className="text-slate-400">· ~{u.minuter} min</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default KomIgangRail
