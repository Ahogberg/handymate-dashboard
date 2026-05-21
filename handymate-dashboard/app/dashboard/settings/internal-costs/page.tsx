'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ShieldAlert, Save, Loader2, Info } from 'lucide-react'
import { useCurrentUser } from '@/lib/CurrentUserContext'

/**
 * Intern timkostnad-inställningar (Etapp 2.0, v53 2026-05-21).
 *
 * Rollskydd: endast owner/admin. Andreas spec: 'employee/PM/kalkylator
 * ser ALDRIG' intern lönekostnad — striktare än see_financials-permission.
 *
 * Sidan visar:
 * - Business-default (`business_config.default_internal_hourly_cost`)
 * - Per-medlem-fält i listan (`business_users.internal_hourly_cost`)
 *
 * Sparar via:
 * - PUT /api/business-config/internal-cost-default
 * - PATCH /api/team (body.internal_hourly_cost — också rollskydd)
 *
 * Compute-economics-helpern (Etapp 2.1) prioritetar per-medlem-värdet,
 * fallback till business-default. Om båda saknas → 'arbetskostnad ej
 * konfigurerad' i marginal-vyn (förhindrar falskt hög marginal).
 */

interface TeamMember {
  id: string
  name: string
  role: string
  internal_hourly_cost: number | null
  is_active: boolean
}

export default function InternalCostsSettingsPage() {
  const { user, loading: userLoading, isOwnerOrAdmin } = useCurrentUser()
  const router = useRouter()

  const [defaultCost, setDefaultCost] = useState<string>('')
  const [defaultLoading, setDefaultLoading] = useState(true)
  const [defaultSaving, setDefaultSaving] = useState(false)

  const [members, setMembers] = useState<TeamMember[]>([])
  const [memberLoading, setMemberLoading] = useState(true)
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null)
  const [memberDrafts, setMemberDrafts] = useState<Record<string, string>>({})

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Redirect om inte owner/admin. Vi har även API-rollskydd (defense-in-
  // depth) — men UI-redirect förhindrar att sidan ens renderas.
  useEffect(() => {
    if (!userLoading && user && !isOwnerOrAdmin) {
      router.replace('/dashboard/settings')
    }
  }, [userLoading, user, isOwnerOrAdmin, router])

  const fetchDefault = useCallback(async () => {
    setDefaultLoading(true)
    try {
      const res = await fetch('/api/business-config/internal-cost-default')
      if (!res.ok) throw new Error('Kunde inte hämta default-kostnad')
      const data = await res.json()
      const v = data?.default_internal_hourly_cost
      setDefaultCost(v == null ? '' : String(v))
    } catch (err: any) {
      setErrorMsg(err.message || 'Fel vid hämtning')
    } finally {
      setDefaultLoading(false)
    }
  }, [])

  const fetchMembers = useCallback(async () => {
    setMemberLoading(true)
    try {
      const res = await fetch('/api/team')
      if (!res.ok) throw new Error('Kunde inte hämta teammedlemmar')
      const data = await res.json()
      const list = (data?.members || []) as TeamMember[]
      // Endast aktiva medlemmar — inaktiva exkluderas från intern-kostnad-UI.
      const active = list.filter(m => m.is_active)
      setMembers(active)
      const drafts: Record<string, string> = {}
      for (const m of active) {
        drafts[m.id] = m.internal_hourly_cost == null ? '' : String(m.internal_hourly_cost)
      }
      setMemberDrafts(drafts)
    } catch (err: any) {
      setErrorMsg(err.message || 'Fel vid hämtning')
    } finally {
      setMemberLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOwnerOrAdmin) return
    fetchDefault()
    fetchMembers()
  }, [isOwnerOrAdmin, fetchDefault, fetchMembers])

  async function saveDefault() {
    setDefaultSaving(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const body = {
        default_internal_hourly_cost: defaultCost.trim() === '' ? null : Number(defaultCost),
      }
      const res = await fetch('/api/business-config/internal-cost-default', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Kunde inte spara')
      }
      setSuccessMsg('Default intern kostnad sparad')
    } catch (err: any) {
      setErrorMsg(err.message || 'Fel vid sparning')
    } finally {
      setDefaultSaving(false)
    }
  }

  async function saveMember(id: string) {
    setSavingMemberId(id)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const raw = memberDrafts[id] ?? ''
      const value = raw.trim() === '' ? null : Number(raw)
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        throw new Error('Ogiltigt värde (måste vara ≥ 0 eller tomt)')
      }
      const res = await fetch('/api/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, internal_hourly_cost: value }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Kunde inte spara medlem')
      }
      // Uppdatera lokalt
      setMembers(prev =>
        prev.map(m => (m.id === id ? { ...m, internal_hourly_cost: value } : m)),
      )
      setSuccessMsg('Sparad')
    } catch (err: any) {
      setErrorMsg(err.message || 'Fel vid sparning')
    } finally {
      setSavingMemberId(null)
    }
  }

  if (userLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Laddar…
      </div>
    )
  }

  if (!isOwnerOrAdmin) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-amber-900">Endast för ägare och administratörer</h2>
            <p className="text-sm text-amber-800 mt-1">
              Intern timkostnad används för marginal-beräkning och är synlig endast
              för företagets ägare och administratörer.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Tillbaka till inställningar
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">
        Intern timkostnad
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        Faktisk arbetskostnad per timme (lön + sociala avgifter + overhead). Används
        för marginal-beräkning per projekt. Visas endast för ägare och administratörer.
      </p>

      {errorMsg && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-sm text-emerald-700">
          {successMsg}
        </div>
      )}

      {/* Business-default */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 mb-6">
        <h2 className="font-semibold text-slate-900 mb-1">Default för företaget</h2>
        <p className="text-xs text-slate-500 mb-4 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          Används som fallback när en medlem saknar individuell intern kostnad.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Default intern kostnad (kr/tim)
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={defaultCost}
              onChange={e => setDefaultCost(e.target.value)}
              placeholder="t.ex. 450"
              disabled={defaultLoading || defaultSaving}
              className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={saveDefault}
            disabled={defaultLoading || defaultSaving}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary-700 text-white text-sm font-semibold rounded-xl hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            {defaultSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Spara default
          </button>
        </div>
      </section>

      {/* Per-medlem */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <h2 className="font-semibold text-slate-900 mb-1">Per teammedlem</h2>
        <p className="text-xs text-slate-500 mb-4">
          Tomt fält = använd default ovan. Inaktiva medlemmar visas inte.
        </p>
        {memberLoading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Laddar medlemmar…
          </div>
        ) : members.length === 0 ? (
          <div className="text-sm text-slate-500 py-6">Inga aktiva teammedlemmar.</div>
        ) : (
          <div className="space-y-2">
            {members.map(m => (
              <div
                key={m.id}
                className="flex flex-wrap items-center gap-3 py-3 border-b border-slate-100 last:border-b-0"
              >
                <div className="flex-1 min-w-[160px]">
                  <div className="text-sm font-medium text-slate-900">{m.name}</div>
                  <div className="text-xs text-slate-500">{m.role}</div>
                </div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={memberDrafts[m.id] ?? ''}
                  onChange={e => setMemberDrafts(prev => ({ ...prev, [m.id]: e.target.value }))}
                  placeholder="(default)"
                  disabled={savingMemberId === m.id}
                  className="w-32 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100"
                />
                <span className="text-xs text-slate-500">kr/tim</span>
                <button
                  type="button"
                  onClick={() => saveMember(m.id)}
                  disabled={savingMemberId === m.id}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  {savingMemberId === m.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Spara
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
