'use client'

// Vad hände med genomgångarna partnern skickade?
//
// Läget kommer från GET /api/partners/sales-cases, som i sin tur läser
// lib/sales/case-lage.ts. Komponenten hittar ALDRIG på ett läge själv: den
// visar rubriken rutten skickar, och en länk bara när rutten skickade en.

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { formatDate } from './types'

interface Genomgang {
  id: string
  foretag: string
  kontakt: string | null
  skickad: string
  lage: 'konto_skapat' | 'utgangen' | 'oppnad' | 'skickad'
  rubrik: string
  tidpunkt: string | null
  url: string | null
}

// Färgen säger vad partnern ska känna, inte vad systemet gjorde.
const FARG: Record<Genomgang['lage'], string> = {
  konto_skapat: 'bg-teal-50 text-primary-800',
  oppnad: 'bg-sky-50 text-sky-800',
  skickad: 'bg-slate-100 text-slate-600',
  utgangen: 'bg-amber-50 text-amber-800',
}

export default function MinaGenomgangar() {
  const [data, setData] = useState<Genomgang[] | null>(null)
  const [fel, setFel] = useState('')
  const [hamtar, setHamtar] = useState(false)
  const [kopierad, setKopierad] = useState<string | null>(null)

  const hamta = useCallback(async () => {
    setHamtar(true)
    try {
      const res = await fetch('/api/partners/sales-cases', { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Kunde inte hämta dina genomgångar.')
      setData(body.genomgangar || [])
      setFel('')
    } catch (e) {
      setFel((e as Error).message)
    } finally {
      setHamtar(false)
    }
  }, [])

  useEffect(() => { void hamta() }, [hamta])

  async function kopiera(g: Genomgang) {
    if (!g.url) return
    try {
      await navigator.clipboard.writeText(g.url)
      setKopierad(g.id)
      setTimeout(() => setKopierad(null), 2000)
    } catch {
      setFel('Kunde inte kopiera länken. Öppna den och kopiera från adressfältet.')
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col gap-3.5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-slate-900">Dina genomgångar</h2>
          <p className="text-[13px] text-slate-500 mt-0.5">
            Vad som hänt med länkarna du skickat efter mötena.
          </p>
        </div>
        <button
          onClick={() => void hamta()}
          disabled={hamtar}
          className="inline-flex items-center gap-1.5 text-[13px] text-primary-700 hover:text-primary-800 disabled:opacity-60"
        >
          {hamtar ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Uppdatera
        </button>
      </header>

      {fel && <p role="alert" className="rounded-lg bg-red-50 p-3 text-[13px] text-red-700">{fel}</p>}
      {!data && !fel && <p role="status" className="text-[13px] text-slate-500">Hämtar dina genomgångar…</p>}

      {data?.length === 0 && (
        <p className="text-[13px] text-slate-600">
          Du har inte skickat någon genomgång än. Kör{' '}
          <a href="/partners/material/genomgang" className="text-primary-700 underline">säljgenomgången</a>{' '}
          i ett kundmöte — länken du skickar dyker upp här med kundens svar.
        </p>
      )}

      {data && data.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {data.map(g => (
            <li key={g.id} className="flex flex-col gap-2 px-3.5 py-3 rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{g.foretag}</p>
                  <p className="text-xs text-slate-500">
                    {[g.kontakt, `skickad ${formatDate(g.skickad)}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs flex-none ${FARG[g.lage]}`}>
                  {g.rubrik}{g.tidpunkt ? ` ${formatDate(g.tidpunkt)}` : ''}
                </span>
              </div>
              {g.url && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => void kopiera(g)}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3 border border-slate-200 rounded-full text-[13px] text-slate-700 bg-white hover:border-teal-400 hover:text-primary-700 transition-colors"
                  >
                    {kopierad === g.id
                      ? <><Check className="w-3.5 h-3.5" /> Kopierad</>
                      : <><Copy className="w-3.5 h-3.5" /> Kopiera kundens länk</>}
                  </button>
                  <a
                    href={g.url}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3 border border-slate-200 rounded-full text-[13px] text-slate-700 bg-white hover:border-teal-400 hover:text-primary-700 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Öppna
                  </a>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-slate-500">
        Att kunden startar ett konto är inte samma sak som utbetald provision — den följer
        det ordinarie partnerflödet och syns under Upplupen provision.
      </p>
    </section>
  )
}
