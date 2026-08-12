'use client'

/**
 * KomIgangRail — smal ersättning för gamla checklistan (docs/design/
 * FORSTA-30-MINUTERNA.md, DEL 4). Tre uppdrag i stället för elva punkter,
 * RIKTIG completion ur app/api/onboarding/kom-igang/route.ts — aldrig
 * statiska false.
 *
 * Synlig bara för NYA konton (< 30 dagar, business.created_at) med minst ett
 * okomplett uppdrag. Döljs för gott när alla tre är klara — localStorage-
 * minnet gör det permanent så kortet inte flimrar fram igen vid nästa
 * hämtning (t.ex. om något API-svar dröjer och tillfälligt ser ofullständigt
 * ut). Fail-safe: ett rutt-fel gör att railen inte renderas alls.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'

const DONE_KEY = 'hm_kom_igang_klar'
const KONTO_MAX_DAGAR = 30

interface KomIgangData {
  ring_test: boolean
  forsta_artefakten: boolean
  pwa: boolean
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

  useEffect(() => {
    if (data && data.ring_test && data.forsta_artefakten && data.pwa) {
      try {
        localStorage.setItem(DONE_KEY, '1')
      } catch { /* kortet döljer sig ändå just den här sessionen (allaKlara nedan) */ }
    }
  }, [data])

  if (failed || dismissedForGood || !data) return null

  const allaKlara = data.ring_test && data.forsta_artefakten && data.pwa
  if (allaKlara) return null

  const kontotsAlderDagar = business.created_at
    ? (Date.now() - new Date(business.created_at).getTime()) / 86_400_000
    : null
  // Saknas created_at (borde inte hända) — fail-safe åt "nytt konto" hellre
  // än att tyst gömma railen för alla.
  const nyttKonto = kontotsAlderDagar === null || kontotsAlderDagar < KONTO_MAX_DAGAR
  if (!nyttKonto) return null

  const uppdrag: Array<{ key: string; klar: boolean; label: string; href: string }> = [
    { key: 'ring', klar: data.ring_test, label: 'Ring ditt nummer — hör Lisa fånga samtalet', href: '/dashboard/settings/phone' },
    { key: 'artefakt', klar: data.forsta_artefakten, label: 'Spela in ett testmöte eller skapa din första offert', href: '/dashboard/inkorg?tab=mote' },
    { key: 'pwa', klar: data.pwa, label: 'Lägg appen på hemskärmen', href: '/dashboard/help' },
  ]

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="m-0 text-sm font-semibold text-slate-900">Kom igång</h2>
      </div>
      <div className="flex flex-col gap-2.5">
        {uppdrag.map(u => (
          <Link
            key={u.key}
            href={u.href}
            className="flex items-start gap-2.5 min-h-[36px] group"
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 border transition-colors ${
                u.klar ? 'bg-primary-700 border-primary-700 text-white' : 'border-slate-300 text-transparent'
              }`}
            >
              <Check className="w-3 h-3" strokeWidth={3} />
            </span>
            <span
              className={`text-[13px] leading-snug ${
                u.klar ? 'text-slate-400 line-through' : 'text-slate-700 group-hover:text-primary-700'
              }`}
            >
              {u.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default KomIgangRail
