'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, RefreshCw, AlertCircle, BellOff } from 'lucide-react'

interface Summering {
  skapade: number
  godkanda: number
  avvisade: number
  utgangna: number
  vantande: number
  ovriga: number
  utgangna_pct: number | null
  bedomning: 'signal' | 'brus' | 'for_fa'
}

interface Rapport {
  days: number
  rows_scanned: number
  row_cap_hit: boolean
  totalt: Summering
  per_typ: Array<{ approval_type: string } & Summering>
  per_foretag_typ: Array<{ business_id: string; business_name: string; is_demo: boolean; approval_type: string } & Summering>
  brusgrind: Array<{
    business_id: string
    business_name: string
    is_demo: boolean
    approval_type: string
    tysta: boolean
    skal: string
    oppnar_igen: string | null
    underlag: { avgjorda: number; utgangna: number; godkanda: number; utgangna_pct: number | null }
  }>
  konstanter: { min_sample: number; brus_expired_pct: number; paus_dagar: number; brusgrindade_typer: string[] }
}

const BEDOMNING: Record<Summering['bedomning'], { label: string; cls: string }> = {
  signal: { label: 'Signal', cls: 'bg-green-100 text-green-700' },
  brus: { label: 'Brus', cls: 'bg-red-100 text-red-700' },
  for_fa: { label: 'För få', cls: 'bg-gray-100 text-gray-600' },
}

function pct(v: number | null): string {
  return v === null ? '–' : `${v} %`
}

function Bedomning({ b }: { b: Summering['bedomning'] }) {
  const m = BEDOMNING[b]
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`}>{m.label}</span>
}

function Rad({ s }: { s: Summering }) {
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums">{s.skapade}</td>
      <td className="px-3 py-2 text-right tabular-nums text-green-700">{s.godkanda}</td>
      <td className="px-3 py-2 text-right tabular-nums">{s.avvisade}</td>
      <td className="px-3 py-2 text-right tabular-nums text-red-700">{s.utgangna}</td>
      <td className="px-3 py-2 text-right tabular-nums text-gray-500">{s.vantande}</td>
      <td className="px-3 py-2 text-right tabular-nums">{pct(s.utgangna_pct)}</td>
      <td className="px-3 py-2"><Bedomning b={s.bedomning} /></td>
    </>
  )
}

const HEAD = (
  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
    <th className="px-3 py-2">Typ</th>
    <th className="px-3 py-2 text-right">Skapade</th>
    <th className="px-3 py-2 text-right">Godkända</th>
    <th className="px-3 py-2 text-right">Avvisade</th>
    <th className="px-3 py-2 text-right">Utgångna</th>
    <th className="px-3 py-2 text-right">Väntande</th>
    <th className="px-3 py-2 text-right">Utgångna %</th>
    <th className="px-3 py-2">Bedömning</th>
  </tr>
)

export default function KortkvalitetPage() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Rapport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (d: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/kortkvalitet?days=${d}`, { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte läsa kortkvaliteten')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(days)
  }, [days, load])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2">
              <ArrowLeft className="w-4 h-4" /> Admin
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Kortkvalitet</h1>
            <p className="text-gray-500 text-sm">
              Blir godkännandekorten signal eller brus? Räknade utfall per typ och företag, plus brusgrindens läge.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[30, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-sm rounded-lg border ${days === d ? 'bg-primary-700 text-white border-primary-700' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
              >
                {d} dagar
              </button>
            ))}
            <button
              onClick={() => load(days)}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Uppdatera
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 mb-6 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center gap-2 text-gray-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Läser kort…</div>
        )}

        {data && (
          <div className="space-y-8">
            <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Skapade', value: data.totalt.skapade },
                { label: 'Godkända', value: data.totalt.godkanda },
                { label: 'Utgångna', value: data.totalt.utgangna },
                { label: 'Utgångna %', value: pct(data.totalt.utgangna_pct) },
              ].map(k => (
                <div key={k.label} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-xs uppercase tracking-wide text-gray-500">{k.label}</div>
                  <div className="text-2xl font-semibold text-gray-900 tabular-nums">{k.value}</div>
                </div>
              ))}
            </section>

            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <BellOff className="w-4 h-4 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Brusgrinden</h2>
                <span className="text-xs text-gray-500">
                  {data.konstanter.brusgrindade_typer.join(', ')} · ≥{data.konstanter.min_sample} avgjorda · ≥{data.konstanter.brus_expired_pct} % utgångna → paus {data.konstanter.paus_dagar} dagar
                </span>
              </div>
              {data.brusgrind.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-500">Inga kort av brusgrindade typer i fönstret.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2">Företag</th>
                        <th className="px-3 py-2">Typ</th>
                        <th className="px-3 py-2">Läge</th>
                        <th className="px-3 py-2">Skäl</th>
                        <th className="px-3 py-2">Öppnar igen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.brusgrind.map(r => (
                        <tr key={`${r.business_id}-${r.approval_type}`}>
                          <td className="px-3 py-2 whitespace-nowrap">{r.business_name}{r.is_demo ? <span className="ml-1 text-xs text-gray-400">(demo)</span> : null}</td>
                          <td className="px-3 py-2 font-mono text-xs">{r.approval_type}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${r.tysta ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'}`}>
                              {r.tysta ? 'Pausad' : 'Öppen'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-700">{r.skal}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.oppnar_igen ? r.oppnar_igen.slice(0, 10) : '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Per korttyp — alla företag</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">{HEAD}</thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.per_typ.map(r => (
                      <tr key={r.approval_type}>
                        <td className="px-3 py-2 font-mono text-xs">{r.approval_type}</td>
                        <Rad s={r} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Per företag och korttyp</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2">Företag</th>
                      <th className="px-3 py-2">Typ</th>
                      <th className="px-3 py-2 text-right">Skapade</th>
                      <th className="px-3 py-2 text-right">Godkända</th>
                      <th className="px-3 py-2 text-right">Avvisade</th>
                      <th className="px-3 py-2 text-right">Utgångna</th>
                      <th className="px-3 py-2 text-right">Väntande</th>
                      <th className="px-3 py-2 text-right">Utgångna %</th>
                      <th className="px-3 py-2">Bedömning</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.per_foretag_typ.map(r => (
                      <tr key={`${r.business_id}-${r.approval_type}`}>
                        <td className="px-3 py-2 whitespace-nowrap">{r.business_name}{r.is_demo ? <span className="ml-1 text-xs text-gray-400">(demo)</span> : null}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.approval_type}</td>
                        <Rad s={r} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <p className="text-xs text-gray-500">
              {data.rows_scanned} kort lästa senaste {data.days} dagarna{data.row_cap_hit ? ' (taket nått — fönstret är avklippt)' : ''}.
              Räknade fakta, inte kausalitet.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
