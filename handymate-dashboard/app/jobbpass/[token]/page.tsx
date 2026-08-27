'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, AlertTriangle } from 'lucide-react'
import type { JobbpassCustomerView } from '@/lib/jobbpass/jobbpass'
import { JobbpassView } from '@/components/jobbpass/JobbpassView'

/**
 * Publik jobbpass-portal (Etapp Ä, Closeout-to-Lifetime). Samma
 * publika-länk-idiom som app/quote/[token]/page.tsx: ingen inloggning,
 * token i URL:en, ett fetch mot en publik GET-rutt.
 *
 * Sektionerna renderas av components/jobbpass/JobbpassView.tsx — samma
 * komponent som kundportalens "Ditt hem" (Fastighetspasset steg 1,
 * 2026-08-27). Renderar BARA sektioner som faktiskt har data.
 */

type PageState = 'loading' | 'error' | 'ready'

export default function JobbpassPage() {
  const params = useParams()
  const token = params?.token as string

  const [state, setState] = useState<PageState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [pass, setPass] = useState<JobbpassCustomerView | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/jobbpass/public/${token}`)
        const data = await res.json()
        if (!res.ok) {
          setErrorMessage(data.error || 'Jobbpasset kunde inte hämtas')
          setState('error')
          return
        }
        setPass(data.jobbpass)
        setState('ready')
      } catch {
        setErrorMessage('Kunde inte hämta jobbpasset. Försök igen senare.')
        setState('error')
      }
    }
    if (token) load()
  }, [token])

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary-700 animate-spin" />
          <p className="text-gray-500 text-sm">Laddar jobbpass...</p>
        </div>
      </div>
    )
  }

  if (state === 'error' || !pass) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white shadow-sm rounded-3xl border border-gray-200 p-8 text-center">
          <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Jobbpasset kunde inte visas</h2>
          <p className="text-gray-500">{errorMessage}</p>
        </div>
      </div>
    )
  }

  const businessName = pass.business.name || 'Ditt hantverksföretag'

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-50 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary-50 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg overflow-hidden text-white font-bold text-2xl"
            style={{ background: pass.business.accent_color || '#0F766E' }}
          >
            {pass.business.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pass.business.logo_url} alt={businessName} className="w-full h-full object-contain bg-white" />
            ) : (
              <span>{businessName.charAt(0).toUpperCase() || 'H'}</span>
            )}
          </div>
          <p className="text-xs uppercase tracking-wider text-primary-700 font-semibold mb-1">Jobbpass</p>
          <h1 className="text-2xl font-bold text-gray-900">{pass.project.name}</h1>
          <p className="text-gray-500 mt-1 text-sm">{businessName}</p>
        </div>

        <JobbpassView pass={pass} />

        <p className="text-center text-xs text-gray-400 pb-8">
          Drivs av <span className="text-primary-700 font-medium">Handymate</span>
        </p>
      </div>
    </div>
  )
}
