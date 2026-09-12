'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  Flame,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  Zap,
} from 'lucide-react'

type Account = {
  id: string
  company_name: string
  org_number: string | null
  website: string | null
  industry: string | null
  employee_count: number | null
  city: string | null
  owner_email: string | null
  source: string
  source_url: string | null
  icp_score: number
  pain_score: number
  timing_score: number
  growth_score: number
  warmth_score: number
  ability_to_pay_score: number
  total_score: number
  why_now: string | null
  pain_hypothesis: string | null
  personalization_hook: string | null
  recommended_channel: string | null
  recommended_cta: string | null
  status: string
  lost_reason: string | null
  next_action: string | null
  next_action_at: string | null
  last_contact_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

type RevenueResponse = {
  accounts: Account[]
  queue: Account[]
  signals: Array<{
    id: string
    account_id: string
    signal_type: string
    title: string
    detail: string | null
    strength: number
    source: string | null
    source_url: string | null
    observed_at: string
  }>
  owners: string[]
  metrics: {
    total: number
    active: number
    high_priority: number
    stale: number
    won: number
    stage_counts: Record<string, number>
  }
}

const STAGES = [
  ['identified', 'Identifierad'],
  ['contacted', 'Kontaktad'],
  ['conversation', 'Dialog'],
  ['audit_booked', 'Audit bokad'],
  ['demo', 'Demo'],
  ['proposal', 'Förslag'],
  ['verbal_commit', 'Muntligt ja'],
  ['won', 'Vunnen'],
  ['lost', 'Förlorad'],
  ['nurture', 'Nurture'],
] as const

const initialForm = {
  company_name: '',
  org_number: '',
  industry: '',
  city: '',
  employee_count: '',
  website: '',
  owner_email: '',
  source: 'manual',
  icp_score: '15',
  pain_score: '10',
  timing_score: '10',
  growth_score: '5',
  warmth_score: '0',
  ability_to_pay_score: '5',
  why_now: '',
  pain_hypothesis: '',
  personalization_hook: '',
  recommended_channel: 'call',
  recommended_cta: 'Admin Leak Audit',
  next_action: 'Ring',
  next_action_at: '',
}

function formatWhen(value: string | null) {
  if (!value) return 'Ej satt'
  const d = new Date(value)
  return d.toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function scoreClass(score: number) {
  if (score >= 80) return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (score >= 65) return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

function stageLabel(stage: string) {
  return STAGES.find(([value]) => value === stage)?.[1] || stage
}

export default function RevenueOSPage() {
  const router = useRouter()
  const [data, setData] = useState<RevenueResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [setupRequired, setSetupRequired] = useState(false)
  const [search, setSearch] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [selected, setSelected] = useState<Account | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  async function load(showSpinner = false) {
    if (showSpinner) setRefreshing(true)
    try {
      const qs = ownerFilter !== 'all' ? `?owner=${encodeURIComponent(ownerFilter)}` : ''
      const res = await fetch(`/api/admin/revenue${qs}`)
      if (res.status === 403) {
        router.push('/login?error=admin_required')
        return
      }
      const body = await res.json()
      if (!res.ok) {
        setSetupRequired(Boolean(body.setup_required))
        throw new Error(body.error || 'Kunde inte hämta Revenue OS')
      }
      setData(body)
      setSetupRequired(false)
      setError('')
      if (selected) {
        const fresh = body.accounts?.find((a: Account) => a.id === selected.id)
        if (fresh) setSelected(fresh)
      }
    } catch (e: any) {
      setError(e.message || 'Något gick fel')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerFilter])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data?.accounts || []
    return (data?.accounts || []).filter(a =>
      [a.company_name, a.org_number, a.industry, a.city, a.owner_email]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q))
    )
  }, [data, search])

  const signalsByAccount = useMemo(() => {
    const map: Record<string, RevenueResponse['signals']> = {}
    for (const signal of data?.signals || []) {
      ;(map[signal.account_id] ||= []).push(signal)
    }
    return map
  }, [data])

  async function createAccount(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/admin/revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'account',
          ...form,
          employee_count: form.employee_count || null,
          next_action_at: form.next_action_at ? new Date(form.next_action_at).toISOString() : null,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Kunde inte skapa konto')
      setToast(`${body.account.company_name} tillagd`)
      setShowCreate(false)
      setForm(initialForm)
      await load()
      setSelected(body.account)
    } catch (e: any) {
      setToast(e.message || 'Kunde inte skapa konto')
    } finally {
      setSaving(false)
    }
  }

  async function patchAccount(id: string, patch: Record<string, unknown>) {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/revenue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Kunde inte uppdatera')
      setToast('Uppdaterat')
      setSelected(body.account)
      await load()
    } catch (e: any) {
      setToast(e.message || 'Kunde inte uppdatera')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50 grid place-items-center"><Loader2 className="h-8 w-8 animate-spin text-primary-700" /></div>
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {toast && <div className="fixed top-4 right-4 z-50 rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-xl">{toast}</div>}

      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button onClick={() => router.push('/admin')} className="mb-3 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" /> Admin
            </button>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white"><Target className="h-5 w-5" /></div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Revenue OS</h1>
                <p className="text-sm text-slate-500">Buyer Radar → seller queue → lärande</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => load(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Uppdatera
            </button>
            <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">
              <Plus className="h-4 w-4" /> Lägg till bolag
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="flex gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div>
              <div className="font-semibold">Revenue OS kunde inte laddas</div>
              <div className="mt-1">{error}</div>
              {setupRequired && <div className="mt-2 font-medium">Kör <code>sql/revenue_os_v1.sql</code> i Supabase först.</div>}
            </div></div>
          </div>
        )}

        <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Accounts', data?.metrics.total || 0, Building2],
            ['Aktiva', data?.metrics.active || 0, TrendingUp],
            ['75+ score', data?.metrics.high_priority || 0, Flame],
            ['Stale >7 dagar', data?.metrics.stale || 0, CalendarClock],
            ['Vunna', data?.metrics.won || 0, CheckCircle2],
          ].map(([label, value, Icon]: any) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between text-slate-500"><span className="text-xs font-semibold uppercase tracking-wide">{label}</span><Icon className="h-4 w-4" /></div>
              <div className="text-2xl font-bold">{value}</div>
            </div>
          ))}
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_1.9fr]">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-center justify-between">
                <div><h2 className="font-semibold">Dagens kö</h2><p className="text-xs text-slate-500">Due actions först, sedan Buyer Score</p></div>
                <Zap className="h-5 w-5 text-amber-500" />
              </div>
            </div>
            <div className="max-h-[700px] divide-y divide-slate-100 overflow-auto">
              {(data?.queue || []).length === 0 && <div className="p-6 text-sm text-slate-500">Inga konton i kön ännu.</div>}
              {(data?.queue || []).map((a, index) => (
                <button key={a.id} onClick={() => setSelected(a)} className="block w-full p-4 text-left hover:bg-slate-50">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{index + 1}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2"><div className="truncate font-semibold">{a.company_name}</div><span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${scoreClass(a.total_score)}`}>{a.total_score}</span></div>
                      <div className="mt-1 line-clamp-2 text-xs text-slate-500">{a.why_now || a.pain_hypothesis || 'Research saknas'}</div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs"><span className="font-medium text-primary-700">{a.next_action || 'Sätt nästa action'}</span><span className="text-slate-400">{formatWhen(a.next_action_at)}</span></div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Sök bolag, ort, bransch..." className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400" /></div>
                <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  <option value="all">Alla säljare</option>
                  {(data?.owners || []).map(owner => <option key={owner} value={owner}>{owner}</option>)}
                </select>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[minmax(180px,1.4fr)_90px_120px_minmax(130px,1fr)_36px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span>Bolag</span><span>Score</span><span>Stage</span><span>Nästa steg</span><span />
              </div>
              <div className="max-h-[700px] divide-y divide-slate-100 overflow-auto">
                {filtered.map(a => (
                  <button key={a.id} onClick={() => setSelected(a)} className="grid w-full grid-cols-[minmax(180px,1.4fr)_90px_120px_minmax(130px,1fr)_36px] gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50">
                    <div className="min-w-0"><div className="truncate font-semibold">{a.company_name}</div><div className="truncate text-xs text-slate-500">{[a.city, a.industry, a.employee_count ? `${a.employee_count} pers` : null].filter(Boolean).join(' · ')}</div></div>
                    <div><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${scoreClass(a.total_score)}`}>{a.total_score}/100</span></div>
                    <div className="text-xs font-medium text-slate-600">{stageLabel(a.status)}</div>
                    <div className="min-w-0"><div className="truncate text-xs font-medium">{a.next_action || '—'}</div><div className="text-[11px] text-slate-400">{formatWhen(a.next_action_at)}</div></div>
                    <ArrowRight className="h-4 w-4 text-slate-300" />
                  </button>
                ))}
                {filtered.length === 0 && <div className="p-8 text-center text-sm text-slate-500">Inga bolag matchar.</div>}
              </div>
            </div>
          </section>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30" onClick={() => setSelected(null)}>
          <aside onClick={e => e.stopPropagation()} className="h-full w-full max-w-xl overflow-auto bg-white p-6 shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Account brief</div><h2 className="text-2xl font-bold">{selected.company_name}</h2><p className="text-sm text-slate-500">{[selected.org_number, selected.city, selected.industry].filter(Boolean).join(' · ')}</p></div>
              <span className={`rounded-full border px-3 py-1.5 text-sm font-bold ${scoreClass(selected.total_score)}`}>{selected.total_score}/100</span>
            </div>

            <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[
                ['ICP', selected.icp_score, 25], ['Pain', selected.pain_score, 20], ['Timing', selected.timing_score, 20],
                ['Growth', selected.growth_score, 15], ['Warmth', selected.warmth_score, 10], ['Pay', selected.ability_to_pay_score, 10],
              ].map(([label, value, max]) => <div key={String(label)} className="rounded-xl bg-slate-50 p-2 text-center"><div className="text-[10px] font-semibold uppercase text-slate-400">{label}</div><div className="mt-1 text-sm font-bold">{value}/{max}</div></div>)}
            </div>

            <div className="space-y-4">
              <BriefBlock icon={Sparkles} label="Varför nu?" text={selected.why_now} fallback="Lägg till en source-backed timing-hypotes." />
              <BriefBlock icon={Target} label="Pain hypothesis" text={selected.pain_hypothesis} fallback="Vilket adminproblem ska vi testa — inte anta?" />
              <BriefBlock icon={Zap} label="Hook" text={selected.personalization_hook} fallback="Skriv en kort personlig öppning från evidensen." />

              {(signalsByAccount[selected.id] || []).length > 0 && <div className="rounded-2xl border border-slate-200 p-4"><div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Senaste signaler</div><div className="space-y-2">{signalsByAccount[selected.id].slice(0, 5).map(s => <div key={s.id} className="flex gap-3 text-sm"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400" /><div><div className="font-medium">{s.title}</div><div className="text-xs text-slate-500">{s.signal_type} · styrka {s.strength}/5 · {new Date(s.observed_at).toLocaleDateString('sv-SE')}</div></div></div>)}</div></div>}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-500">Stage<select value={selected.status} disabled={saving} onChange={e => patchAccount(selected.id, { status: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-900">{STAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="text-xs font-semibold text-slate-500">Owner<input value={selected.owner_email || ''} onChange={e => setSelected({ ...selected, owner_email: e.target.value })} onBlur={e => patchAccount(selected.id, { owner_email: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900" /></label>
              </div>

              <div className="rounded-2xl bg-slate-950 p-4 text-white"><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Rekommenderad action</div><div className="font-semibold">{selected.next_action || 'Sätt nästa action'}</div><div className="mt-1 text-xs text-slate-400">{selected.recommended_channel || 'kanal ej satt'} · {selected.recommended_cta || 'Admin Leak Audit'}</div></div>
            </div>
          </aside>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-slate-950/40 p-4" onClick={() => setShowCreate(false)}>
          <form onSubmit={createAccount} onClick={e => e.stopPropagation()} className="my-8 w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-bold">Nytt prospect</h2><p className="text-sm text-slate-500">Fakta, score, hypotes och nästa action.</p></div><UserRound className="h-5 w-5 text-slate-400" /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Bolagsnamn *" value={form.company_name} onChange={v => setForm({ ...form, company_name: v })} />
              <Input label="Org.nr" value={form.org_number} onChange={v => setForm({ ...form, org_number: v })} />
              <Input label="Bransch" value={form.industry} onChange={v => setForm({ ...form, industry: v })} />
              <Input label="Ort" value={form.city} onChange={v => setForm({ ...form, city: v })} />
              <Input label="Antal anställda" type="number" value={form.employee_count} onChange={v => setForm({ ...form, employee_count: v })} />
              <Input label="Website" value={form.website} onChange={v => setForm({ ...form, website: v })} />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-6">
              {[
                ['ICP /25', 'icp_score'], ['Pain /20', 'pain_score'], ['Timing /20', 'timing_score'],
                ['Growth /15', 'growth_score'], ['Warm /10', 'warmth_score'], ['Pay /10', 'ability_to_pay_score'],
              ].map(([label, key]) => <Input key={key} label={label} type="number" value={(form as any)[key]} onChange={v => setForm({ ...form, [key]: v })} />)}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <TextArea label="Varför nu?" value={form.why_now} onChange={v => setForm({ ...form, why_now: v })} />
              <TextArea label="Pain hypothesis" value={form.pain_hypothesis} onChange={v => setForm({ ...form, pain_hypothesis: v })} />
              <TextArea label="Personlig hook" value={form.personalization_hook} onChange={v => setForm({ ...form, personalization_hook: v })} />
              <TextArea label="Nästa action" value={form.next_action} onChange={v => setForm({ ...form, next_action: v })} />
            </div>

            <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium">Avbryt</button><button disabled={saving || !form.company_name.trim()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Spara prospect</button></div>
          </form>
        </div>
      )}
    </div>
  )
}

function BriefBlock({ icon: Icon, label, text, fallback }: { icon: any; label: string; text: string | null; fallback: string }) {
  return <div className="rounded-2xl border border-slate-200 p-4"><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400"><Icon className="h-4 w-4" />{label}</div><p className={`text-sm leading-relaxed ${text ? 'text-slate-800' : 'italic text-slate-400'}`}>{text || fallback}</p></div>
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="text-xs font-semibold text-slate-500">{label}<input type={type} value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-slate-400" /></label>
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="text-xs font-semibold text-slate-500">{label}<textarea rows={3} value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-slate-400" /></label>
}
