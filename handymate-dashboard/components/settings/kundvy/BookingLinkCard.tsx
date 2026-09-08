'use client'

/**
 * "Din bokningslänk" — kortet som ger bokningssidan (/site/[slug]/boka,
 * yta 5) ett liv utanför storefronten. ICP:n har egen hemsida; länken är
 * det som läggs på den, i Google-profilen eller skickas i ett SMS.
 *
 * Ärligt om läget: ingen storefront/slug → gå till Hemsida-sidan;
 * opublicerad → länken svarar 404 tills hemsidan är publicerad (samma grind
 * som book-routen, oförändrad). Reglaget "Besöket kostar inget" skriver
 * business_config.booking_visit_free (sql/v222) — texten på bokningssidan
 * lovar bara det firman själv slagit på.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/Toast'

interface StorefrontRow {
  slug: string | null
  is_published: boolean | null
}

export default function BookingLinkCard({
  businessId,
  visitFree,
  onVisitFreeChange,
}: {
  businessId: string
  /** business_config.booking_visit_free — null tills raden lästs. */
  visitFree: boolean | null
  onVisitFreeChange: (value: boolean) => void
}) {
  const toast = useToast()
  const [storefront, setStorefront] = useState<StorefrontRow | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  const [savingFree, setSavingFree] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/storefront')
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { storefront?: StorefrontRow | null } | null) => {
        if (!cancelled) setStorefront(json?.storefront ?? null)
      })
      .catch(() => { if (!cancelled) setStorefront(null) })
    return () => { cancelled = true }
  }, [businessId])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const slug = storefront?.slug || null
  const url = slug ? `${origin}/site/${slug}/boka` : null
  const published = !!storefront?.is_published

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Kunde inte kopiera — markera länken och kopiera själv')
    }
  }

  async function toggleFree() {
    if (visitFree === null || savingFree) return
    const next = !visitFree
    setSavingFree(true)
    const { error } = await supabase
      .from('business_config')
      .update({ booking_visit_free: next })
      .eq('business_id', businessId)
    setSavingFree(false)
    if (error) {
      toast.error('Inställningen kunde inte sparas')
      return
    }
    onVisitFreeChange(next)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <h3 className="text-[14px] font-semibold text-slate-900 m-0">Din bokningslänk</h3>
      <p className="text-[12px] text-slate-500 mt-0.5 m-0 leading-relaxed">
        Kunden väljer en tid för ett besök, i din färg och med din logotyp. Lägg länken på din hemsida, i
        Google-profilen eller skicka den i ett SMS.
      </p>

      {storefront === undefined ? (
        <div className="flex items-center gap-2 mt-3 text-[12.5px] text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Hämtar länken…
        </div>
      ) : !url ? (
        <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-[12.5px] text-slate-700 leading-relaxed">
          Länken skapas när din hemsida har en adress.{' '}
          <Link href="/dashboard/website" className="font-medium text-slate-900 underline underline-offset-2">
            Öppna Hemsida
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-1.5">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 h-9 rounded-lg border border-slate-300 bg-slate-50 px-2.5 text-[12.5px] text-slate-800 font-mono"
            />
            <button
              type="button"
              onClick={copy}
              aria-label="Kopiera länken"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Öppna bokningssidan"
              className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
          {!published && (
            <p className="mt-2 m-0 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-relaxed">
              Länken aktiveras när hemsidan är publicerad.{' '}
              <Link href="/dashboard/website" className="font-medium underline underline-offset-2">
                Publicera på Hemsida
              </Link>
            </p>
          )}
        </>
      )}

      <label className="mt-3 flex items-start gap-2.5 cursor-pointer select-none">
        <button
          type="button"
          role="switch"
          aria-checked={!!visitFree}
          disabled={visitFree === null || savingFree}
          onClick={toggleFree}
          className={`relative mt-0.5 h-5 w-9 flex-none rounded-full transition-colors disabled:opacity-50 ${visitFree ? 'bg-slate-900' : 'bg-slate-300'}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${visitFree ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
        <span className="text-[12.5px] leading-relaxed text-slate-700">
          <span className="font-medium text-slate-900">Besöket kostar inget</span>
          <br />
          Slå på om du inte tar betalt för hembesöket. Då står det på bokningssidan — annars nämns inget pris.
        </span>
      </label>
    </div>
  )
}
