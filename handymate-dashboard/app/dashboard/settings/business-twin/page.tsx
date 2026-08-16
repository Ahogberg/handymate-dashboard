'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import type { BenchmarkReadinessSnapshot } from '@/lib/benchmark/readiness'

export default function BusinessTwinDataSettingsPage() {
  const { user, loading: userLoading, isOwnerOrAdmin } = useCurrentUser()
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<BenchmarkReadinessSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userLoading && user && !isOwnerOrAdmin) router.replace('/dashboard/settings')
  }, [userLoading, user, isOwnerOrAdmin, router])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/benchmark/readiness')
      const body = await response.json().catch(() => null)
      if (!body || (response.status !== 200 && response.status !== 503)) {
        throw new Error(body?.error || 'Statusen kunde inte hämtas')
      }
      setSnapshot(body as BenchmarkReadinessSnapshot)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Statusen kunde inte hämtas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOwnerOrAdmin) load()
  }, [isOwnerOrAdmin, load])

  async function changeConsent(enabled: boolean) {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch('/api/benchmark/readiness', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.error || 'Samtycket kunde inte sparas')
      setSnapshot(body as BenchmarkReadinessSnapshot)
      setAccepted(false)
      setMessage(enabled ? 'Företaget är anslutet.' : 'Samtycket är återkallat.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Samtycket kunde inte sparas')
    } finally {
      setSaving(false)
    }
  }

  if (userLoading || loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Laddar Business Twin-data…
      </div>
    )
  }
  if (!isOwnerOrAdmin) return null

  const own = snapshot?.own_data
  const enabled = snapshot?.consent.enabled === true

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-8">
      <Link
        href="/dashboard/settings"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Tillbaka till inställningar
      </Link>

      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <Database className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Business Twin-data</h1>
          <p className="mt-1 text-sm text-slate-500">
            Bestäm om kvalitetssäkrade, aggregerade utfall senare får bidra till anonymiserad branschstatistik.
          </p>
        </div>
      </div>

      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {message && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

      {!snapshot?.available ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-900">Inte aktiverat ännu</h2>
          <p className="mt-1 text-sm text-amber-800">{snapshot?.reason || 'Databasstödet saknas.'}</p>
        </section>
      ) : snapshot.demo_tenant ? (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Demo-data är alltid utesluten</h2>
          <p className="mt-1 text-sm text-slate-600">
            Syntetiska projekt får aldrig påverka framtida branschstatistik och kontot kan därför inte anslutas.
          </p>
        </section>
      ) : (
        <>
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700">Din beredskap</p>
                <h2 className="mt-1 font-semibold text-slate-900">
                  {own?.status === 'ready' ? 'Egen data är redo att bidra' : own?.status === 'building' ? 'Underlaget byggs upp' : 'Första utfallet väntar'}
                </h2>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                {enabled ? 'Ansluten' : 'Inte ansluten'}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Metric label="Kvalitetsgodkända utfall" value={own?.qualified_outcomes ?? 0} />
              <Metric label="Redo jobbtyper" value={own?.ready_job_types ?? 0} />
              <Metric label="Till nästa jobbtyp" value={own?.next_outcomes_needed ?? 0} suffix=" jobb" />
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Ett eget underlag räknas först efter tre kvalitetsgodkända avslut inom samma jobbtyp.
            </p>
          </section>

          <section className="mt-5 rounded-2xl border border-teal-100 bg-teal-50/60 p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
              <div>
                <h2 className="font-semibold text-slate-900">Tydlig datagräns</h2>
                <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
                  <li>Endast kvalitetsgodkända procenttal per jobbtyp får ingå i framtida aggregat.</li>
                  <li>Kundnamn, adresser, texter, dokument, fakturor och personuppgifter ingår aldrig.</li>
                  <li>Ingen branschsiffra visas före minst {snapshot.policy.min_businesses_per_cohort} företag och {snapshot.policy.min_outcomes_per_cohort} utfall i samma kohort.</li>
                  <li>Samtycket kan återkallas när som helst och ändringen revisionsloggas.</li>
                  <li>Att tacka nej eller återkalla påverkar inte Handymates vanliga funktioner.</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
              <div>
                <h2 className="font-semibold text-slate-900">Branschunderlaget är inte öppet ännu</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Handymate samlar först samtycke och verifierade utfall. Det finns ingen dold ranking eller påhittad branschrekommendation i V1.
                </p>
              </div>
            </div>

            {enabled ? (
              <button
                type="button"
                onClick={() => changeConsent(false)}
                disabled={saving}
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Återkalla samtycke
              </button>
            ) : (
              <div className="mt-5">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={event => setAccepted(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700"
                  />
                  <span className="text-sm text-slate-700">
                    Jag samtycker frivilligt till att företagets kvalitetsgodkända utfallsprocent får användas i framtida anonymiserade branschaggregat enligt gränserna ovan.
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => changeConsent(true)}
                  disabled={!accepted || saving}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Anslut företaget
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Metric({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value.toLocaleString('sv-SE')}{suffix}</p>
    </div>
  )
}
