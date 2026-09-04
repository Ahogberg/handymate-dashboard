'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Ban,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardCopy,
  FileUp,
  Globe,
  Loader2,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Trophy,
  X,
} from 'lucide-react'
import { granskaLaunchCsv, type AvvisadRad } from '@/lib/launch-desk/csv'
import { channelPolicy } from '@/lib/launch-desk/policy'
import { priorityScore } from '@/lib/launch-desk/scoring'
import type { GtmSignalSnapshot } from '@/lib/launch-desk/signaler'
import type {
  GtmAccount,
  GtmActivity,
  GtmActivityChannel,
  GtmFunnel,
  GtmOutcome,
  GtmStatus,
  GtmSuppressionReason,
} from '@/lib/launch-desk/types'
import type { Veckopuls } from '@/lib/launch-desk/veckopuls'

const STATUS_LABELS: Record<GtmStatus, string> = {
  imported: 'Importerad',
  qualified: 'Kvalificerad',
  ready: 'Redo',
  contacted: 'Kontaktad',
  replied: 'Svarat',
  meeting_booked: 'Möte bokat',
  demo_booked: 'Demo bokad',
  offer_sent: 'Erbjudande skickat',
  won: 'Kund',
  lost: 'Förlorad',
  suppressed: 'Spärrad',
}

const CHANNEL_LABELS: Record<string, string> = {
  warm_intro: 'Varm introduktion', phone: 'Telefon', linkedin: 'LinkedIn',
  email: 'E-post', letter: 'Brev', video: 'Personlig video', meeting: 'Möte',
  demo: 'Demo', other: 'Notering', none: 'Bedöm manuellt',
}

const OUTCOME_LABELS: Record<GtmOutcome, string> = {
  attempted: 'Kontaktförsök', no_answer: 'Inget svar', spoke: 'Pratat',
  replied: 'Svarat', meeting_booked: 'Möte bokat', demo_booked: 'Demo bokad',
  offer_sent: 'Erbjudande skickat', won: 'Vunnen kund', lost: 'Förlorad', note: 'Notering',
}

const EMPTY_FUNNEL: GtmFunnel = {
  total: 0, ready: 0, due: 0, contacted: 0, replied: 0,
  meetings: 0, demos: 0, offers: 0, won: 0, suppressed: 0,
}

function dateLabel(value: string | null): string {
  if (!value) return 'Inte planerad'
  return new Date(value).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
}

function dateTimeLabel(value: string): string {
  return new Date(value).toLocaleString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Läser ut signal-snapshoten ur brief_source_snapshot.signals (pass 1b,
 * tasks/plan-launch-desk-signaler.md) — skriven av signaler-rutten. */
function signalSnapshotFromAccount(account: GtmAccount): (GtmSignalSnapshot & { error?: string }) | null {
  const raw = (account.brief_source_snapshot as Record<string, unknown> | undefined)?.signals
  return raw && typeof raw === 'object' ? raw as GtmSignalSnapshot & { error?: string } : null
}

/** Rekryteringssignalen ur snapshoten (2026-09-03). Att en firma söker folk
 *  betyder att den växer — och en växande firma har precis fått det
 *  administrativa problemet vi löser. Därför syns den i LISTAN, inte bara i
 *  lådan: den ska gå att sortera och sålla på utan att öppna varje rad. */
function rekryteringssignal(account: GtmAccount) {
  return signalSnapshotFromAccount(account)?.signals?.find(s => s.key === 'rekryterar') || null
}

function dateTimeLocal(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function statusClass(status: GtmStatus): string {
  if (status === 'won') return 'bg-emerald-100 text-emerald-700'
  if (status === 'suppressed' || status === 'lost') return 'bg-red-50 text-red-700'
  if (['replied', 'meeting_booked', 'demo_booked', 'offer_sent'].includes(status)) return 'bg-amber-100 text-amber-800'
  return 'bg-primary-50 text-primary-700'
}

export default function LaunchDeskPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<GtmAccount[]>([])
  const [funnel, setFunnel] = useState<GtmFunnel>(EMPTY_FUNNEL)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [selected, setSelected] = useState<GtmAccount | null>(null)
  const [baraRekryterande, setBaraRekryterande] = useState(false)
  const [activities, setActivities] = useState<GtmActivity[]>([])
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState<unknown[]>([])
  const [avvisadeRader, setAvvisadeRader] = useState<AvvisadRad[]>([])
  const [importing, setImporting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [batchSignalsBusy, setBatchSignalsBusy] = useState(false)
  const [toast, setToast] = useState('')

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ limit: '500' })
      if (search.trim()) params.set('q', search.trim())
      if (status !== 'active' && status !== 'all') params.set('status', status)
      const response = await fetch(`/api/admin/launch/accounts?${params}`)
      const data = await response.json()
      if (response.status === 403) {
        router.replace('/login?error=admin_required')
        return
      }
      if (!response.ok) throw new Error(data.error || 'Kunde inte läsa Launch Desk')
      setAccounts(data.accounts || [])
      setFunnel(data.funnel || EMPTY_FUNNEL)
    } catch (err: any) {
      setError(err?.message || 'Kunde inte läsa Launch Desk')
    } finally {
      setLoading(false)
    }
  }, [router, search, status])

  useEffect(() => {
    const timer = setTimeout(loadAccounts, 180)
    return () => clearTimeout(timer)
  }, [loadAccounts])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  const visibleAccounts = useMemo(() => {
    const active = status === 'active'
      ? accounts.filter(account => !['won', 'lost', 'suppressed'].includes(account.status))
      : accounts
    const filtrerad = baraRekryterande ? active.filter(a => rekryteringssignal(a)) : active
    return [...filtrerad].sort((a, b) => {
      // Rekryterande firmor först — den starkaste öppningen vi har. Inom
      // varje grupp gäller den befintliga prioriteringen oförändrat.
      const rek = Number(Boolean(rekryteringssignal(b))) - Number(Boolean(rekryteringssignal(a)))
      if (rek !== 0) return rek
      return priorityScore({
        fitScore: b.fit_score, nextActionAt: b.next_action_at, status: b.status,
      }) - priorityScore({ fitScore: a.fit_score, nextActionAt: a.next_action_at, status: a.status })
    })
  }, [accounts, status, baraRekryterande])

  async function openAccount(account: GtmAccount) {
    setSelected(account)
    setActivities([])
    setDetailsLoading(true)
    try {
      const response = await fetch(`/api/admin/launch/accounts/${account.id}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kunde inte läsa prospektet')
      setSelected(data.account)
      setActivities(data.activities || [])
    } catch (err: any) {
      setToast(err?.message || 'Kunde inte läsa prospektet')
    } finally {
      setDetailsLoading(false)
    }
  }

  async function refreshSelected() {
    if (!selected) return
    await openAccount(selected)
    await loadAccounts()
  }

  async function prepareBrief() {
    if (!selected) return
    setBusy(true)
    try {
      const response = await fetch('/api/admin/launch/brief', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selected.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kunde inte förbereda kontaktunderlaget')
      setSelected(data.account)
      setToast(data.account.brief_generated_by === 'ai' ? 'AI-underlaget är förberett' : 'Källsäker mall skapad')
      await loadAccounts()
    } catch (err: any) {
      setToast(err?.message || 'Kunde inte förbereda kontaktunderlaget')
    } finally {
      setBusy(false)
    }
  }

  async function readSignals() {
    if (!selected) return
    setBusy(true)
    try {
      const response = await fetch(`/api/admin/launch/accounts/${selected.id}/signaler`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kunde inte läsa sajten')
      if (data.account) setSelected(data.account)
      const antal = data.snapshot?.signals?.length || 0
      setToast(data.ok ? `${antal} signal${antal === 1 ? '' : 'er'} hittade på sajten` : (data.reason || 'Sajten gick inte att läsa'))
      await loadAccounts()
    } catch (err: any) {
      setToast(err?.message || 'Kunde inte läsa sajten')
    } finally {
      setBusy(false)
    }
  }

  async function readSignalsBatch() {
    setBatchSignalsBusy(true)
    try {
      const response = await fetch('/api/admin/launch/signaler/batch', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kunde inte läsa sajterna')
      setToast(`${data.checked} sajter kollade · ${data.ok} lästa · ${data.error} gick inte att läsa`)
      await loadAccounts()
    } catch (err: any) {
      setToast(err?.message || 'Kunde inte läsa sajterna')
    } finally {
      setBatchSignalsBusy(false)
    }
  }

  async function markReady() {
    if (!selected) return
    setBusy(true)
    try {
      const response = await fetch(`/api/admin/launch/accounts/${selected.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ready' }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kunde inte markera prospektet redo')
      setSelected(data.account)
      setToast('Prospektet ligger nu i arbetskön')
      await loadAccounts()
    } catch (err: any) {
      setToast(err?.message || 'Kunde inte uppdatera prospektet')
    } finally {
      setBusy(false)
    }
  }

  async function saveDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    setBusy(true)
    try {
      const response = await fetch(`/api/admin/launch/accounts/${selected.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legal_form: form.get('legal_form'),
          contact_basis: form.get('contact_basis'),
          suggested_channel: form.get('suggested_channel'),
          primary_contact_name: form.get('primary_contact_name'),
          primary_contact_role: form.get('primary_contact_role'),
          primary_contact_email: form.get('primary_contact_email'),
          primary_contact_phone: form.get('primary_contact_phone'),
          primary_contact_linkedin: form.get('primary_contact_linkedin'),
          factual_notes: form.get('factual_notes'),
          next_action_at: form.get('next_action_at') || null,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kunde inte spara kontaktunderlaget')
      setSelected(data.account)
      setToast('Kontaktunderlaget är sparat')
      await loadAccounts()
    } catch (err: any) {
      setToast(err?.message || 'Kunde inte spara kontaktunderlaget')
    } finally {
      setBusy(false)
    }
  }

  async function logOutcome(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setBusy(true)
    try {
      const response = await fetch('/api/admin/launch/activity', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: selected.id,
          channel: form.get('channel'),
          outcome: form.get('outcome'),
          notes: form.get('notes'),
          next_action_at: form.get('next_action_at') || null,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kunde inte logga utfallet')
      formElement.reset()
      setToast('Utfallet är loggat')
      await refreshSelected()
    } catch (err: any) {
      setToast(err?.message || 'Kunde inte logga utfallet')
    } finally {
      setBusy(false)
    }
  }

  async function suppress(reason: GtmSuppressionReason) {
    if (!selected || !window.confirm('Spärra all framtida kontakt med det här prospektet?')) return
    setBusy(true)
    try {
      const response = await fetch('/api/admin/launch/suppress', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: selected.id, reason }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kunde inte spärra prospektet')
      setSelected(null)
      setToast('Prospektet är spärrat och kan inte återimporteras obemärkt')
      await loadAccounts()
    } catch (err: any) {
      setToast(err?.message || 'Kunde inte spärra prospektet')
    } finally {
      setBusy(false)
    }
  }

  async function importCsv() {
    if (importRows.length === 0) return
    setImporting(true)
    try {
      const response = await fetch('/api/admin/launch/accounts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: importRows }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Importen misslyckades')
      setToast(`${data.count} prospekt importerade · ${data.duplicates?.length || 0} dubbletter · ${data.blocked?.length || 0} spärrade${data.ogiltiga?.length ? ` · ${data.ogiltiga.length} utan giltig källa` : ''}`)
      setImportOpen(false)
      setImportRows([])
      setAvvisadeRader([])
      await loadAccounts()
    } catch (err: any) {
      setToast(err?.message || 'Importen misslyckades')
    } finally {
      setImporting(false)
    }
  }

  const cards = [
    { label: 'Kvalificerade', value: funnel.ready, icon: Target },
    { label: 'Att göra nu', value: funnel.due, icon: CalendarClock },
    { label: 'Kontaktade', value: funnel.contacted, icon: Phone },
    { label: 'Svar', value: funnel.replied, icon: MessageSquare },
    { label: 'Demos', value: funnel.demos, icon: Sparkles },
    { label: 'Vunna', value: funnel.won, icon: Trophy },
  ]

  return (
    <div className="min-h-screen bg-slate-50 text-gray-900">
      {toast && <div className="fixed z-[100] top-4 left-1/2 -translate-x-1/2 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-xl">{toast}</div>}
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-8">
        <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/admin" className="mb-3 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"><ArrowLeft className="h-4 w-4" /> Admin</Link>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-700 text-white"><Target className="h-5 w-5" /></div>
              <div><h1 className="text-2xl font-bold">Launch Desk</h1><p className="text-sm text-gray-500">Personligt säljstöd. Inga automatiska utskick.</p></div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setImportOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-gray-50"><FileUp className="h-4 w-4" /> Importera</button>
            <button disabled={batchSignalsBusy} onClick={readSignalsBatch} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-gray-50 disabled:opacity-50">{batchSignalsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} Läs 25 sajter</button>
            <button onClick={loadAccounts} className="inline-flex items-center gap-2 rounded-xl bg-primary-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-800"><RefreshCw className="h-4 w-4" /> Uppdatera</button>
          </div>
        </header>

        <VeckopulsPanel />

        <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {cards.map(card => <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"><card.icon className="mb-3 h-5 w-5 text-primary-700" /><p className="text-2xl font-bold">{card.value}</p><p className="text-xs text-gray-500">{card.label}</p></div>)}
        </section>

        <section className="mb-5 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Sök företag..." className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary-500" /></div>
          <select value={status} onChange={event => setStatus(event.target.value)} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-primary-500">
            <option value="active">Aktiv arbetskö</option><option value="all">Alla prospekt</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setBaraRekryterande(v => !v)}
            aria-pressed={baraRekryterande}
            title="Firmor som annonserar efter folk växer — och en växande firma har precis fått problemet vi löser."
            className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${baraRekryterande ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
          >
            Rekryterar{baraRekryterande ? ' ✓' : ''}
          </button>
        </section>

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {loading ? <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-primary-700" /></div> : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {visibleAccounts.length === 0 ? <div className="px-6 py-20 text-center"><Building2 className="mx-auto mb-3 h-9 w-9 text-gray-300" /><p className="font-medium">Arbetskön är tom</p><p className="mt-1 text-sm text-gray-500">Importera officiellt företagsunderlag för att börja.</p></div> : visibleAccounts.map(account => (
              <button key={account.id} onClick={() => openAccount(account)} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 border-b border-gray-100 px-4 py-4 text-left last:border-0 hover:bg-gray-50 sm:grid-cols-[minmax(200px,1fr)_90px_110px_100px_120px_110px_auto]">
                <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate font-semibold">{account.company_name}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(account.status)}`}>{STATUS_LABELS[account.status]}</span></div><p className="mt-1 truncate text-xs text-gray-500">{account.industry || 'Bransch ej angiven'} · {account.municipality || 'Ort ej angiven'}</p></div>
                <div className="hidden sm:block"><p className="text-xs text-gray-400">Fit</p><p className="font-semibold">{account.fit_score}/100</p></div>
                <div className="hidden sm:block"><p className="text-xs text-gray-400">Anställda</p><p className="text-sm">{account.employee_band || '—'}</p></div>
                <div className="hidden sm:block"><p className="text-xs text-gray-400">Växer</p>{rekryteringssignal(account) ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700" title={rekryteringssignal(account)!.evidence}>Rekryterar</span> : <p className="text-sm text-gray-300">—</p>}</div>
                <div className="hidden sm:block"><p className="text-xs text-gray-400">Nästa steg</p><p className="text-sm">{dateLabel(account.next_action_at)}</p></div>
                <div className="hidden sm:block"><p className="text-xs text-gray-400">Kanal</p><p className="text-sm">{CHANNEL_LABELS[account.suggested_channel]}</p></div>
                <ChevronRight className="h-5 w-5 text-gray-300" />
              </button>
            ))}
          </div>
        )}
      </main>

      {selected && <AccountDrawer key={`${selected.id}:${selected.updated_at}`} account={selected} activities={activities} loading={detailsLoading} busy={busy} onClose={() => setSelected(null)} onBrief={prepareBrief} onReadSignals={readSignals} onReady={markReady} onSaveDetails={saveDetails} onLog={logOutcome} onSuppress={suppress} />}

      {importOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4"><div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><h2 className="text-lg font-bold">Importera prospekt</h2><p className="mt-1 text-sm text-gray-500">CSV granskas och kvalificeras server-side. Spärrade kontakter hoppas över.</p></div><button onClick={() => setImportOpen(false)}><X className="h-5 w-5 text-gray-400" /></button></div><a href="/templates/handymate-launch-desk-import.csv" download className="mb-4 inline-flex text-sm font-medium text-primary-700 hover:underline">Ladda ned CSV-mall</a><label className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-gray-200 px-5 py-10 text-center hover:border-primary-300"><FileUp className="mb-3 h-7 w-7 text-primary-700" /><span className="font-medium">Välj CSV-fil</span><span className="mt-1 text-xs text-gray-500">Semikolon eller komma, högst 500 rader</span><input type="file" accept=".csv,text/csv" className="hidden" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; const granskad = granskaLaunchCsv(await file.text()); setImportRows(granskad.giltiga); setAvvisadeRader(granskad.avvisade) }} /></label>{importRows.length > 0 && <div className="mt-4 rounded-xl bg-primary-50 p-3 text-sm text-primary-800"><Check className="mr-2 inline h-4 w-4" />{importRows.length} rader redo för serverkontroll</div>}
{avvisadeRader.length > 0 && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><div className="mb-2 font-medium">{avvisadeRader.length} rader tas inte med</div><ul className="max-h-40 space-y-1 overflow-y-auto">{avvisadeRader.slice(0, 25).map(rad => <li key={rad.rad} className="flex gap-2"><span className="shrink-0 tabular-nums text-amber-700">Rad {rad.rad}</span><span className="truncate font-medium">{rad.namn}</span><span className="text-amber-800">— {rad.skal}</span></li>)}</ul>{avvisadeRader.length > 25 && <div className="mt-2 text-xs text-amber-700">…och {avvisadeRader.length - 25} till. Rätta i filen och ladda upp igen.</div>}</div>}<div className="mt-6 flex justify-end gap-2"><button onClick={() => setImportOpen(false)} className="rounded-xl px-4 py-2.5 text-sm text-gray-600">Avbryt</button><button disabled={importRows.length === 0 || importing} onClick={importCsv} className="inline-flex items-center gap-2 rounded-xl bg-primary-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{importing && <Loader2 className="h-4 w-4 animate-spin" />} Importera</button></div></div></div>}
    </div>
  )
}

/**
 * Veckopuls — "ett tal per fredag" (docs/gtm/SALJMASKINEN.md,
 * tasks/plan-veckopuls.md). Läser GET /api/admin/launch/veckopuls, som är
 * fail-soft per fråga — den här panelen behöver alltså aldrig visa ett
 * felmeddelande, bara siffror (eller "Inget loggat än" när tomt läge är
 * det sanna svaret).
 */
function VeckopulsPanel() {
  const [data, setData] = useState<Veckopuls | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/launch/veckopuls')
      .then(response => response.json())
      .then(json => { if (!cancelled) setData(json) })
      .catch(() => { /* fail-soft: panelen visar bara inget, huvudlistan fungerar ändå */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading) return <div className="mb-6 h-28 animate-pulse rounded-2xl border border-gray-100 bg-white" />
  if (!data) return null

  // GTM-talen (raderna VECKAN + signerade totalt/betalande) är sanningsenligt
  // tomma före lansering — gtm_account/gtm_activity har noll rader idag och
  // det finns ännu inga betalande kunder. En bar "0" hade sett ut som ett
  // utfall. Det är det inte.
  const gtmTal = (n: number) => (n === 0 ? 'Inget loggat än' : String(n))

  const diff = data.signeradeTotalt - data.betalandeKonton
  const diffNotis =
    diff > 0
      ? `${diff} markerade som kund men utan betalande konto`
      : diff < 0
        ? `${Math.abs(diff)} betalande konto${Math.abs(diff) === 1 ? '' : 'n'} utan matchande "vunnen" i Launch Desk`
        : undefined

  const veckostartLabel = new Date(data.veckostart).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-gray-900">Veckopulsen</h2>
        <p className="text-xs text-gray-400">Sedan {veckostartLabel}, svensk tid</p>
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Veckan — det vi styr</p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <VeckopulsCell
          label="Kontakter"
          value={String(data.kontakter)}
          warn={data.kontakter === 0}
          warnText="Ingen kontakt loggad den här veckan."
        />
        <VeckopulsCell label="Genomgångar bokade" value={gtmTal(data.genomgangarBokade)} />
        <VeckopulsCell label="Erbjudanden" value={gtmTal(data.erbjudandenSkickade)} />
        <VeckopulsCell label="Signerade denna vecka" value={gtmTal(data.signeradeVeckan)} />
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Läget — det vi bygger</p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <VeckopulsCell label="Signerade totalt" value={gtmTal(data.signeradeTotalt)} note={diffNotis} />
        <VeckopulsCell label="Betalande konton" value={gtmTal(data.betalandeKonton)} />
        <VeckopulsCell label="Aktiva (≥4 ytor/30 d)" value={String(data.aktivaKonton)} />
        <VeckopulsCell
          label="Kontant inne"
          value="Inte kopplad än"
          muted
          note='Kopplas när första riktiga betalningen landat och webhookens form är verifierad.'
        />
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Varningar</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <VeckopulsCell label="Konton äldre än 60 dagar" value={String(data.konton60Dagar)} />
        <VeckopulsCell label="Öppna räddningsärenden" value={String(data.raddningskoOppna)} />
      </div>
    </section>
  )
}

function VeckopulsCell({ label, value, warn, warnText, note, muted }: {
  label: string
  value: string
  warn?: boolean
  warnText?: string
  note?: string
  muted?: boolean
}) {
  return (
    <div className={`rounded-xl p-3 ${warn ? 'bg-red-50' : 'bg-slate-50'}`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 font-bold ${warn ? 'text-xl text-red-700' : muted ? 'text-sm text-gray-500' : 'text-xl text-gray-900'}`}>
        {value}
      </p>
      {warn && warnText && <p className="mt-1 text-xs font-medium text-red-600">{warnText}</p>}
      {note && <p className="mt-1 text-xs text-gray-400">{note}</p>}
    </div>
  )
}

function AccountDrawer({ account, activities, loading, busy, onClose, onBrief, onReadSignals, onReady, onSaveDetails, onLog, onSuppress }: {
  account: GtmAccount
  activities: GtmActivity[]
  loading: boolean
  busy: boolean
  onClose: () => void
  onBrief: () => void
  onReadSignals: () => void
  onReady: () => void
  onSaveDetails: (event: React.FormEvent<HTMLFormElement>) => void
  onLog: (event: React.FormEvent<HTMLFormElement>) => void
  onSuppress: (reason: GtmSuppressionReason) => void
}) {
  const policy = channelPolicy({ legalForm: account.legal_form, contactBasis: account.contact_basis, suppressed: account.status === 'suppressed' })
  const signalSnapshot = signalSnapshotFromAccount(account)
  const availableChannels: GtmActivityChannel[] = [...policy.allowed.filter(channel => channel !== 'none'), 'meeting', 'demo', 'other'] as GtmActivityChannel[]
  const defaultChannel = account.suggested_channel !== 'none' && availableChannels.includes(account.suggested_channel as GtmActivityChannel) ? account.suggested_channel : availableChannels[0] || 'other'
  const tomorrow = dateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000))

  function copy(text: string | null) {
    if (text) navigator.clipboard.writeText(text)
  }

  return <div className="fixed inset-0 z-40 flex justify-end bg-gray-900/30"><aside className="h-full w-full max-w-2xl overflow-y-auto bg-slate-50 shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4"><div className="min-w-0"><p className="truncate font-bold">{account.company_name}</p><p className="text-xs text-gray-500">Fit {account.fit_score}/100 · {STATUS_LABELS[account.status]}</p></div><button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button></div>{loading ? <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-primary-700" /></div> : <div className="space-y-4 p-4 sm:p-6">
    <section className="rounded-2xl border border-gray-200 bg-white p-5"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Källor och kvalificering</h2><span className={`rounded-full px-2 py-1 text-xs ${policy.needsManualReview ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>{policy.needsManualReview ? 'Manuell kanalbedömning' : 'Kanalgrind klar'}</span></div><p className="text-sm text-gray-600">{policy.explanation}</p><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-gray-400">Källa</p>{account.source_url ? <a href={account.source_url} target="_blank" rel="noreferrer" className="text-primary-700 hover:underline">{account.source_name}</a> : <p>{account.source_name}</p>}</div><div><p className="text-xs text-gray-400">Kontrollerad</p><p>{dateLabel(account.source_checked_at)}</p></div><div><p className="text-xs text-gray-400">Bransch</p><p>{account.industry || '—'}</p></div><div><p className="text-xs text-gray-400">Anställda</p><p>{account.employee_band || '—'}</p></div><div><p className="text-xs text-gray-400">Rättslig grund</p><p>{account.lawful_basis === 'inbound_request' ? 'Inkommande förfrågan' : account.lawful_basis === 'warm_relationship' ? 'Befintlig relation' : 'Berättigat intresse – intern bedömning'}</p></div><div><p className="text-xs text-gray-400">Nästa datagranskning</p><p>{dateLabel(account.retention_review_at)}</p></div></div>{account.fit_reasons?.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{account.fit_reasons.map(reason => <span key={reason} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">{reason}</span>)}</div>}</section>

    {account.status !== 'suppressed' && <section className="rounded-2xl border border-gray-200 bg-white p-5"><h2 className="mb-1 font-semibold">Kontakt och nästa steg</h2><p className="mb-4 text-xs text-gray-500">Komplettera förstahandsunderlaget innan kontakt. Servern stoppar otillåtna kanalkombinationer.</p><form onSubmit={onSaveDetails} className="space-y-3"><div className="grid grid-cols-2 gap-3"><label className="text-xs text-gray-500">Bolagsform<select name="legal_form" defaultValue={account.legal_form} className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-gray-900"><option value="limited_company">Aktiebolag</option><option value="sole_trader">Enskild firma</option><option value="trading_partnership">Handels-/kommanditbolag</option><option value="association">Förening</option><option value="other">Annan</option><option value="unknown">Okänd</option></select></label><label className="text-xs text-gray-500">Kontaktgrund<select name="contact_basis" defaultValue={account.contact_basis} className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-gray-900"><option value="unknown">Okänd – ingen kall kontakt</option><option value="warm_intro">Varm introduktion</option><option value="inbound">Inkommande kontakt</option><option value="customer_referral">Kundreferens</option><option value="public_business_contact">Offentlig företagskontakt</option><option value="public_professional_role">Offentlig yrkesroll</option></select></label></div><div className="grid grid-cols-2 gap-3"><label className="text-xs text-gray-500">Kontaktperson<input name="primary_contact_name" defaultValue={account.primary_contact_name || ''} className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-gray-900" /></label><label className="text-xs text-gray-500">Roll<input name="primary_contact_role" defaultValue={account.primary_contact_role || ''} className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-gray-900" /></label></div><div className="grid grid-cols-2 gap-3"><label className="text-xs text-gray-500">E-post<input name="primary_contact_email" type="email" defaultValue={account.primary_contact_email || ''} className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-gray-900" /></label><label className="text-xs text-gray-500">Telefon<input name="primary_contact_phone" defaultValue={account.primary_contact_phone || ''} className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-gray-900" /></label></div><label className="block text-xs text-gray-500">LinkedIn-profil<input name="primary_contact_linkedin" type="url" defaultValue={account.primary_contact_linkedin || ''} className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-gray-900" /></label><div className="grid grid-cols-2 gap-3"><label className="text-xs text-gray-500">Föreslagen kanal<select name="suggested_channel" defaultValue={account.suggested_channel} className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-gray-900"><option value="none">Bedöm manuellt</option><option value="warm_intro">Varm introduktion</option><option value="phone">Telefon</option><option value="linkedin">LinkedIn</option><option value="email">E-post</option><option value="letter">Brev</option><option value="video">Personlig video</option></select></label><label className="text-xs text-gray-500">Nästa steg<input name="next_action_at" type="datetime-local" defaultValue={account.next_action_at ? dateTimeLocal(new Date(account.next_action_at)) : tomorrow} className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-gray-900" /></label></div><label className="block text-xs text-gray-500">Källbunden faktanotering<textarea name="factual_notes" rows={3} defaultValue={account.factual_notes || ''} className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-gray-900" placeholder="Skriv bara sådant som kan kontrolleras mot sparad källa." /></label><button disabled={busy} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">Spara kontaktunderlag</button></form></section>}

    <section className="rounded-2xl border border-gray-200 bg-white p-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Signaler från deras sajt</h2><p className="text-xs text-gray-500">Härlett automatiskt ur kontots EGEN webbplats — ingen AI, aldrig kataloger.</p></div><button disabled={busy || !account.website} onClick={onReadSignals} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} Läs sajten</button></div>
    {!account.website ? <p className="text-sm text-gray-400">Prospektet saknar webbplats.</p>
      : !signalSnapshot ? <p className="text-sm text-gray-400">Inte läst ännu.</p>
      : signalSnapshot.error ? <p className="text-sm text-red-600">Sajten gick inte att läsa: {signalSnapshot.error}</p>
      : signalSnapshot.signals.length === 0 ? <p className="text-sm text-gray-400">Inga signaler hittades ({dateTimeLabel(signalSnapshot.fetched_at)}).</p>
      : <div className="space-y-2">{signalSnapshot.signals.map(signal => (
          <div key={signal.key} className="rounded-xl bg-gray-50 p-3">
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{signal.label}</p><span className="flex gap-0.5" title={`Styrka ${signal.styrka}/3`}>{[1, 2, 3].map(n => <span key={n} className={`h-1.5 w-1.5 rounded-full ${n <= signal.styrka ? 'bg-primary-600' : 'bg-gray-200'}`} />)}</span></div>
            <p className="mt-1 text-sm italic text-gray-600">"{signal.evidence}"</p>
          </div>
        ))}<p className="text-[11px] text-gray-400">Hämtad {dateTimeLabel(signalSnapshot.fetched_at)} från {signalSnapshot.url}</p></div>}
    </section>

    <section className="rounded-2xl border border-gray-200 bg-white p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Personligt kontaktunderlag</h2><p className="text-xs text-gray-500">Källmärkt AI-utkast. Människan granskar och kontaktar.</p></div><button disabled={busy} onClick={onBrief} className="inline-flex items-center gap-2 rounded-xl bg-primary-700 px-3.5 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Förbered</button></div>{account.research_summary ? <div className="space-y-4"><BriefField label="Verifierad sammanfattning" text={account.research_summary} onCopy={copy} /><BriefField label="Relevanshypotes" text={account.relevance_hypothesis} onCopy={copy} /><BriefField label="Öppningsvinkel (signal)" text={account.opening_angle} onCopy={copy} /><BriefField label="Samtalsöppning" text={account.call_opener} onCopy={copy} /><BriefField label="E-postutkast" text={account.email_draft} onCopy={copy} /><BriefField label="LinkedIn-utkast" text={account.linkedin_draft} onCopy={copy} /><BriefField label="Videomanus" text={account.video_script} onCopy={copy} /><p className="text-[11px] text-gray-400">Skapad med {account.brief_generated_by === 'ai' ? 'AI' : 'källsäker mall'} · inga utskick sker från Launch Desk.</p></div> : <div className="rounded-xl bg-gray-50 p-5 text-center text-sm text-gray-500">Förbered underlaget när källorna är kontrollerade.</div>}{['imported', 'qualified'].includes(account.status) && account.research_summary && <button disabled={busy} onClick={onReady} className="mt-4 w-full rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm font-medium text-primary-800">Lägg i arbetskön</button>}</section>

    {account.status !== 'suppressed' && <section className="rounded-2xl border border-gray-200 bg-white p-5"><h2 className="mb-4 font-semibold">Logga verkligt utfall</h2><form onSubmit={onLog} className="space-y-3"><div className="grid grid-cols-2 gap-3"><label className="text-xs text-gray-500">Kanal<select name="channel" defaultValue={defaultChannel} className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-gray-900">{availableChannels.map(item => <option key={item} value={item}>{CHANNEL_LABELS[item]}</option>)}</select></label><label className="text-xs text-gray-500">Utfall<select name="outcome" defaultValue="attempted" className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-gray-900">{Object.entries(OUTCOME_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><label className="block text-xs text-gray-500">Nästa uppföljning<input name="next_action_at" type="datetime-local" defaultValue={tomorrow} className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-gray-900" /></label><label className="block text-xs text-gray-500">Anteckning<textarea name="notes" rows={3} className="mt-1 w-full rounded-lg border border-gray-200 p-2.5 text-sm text-gray-900" placeholder="Vad hände och vad är nästa steg?" /></label><button disabled={busy} className="w-full rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">Logga utfall</button></form></section>}

    <section className="rounded-2xl border border-gray-200 bg-white p-5"><h2 className="mb-3 font-semibold">Historik</h2>{activities.length === 0 ? <p className="text-sm text-gray-400">Inga händelser ännu.</p> : <div className="space-y-3">{activities.map(activity => <div key={activity.id} className="border-l-2 border-primary-200 pl-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{activity.outcome === 'opt_out' ? 'Kontakt avböjd' : OUTCOME_LABELS[activity.outcome as GtmOutcome] || activity.outcome} · {CHANNEL_LABELS[activity.channel]}</p><span className="text-xs text-gray-400">{dateLabel(activity.happened_at)}</span></div>{activity.notes && <p className="mt-1 text-sm text-gray-500">{activity.notes}</p>}</div>)}</div>}</section>

    {account.status !== 'suppressed' && <section className="rounded-2xl border border-red-100 bg-red-50 p-5"><h2 className="font-semibold text-red-900">Kontaktskydd</h2><p className="mt-1 text-sm text-red-700">Spärren följer organisationsnummer och kontaktuppgifter vid framtida importer.</p><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} onClick={() => onSuppress('opt_out')} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white"><Ban className="h-4 w-4" /> Har tackat nej</button><button disabled={busy} onClick={() => onSuppress('legal_unclear')} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700">Juridiskt oklar</button><button disabled={busy} onClick={() => onSuppress('do_not_contact')} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700">Kontakta inte</button></div></section>}
  </div>}</aside></div>
}

function BriefField({ label, text, onCopy }: { label: string; text: string | null; onCopy: (text: string | null) => void }) {
  if (!text) return null
  return <div><div className="mb-1 flex items-center justify-between"><p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p><button onClick={() => onCopy(text)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Kopiera"><ClipboardCopy className="h-4 w-4" /></button></div><p className="whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm leading-relaxed text-gray-700">{text}</p></div>
}
