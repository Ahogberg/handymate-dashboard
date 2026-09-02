'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, RefreshCw, AlertCircle, Filter } from 'lucide-react'

interface StegRad {
  steg: number
  etikett: string
  nadde: number
  bortfall_pct: number | null
  median_minuter: number | null
  med_tid: number
}

interface Rapport {
  days: number
  summering: {
    foretag: number
    exkluderade_test: number
    klara: number
    betalande: number
    steg: StegRad[]
    median_minuter_till_klar: number | null
    per_variant: Array<{ variant: string; foretag: number; klara: number; steg: Array<{ steg: number; nadde: number }> }>
    fastnade_pa: Array<{ steg: number; etikett: string; antal: number }>
  }
  foretag: Array<{
    business_id: string
    business_name: string
    created_at: string
    is_test: boolean
    variant: string
    max_steg: number
    max_steg_etikett: string
    klar: boolean
    betalande: boolean
    minuter_i_tratten: number | null
    har_tidsstamplar: boolean
  }>
}

const VARIANT_LABEL: Record<string, string> = { studio: 'Setup Studio', classic: 'Klassisk guide', okand: 'Okänd (före 2026-09-01)' }

function minuter(m: number | null): string {
  if (m === null) return '–'
  if (m < 60) return `${m} min`
  if (m < 60 * 48) return `${Math.round(m / 6) / 10} h`
  return `${Math.round(m / 60 / 24)} d`
}

function datum(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function OnboardingFunnelPage() {
  const [days, setDays] = useState(90)
  const [visaTest, setVisaTest] = useState(false)
  const [data, setData] = useState<Rapport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (d: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/onboarding-funnel?days=${d}`, { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte läsa tratten')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(days)
  }, [days, load])

  const s = data?.summering
  const maxNadde = s ? Math.max(1, ...s.steg.map(r => r.nadde)) : 1
  const foretag = data ? data.foretag.filter(f => visaTest || !f.is_test) : []

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2">
              <ArrowLeft className="w-4 h-4" /> Admin
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Onboardingtratten</h1>
            <p className="text-gray-500 text-sm">
              Hur långt kommer nya konton, hur lång tid tar varje steg, och skiljer sig Setup Studio från klassiska guiden?
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[30, 90, 365].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-sm rounded-lg border ${days === d ? 'bg-primary-700 text-white border-primary-700' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
              >
                {d} dagar
              </button>
            ))}
            <button
              onClick={() => setVisaTest(v => !v)}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border ${visaTest ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
            >
              <Filter className="w-4 h-4" /> {visaTest ? 'Döljer inte testkonton' : 'Testkonton dolda'}
            </button>
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
          <div className="flex items-center gap-2 text-gray-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Läser konton…</div>
        )}

        {data && s && (
          <div className="space-y-8">
            <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'Nya konton', value: s.foretag },
                { label: 'Klara', value: s.klara },
                { label: 'Betalande', value: s.betalande },
                { label: 'Median till klar', value: minuter(s.median_minuter_till_klar) },
                { label: 'Testkonton dolda', value: s.exkluderade_test },
              ].map(k => (
                <div key={k.label} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="text-xs uppercase tracking-wide text-gray-500">{k.label}</div>
                  <div className="text-2xl font-semibold text-gray-900 tabular-nums">{k.value}</div>
                </div>
              ))}
            </section>

            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Steg för steg</h2>
                <p className="text-xs text-gray-500">Nådde = konton som kom minst hit. Bortfall räknas mot föregående steg. Tid är median från föregående steg, bara konton med tidsstämplar.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2">Steg</th>
                      <th className="px-3 py-2 w-1/3">Nådde</th>
                      <th className="px-3 py-2 text-right">Antal</th>
                      <th className="px-3 py-2 text-right">Bortfall</th>
                      <th className="px-3 py-2 text-right">Median tid</th>
                      <th className="px-3 py-2 text-right">Med tid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {s.steg.map(r => (
                      <tr key={r.steg}>
                        <td className="px-3 py-2 whitespace-nowrap">{r.steg}. {r.etikett}</td>
                        <td className="px-3 py-2">
                          <div className="h-3 bg-gray-100 rounded">
                            <div className="h-3 bg-primary-600 rounded" style={{ width: `${Math.round((r.nadde / maxNadde) * 100)}%` }} />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.nadde}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${r.bortfall_pct !== null && r.bortfall_pct >= 40 ? 'text-red-700 font-medium' : ''}`}>
                          {r.bortfall_pct === null ? '–' : `${r.bortfall_pct} %`}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{minuter(r.median_minuter)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-500">{r.med_tid}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid md:grid-cols-2 gap-6">
              <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">Per variant</h2>
                </div>
                {s.per_variant.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500">Inga konton i fönstret.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                          <th className="px-3 py-2">Variant</th>
                          <th className="px-3 py-2 text-right">Konton</th>
                          <th className="px-3 py-2 text-right">Klara</th>
                          <th className="px-3 py-2 text-right">Nådde betalning</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {s.per_variant.map(v => (
                          <tr key={v.variant}>
                            <td className="px-3 py-2">{VARIANT_LABEL[v.variant] ?? v.variant}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{v.foretag}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{v.klara}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{v.steg.find(x => x.steg === 4)?.nadde ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-900">Var de ofullbordade står</h2>
                </div>
                {s.fastnade_pa.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500">Alla konton i fönstret är klara.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {s.fastnade_pa.map(f => (
                      <li key={f.steg} className="px-4 py-2 flex items-center justify-between text-sm">
                        <span>{f.steg === 0 ? 'Intro' : `${f.steg}. ${f.etikett}`}</span>
                        <span className="tabular-nums font-medium">{f.antal}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Konton</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2">Företag</th>
                      <th className="px-3 py-2">Skapat</th>
                      <th className="px-3 py-2">Variant</th>
                      <th className="px-3 py-2">Kom till</th>
                      <th className="px-3 py-2 text-right">Tid i tratten</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {foretag.map(f => (
                      <tr key={f.business_id} className={f.is_test ? 'text-gray-400' : ''}>
                        <td className="px-3 py-2 whitespace-nowrap">{f.business_name}{f.is_test ? <span className="ml-1 text-xs">(test)</span> : null}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{datum(f.created_at)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{VARIANT_LABEL[f.variant] ?? f.variant}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{f.max_steg === 0 ? 'Intro' : `${f.max_steg}. ${f.max_steg_etikett}`}{!f.har_tidsstamplar && !f.klar ? <span className="ml-1 text-xs text-gray-400">(utan tid)</span> : null}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{minuter(f.minuter_i_tratten)}</td>
                        <td className="px-3 py-2">
                          {f.klar ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Klar{f.betalande ? ' · betalande' : ''}</span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Pågår</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
