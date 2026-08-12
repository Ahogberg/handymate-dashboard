'use client'

import { useEffect, useState } from 'react'
import { Copy, ExternalLink, Globe } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/Toast'

/**
 * PortalLankKnapp — genväg till kundportalen från valfri yta (kundkort,
 * projektsida, deal-detalj/kort). Byggd 2026-08-12 så hantverkaren slipper
 * gå via kundkortet varje gång.
 *
 * Läser portal_token/portal_enabled direkt från `customer`-tabellen
 * (samma RLS-skyddade klientläsning kundkortet gör, se
 * app/dashboard/customers/[id]/page.tsx fetchData). Aktivering återanvänder
 * det befintliga POST /api/customers/[id]/portal-link — ingen ny
 * aktiveringslogik skapas här.
 *
 * Fail-safe: alla fel gömmer knappen tyst (aldrig en trasig yta).
 */

type Status = 'loading' | 'active' | 'inactive' | 'hidden'

interface PortalLankKnappProps {
  customerId: string | null | undefined
  /**
   * 'button'  = full bredd (kundkort-liknande ytor)
   * 'chip'    = liten pill med text (deal-detaljvyn, bland Ring/SMS/Karta)
   * 'icon'    = ikon + liten etikett under, för hover-rader med flera
   *             likadana knappar (t.ex. DealCard-hovern: Ring/SMS/Karta)
   * 'compact' = par av små ikonknappar (öppna + kopiera), inline bredvid
   *             text — t.ex. i en info-rad med kundnamnet
   */
  variant?: 'button' | 'chip' | 'icon' | 'compact'
  className?: string
}

export function PortalLankKnapp({ customerId, variant = 'button', className = '' }: PortalLankKnappProps) {
  const toast = useToast()
  const [status, setStatus] = useState<Status>('loading')
  const [token, setToken] = useState<string | null>(null)
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!customerId || !supabase) {
        setStatus('hidden')
        return
      }
      try {
        const { data, error } = await supabase
          .from('customer')
          .select('portal_token, portal_enabled')
          .eq('customer_id', customerId)
          .maybeSingle()

        if (cancelled) return

        if (error || !data) {
          setStatus('hidden')
          return
        }

        if (data.portal_token && data.portal_enabled) {
          setToken(data.portal_token)
          setStatus('active')
        } else {
          setStatus('inactive')
        }
      } catch {
        if (!cancelled) setStatus('hidden')
      }
    }

    setStatus('loading')
    load()
    return () => {
      cancelled = true
    }
  }, [customerId])

  async function activate(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!customerId || activating) return
    setActivating(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/portal-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        const data = await res.json()
        setToken(data.token)
        setStatus('active')
      }
    } catch {
      // tyst — knappen finns kvar, användaren kan försöka igen
    }
    setActivating(false)
  }

  async function copyLink(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!token) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/portal/${token}`)
      toast.success('Länk kopierad')
    } catch {
      // tyst — clipboard kan nekas av webbläsaren
    }
  }

  if (status === 'loading' || status === 'hidden') return null

  // Portalen inte aktiverad — diskret aktivera-variant. Göms helt i
  // ikon-läget (kompakta kort har inte plats för aktiveringsflödet).
  if (status === 'inactive') {
    if (variant === 'icon') return null
    return (
      <button
        type="button"
        onClick={activate}
        disabled={activating}
        className={
          variant === 'chip'
            ? `inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-50 transition-colors ${className}`
            : `inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-primary-700 transition-colors ${className}`
        }
      >
        <Globe className="w-3.5 h-3.5" />
        {activating ? 'Aktiverar...' : 'Aktivera kundportal'}
      </button>
    )
  }

  // status === 'active'
  if (variant === 'compact') {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <a
          href={`/portal/${token}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title="Öppna kundportalen"
          className="p-1.5 rounded-lg text-gray-400 hover:text-primary-700 hover:bg-gray-100 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <button
          onClick={copyLink}
          title="Kopiera länk"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      </span>
    )
  }

  if (variant === 'icon') {
    return (
      <a
        href={`/portal/${token}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-primary-700 transition-colors ${className}`}
        title="Öppna kundportalen"
      >
        <Globe className="w-3.5 h-3.5" />
        <span className="text-[10px]">Portal</span>
      </a>
    )
  }

  if (variant === 'chip') {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <a
          href={`/portal/${token}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal-200 bg-teal-50 text-sm text-primary-700 hover:bg-teal-100 transition-colors"
        >
          <Globe className="w-4 h-4" /> Kundportal
        </a>
        <button
          onClick={copyLink}
          title="Kopiera länk"
          className="p-2 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        >
          <Copy className="w-4 h-4" />
        </button>
      </span>
    )
  }

  // variant === 'button' (default)
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <a
        href={`/portal/${token}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-primary-700 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-all"
      >
        <ExternalLink className="w-4 h-4" /> Öppna kundportalen
      </a>
      <button
        onClick={copyLink}
        title="Kopiera länk"
        className="p-2.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors flex-shrink-0"
      >
        <Copy className="w-4 h-4" />
      </button>
    </div>
  )
}
