'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, AlertTriangle, Plus, Check, Trash2, MapPin, Package } from 'lucide-react'
import type { InstallationRow, SiteSnapshot, InstallationRelevance } from '@/lib/installation/installation'
import { formatSite } from '@/lib/installation/installation'

/**
 * Installationsregistret för ett projekt — Fastighetspasset steg 2.
 *
 * Här bekräftar hantverkaren vad som faktiskt sitter hos kunden. Utkast ur
 * materialet är bara förslag (grind 1). Inget här blockerar projektavslut —
 * "Ej tillämpligt" och "Komplettera serienumret senare" är alltid giltiga
 * svar (grind 2). Serviceintervall sparas bara med sin källa (grind 4).
 * Bara bekräftade rader visas för kunden i jobbpasset.
 */

type Draft = Partial<Record<keyof InstallationRow, string | number | boolean | null>>

const STATUS_LABEL: Record<InstallationRow['status'], { text: string; cls: string }> = {
  draft: { text: 'Utkast', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed: { text: 'Bekräftad — visas för kunden', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  not_applicable: { text: 'Ej tillämpligt', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
}

export default function InstallationerPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<InstallationRow[]>([])
  const [site, setSite] = useState<SiteSnapshot | null>(null)
  const [projectName, setProjectName] = useState('')
  const [relevance, setRelevance] = useState<InstallationRelevance | null>(null)
  const [notice, setNotice] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/installations`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Kunde inte läsa installationerna'); return }
      setRows(data.installations || [])
      setSite(data.site || null)
      setProjectName(data.project_name || '')
      setRelevance(data.relevance || null)
    } catch {
      setError('Kunde inte läsa installationerna')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  async function addManual() {
    setAdding(true)
    setNotice('')
    try {
      const res = await fetch(`/api/projects/${projectId}/installations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Ny installation' }),
      })
      const data = await res.json()
      if (!res.ok) { setNotice(data.error || 'Kunde inte lägga till'); return }
      await load()
    } catch {
      setNotice('Något gick fel.')
    } finally {
      setAdding(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    )
  }

  const confirmed = rows.filter(r => r.status === 'confirmed').length
  const open = rows.filter(r => r.status === 'draft').length

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      <button
        onClick={() => router.push(`/dashboard/projects/${projectId}`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Tillbaka till projektet
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-1">Installationer{projectName ? ` — ${projectName}` : ''}</h1>
      <p className="text-sm text-gray-500 mb-2">
        Det som sitter kvar hos kunden efter jobbet. Bekräfta det som faktiskt installerades — bara bekräftade rader visas för kunden i jobbpasset.
      </p>
      <p className="text-xs text-gray-400 mb-6">
        Inget här stoppar avslutet. Saknar du serienumret: kryssa &quot;komplettera senare&quot;. Är raden förbrukningsmaterial: &quot;Ej tillämpligt&quot;.
      </p>

      {site && (
        <div className="mb-6 p-4 bg-white border border-gray-200 rounded-2xl flex items-start gap-3">
          <MapPin className="w-4 h-4 text-primary-700 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-gray-900">Plats</p>
            <p className="text-gray-600">{formatSite(site) || 'Ingen adress på kunden — fyll i per rad.'}</p>
            {site.site_property_designation && <p className="text-xs text-gray-400">Fastighetsbeteckning: {site.site_property_designation}</p>}
            <p className="text-xs text-gray-400 mt-1">Sparas som ögonblicksbild på varje installation — kunden kan ha flera fastigheter.</p>
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <div className="mb-6 p-5 bg-slate-50 border border-gray-200 rounded-2xl text-sm text-gray-600">
          {relevance?.relevant
            ? 'Inga installationer registrerade än. Lägg till det som sattes in hos kunden.'
            : 'Inget i projektet pekar på en installation. Lägg bara till om något faktiskt sitter kvar hos kunden.'}
        </div>
      )}

      <div className="space-y-4">
        {rows.map(row => (
          <InstallationCard
            key={row.installation_id}
            row={row}
            projectId={projectId}
            onChanged={load}
            onNotice={setNotice}
          />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={addManual}
          disabled={adding}
          className="inline-flex items-center gap-2 px-4 py-2 min-h-[44px] text-sm font-medium bg-primary-700 text-white rounded-xl hover:bg-primary-800 disabled:opacity-60"
        >
          <Plus className="w-4 h-4" />
          {adding ? 'Lägger till...' : 'Lägg till installation'}
        </button>
        <span className="text-xs text-gray-500">
          {confirmed} bekräftad{confirmed === 1 ? '' : 'e'} · {open} utkast
        </span>
        <Link href={`/dashboard/projects/${projectId}/jobbpass`} className="text-sm text-primary-700 hover:underline ml-auto">
          Till jobbpasset →
        </Link>
      </div>

      {notice && (
        <div className="mt-4 p-3 bg-slate-50 border border-gray-200 rounded-xl text-sm text-gray-700">{notice}</div>
      )}
    </div>
  )
}

function InstallationCard({ row, projectId, onChanged, onNotice }: {
  row: InstallationRow
  projectId: string
  onChanged: () => Promise<void>
  onNotice: (s: string) => void
}) {
  const [draft, setDraft] = useState<Draft>({})
  const [saving, setSaving] = useState(false)
  const value = <K extends keyof InstallationRow>(k: K): InstallationRow[K] | string | number | boolean | null =>
    k in draft ? (draft[k] as InstallationRow[K] | string | number | boolean | null) : row[k]
  const set = (k: keyof InstallationRow, v: string | number | boolean | null) => setDraft(d => ({ ...d, [k]: v }))
  const dirty = Object.keys(draft).length > 0

  async function patch(extra: Record<string, unknown> = {}) {
    setSaving(true)
    onNotice('')
    try {
      const res = await fetch(`/api/projects/${projectId}/installations`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installation_id: row.installation_id, ...draft, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) { onNotice(data.error || 'Kunde inte spara'); return }
      setDraft({})
      await onChanged()
    } catch {
      onNotice('Något gick fel vid sparandet.')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm('Ta bort installationen? Det går inte att ångra.')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/installations?installation_id=${encodeURIComponent(row.installation_id)}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); onNotice(d.error || 'Kunde inte ta bort'); return }
      await onChanged()
    } finally {
      setSaving(false)
    }
  }

  const status = STATUS_LABEL[row.status]
  const input = 'w-full px-3 py-2 min-h-[40px] text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500'
  const label = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <section className={`bg-white shadow-sm rounded-2xl border p-5 ${row.status === 'confirmed' ? 'border-emerald-200' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <Package className="w-4 h-4 text-primary-700 shrink-0" />
          <h2 className="text-base font-semibold text-gray-900 truncate">{row.name}</h2>
        </div>
        <span className={`shrink-0 px-2.5 py-1 text-xs font-medium rounded-full border ${status.cls}`}>{status.text}</span>
      </div>
      {row.source === 'project_material' && row.status === 'draft' && (
        <p className="text-xs text-amber-700 mb-4">Utkast ur materialet — inköpt betyder inte installerat. Bekräfta bara om den sitter hos kunden.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className={label}>Vad</label>
          <input className={input} value={String(value('name') ?? '')} onChange={e => set('name', e.target.value)} placeholder="T.ex. Värmepump" />
        </div>
        <div>
          <label className={label}>Tillverkare</label>
          <input className={input} value={String(value('manufacturer') ?? '')} onChange={e => set('manufacturer', e.target.value)} />
        </div>
        <div>
          <label className={label}>Modell</label>
          <input className={input} value={String(value('model') ?? '')} onChange={e => set('model', e.target.value)} />
        </div>
        <div>
          <label className={label}>Serienummer</label>
          <input className={input} value={String(value('serial_number') ?? '')} onChange={e => set('serial_number', e.target.value)} />
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={Boolean(value('serial_pending'))} onChange={e => set('serial_pending', e.target.checked)} />
            Komplettera serienumret senare
          </label>
        </div>
        <div>
          <label className={label}>Placering</label>
          <input className={input} value={String(value('placement') ?? '')} onChange={e => set('placement', e.target.value)} placeholder="T.ex. Pannrummet i källaren" />
        </div>
        <div>
          <label className={label}>Installerad (datum)</label>
          <input type="date" className={input} value={String(value('installed_at') ?? '')} onChange={e => set('installed_at', e.target.value || null)} />
        </div>
        <div>
          <label className={label}>Adress (plats)</label>
          <input className={input} value={String(value('site_address_line') ?? '')} onChange={e => set('site_address_line', e.target.value)} />
        </div>
        <div>
          <label className={label}>Serviceintervall (månader)</label>
          <input type="number" min={1} max={240} className={input} value={value('service_interval_months') == null ? '' : String(value('service_interval_months'))} onChange={e => set('service_interval_months', e.target.value === '' ? null : Number(e.target.value))} />
        </div>
        <div>
          <label className={label}>Intervallet kommer från</label>
          <select className={input} value={String(value('service_interval_source') ?? '')} onChange={e => set('service_interval_source', e.target.value || null)}>
            <option value="">— inget intervall —</option>
            <option value="product_info">Produktinformationen</option>
            <option value="craftsman">Mitt eget val</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Skötselråd till kunden</label>
          <textarea className={input} rows={2} value={String(value('care_instructions') ?? '')} onChange={e => set('care_instructions', e.target.value)} placeholder="T.ex. Rengör filtret var tredje månad." />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {row.status !== 'confirmed' && (
          <button
            onClick={() => patch({ status: 'confirmed' })}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[40px] text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60"
          >
            <Check className="w-4 h-4" />
            Bekräfta — sitter hos kunden
          </button>
        )}
        <button
          onClick={() => patch()}
          disabled={saving || !dirty}
          className="px-3 py-1.5 min-h-[40px] text-sm font-medium bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Spara
        </button>
        {row.status !== 'not_applicable' && (
          <button
            onClick={() => patch({ status: 'not_applicable' })}
            disabled={saving}
            className="px-3 py-1.5 min-h-[40px] text-sm text-gray-600 hover:text-gray-900"
          >
            Ej tillämpligt
          </button>
        )}
        {row.status === 'confirmed' && (
          <button
            onClick={() => patch({ status: 'draft' })}
            disabled={saving}
            className="px-3 py-1.5 min-h-[40px] text-sm text-gray-600 hover:text-gray-900"
          >
            Ångra bekräftelse
          </button>
        )}
        <button onClick={remove} disabled={saving} className="ml-auto inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-600" aria-label="Ta bort">
          <Trash2 className="w-3.5 h-3.5" />
          Ta bort
        </button>
      </div>
    </section>
  )
}
