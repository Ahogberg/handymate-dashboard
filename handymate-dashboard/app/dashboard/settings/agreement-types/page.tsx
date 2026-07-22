'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useBusiness } from '@/lib/BusinessContext'
import { useToast } from '@/components/Toast'
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  ArrowLeft,
  RefreshCw,
  X,
  Check,
} from 'lucide-react'

interface AgreementPriceItem {
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  rot_rut_type?: string | null
}

interface AgreementType {
  type_id: string
  name: string
  description: string | null
  interval_months: number
  visit_duration_min: number
  price_items: AgreementPriceItem[]
  match_keys: string[] | null
  is_active: boolean
  seeded: boolean
}

interface RowDraft {
  description: string
  quantity: string
  unit: string
  unit_price: string
  rot: boolean
}

interface Draft {
  name: string
  description: string
  interval_months: string
  visit_duration_min: string
  match_keys: string
  rows: RowDraft[]
}

function emptyDraft(): Draft {
  return {
    name: '',
    description: '',
    interval_months: '12',
    visit_duration_min: '60',
    match_keys: '',
    rows: [{ description: '', quantity: '1', unit: 'tim', unit_price: '', rot: false }],
  }
}

function draftFromType(t: AgreementType): Draft {
  return {
    name: t.name,
    description: t.description || '',
    interval_months: String(t.interval_months),
    visit_duration_min: String(t.visit_duration_min),
    match_keys: (t.match_keys || []).join(', '),
    rows: (t.price_items || []).map(item => ({
      description: item.description,
      quantity: String(item.quantity),
      unit: item.unit,
      unit_price: String(item.unit_price),
      rot: item.rot_rut_type === 'rot',
    })),
  }
}

function draftTotal(draft: Draft): number {
  return draft.rows.reduce((sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0)
}

function draftToPriceItems(draft: Draft): AgreementPriceItem[] {
  return draft.rows
    .filter(r => r.description.trim())
    .map(r => {
      const quantity = Number(r.quantity) || 0
      const unit_price = Number(r.unit_price) || 0
      return {
        description: r.description,
        quantity,
        unit: r.unit || 'st',
        unit_price,
        total: quantity * unit_price,
        rot_rut_type: r.rot ? 'rot' : null,
      }
    })
}

export default function AgreementTypesPage() {
  const business = useBusiness()
  const toast = useToast()

  const [types, setTypes] = useState<AgreementType[]>([])
  const [loading, setLoading] = useState(true)
  const [migrationPending, setMigrationPending] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (business) fetchTypes()
  }, [business])

  async function fetchTypes() {
    setLoading(true)
    try {
      const res = await fetch('/api/agreement-types')
      const data = await res.json()
      setTypes(data.agreement_types || [])
      setMigrationPending(!!data.migration_pending)
    } catch (err) {
      console.error('Failed to fetch agreement types:', err)
    } finally {
      setLoading(false)
    }
  }

  function startCreate() {
    setDraft(emptyDraft())
    setEditingId(null)
    setCreating(true)
  }

  function startEdit(t: AgreementType) {
    setDraft(draftFromType(t))
    setEditingId(t.type_id)
    setCreating(false)
  }

  function cancelEdit() {
    setEditingId(null)
    setCreating(false)
  }

  function updateRow(idx: number, field: keyof RowDraft, value: string | boolean) {
    setDraft(prev => ({
      ...prev,
      rows: prev.rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)),
    }))
  }

  function addRow() {
    setDraft(prev => ({
      ...prev,
      rows: [...prev.rows, { description: '', quantity: '1', unit: 'tim', unit_price: '', rot: false }],
    }))
  }

  function removeRow(idx: number) {
    setDraft(prev => ({ ...prev, rows: prev.rows.filter((_, i) => i !== idx) }))
  }

  async function saveDraft() {
    const priceItems = draftToPriceItems(draft)
    if (!draft.name.trim() || !draft.interval_months || priceItems.length === 0) {
      toast.error('Namn, intervall och minst en prisrad krävs')
      return
    }

    setSaving(true)
    try {
      const matchKeys = draft.match_keys
        .split(',')
        .map(k => k.trim())
        .filter(Boolean)

      const payload = {
        name: draft.name,
        description: draft.description || null,
        interval_months: Number(draft.interval_months),
        visit_duration_min: Number(draft.visit_duration_min) || 60,
        price_items: priceItems,
        match_keys: matchKeys,
      }

      const res = creating
        ? await fetch('/api/agreement-types', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/agreement-types', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type_id: editingId, ...payload }),
          })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Kunde inte spara')
      }

      cancelEdit()
      await fetchTypes()
      toast.success('Avtalstypen sparad')
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte spara avtalstypen')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(t: AgreementType) {
    setTypes(prev => prev.map(x => (x.type_id === t.type_id ? { ...x, is_active: !x.is_active } : x)))
    try {
      const res = await fetch('/api/agreement-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type_id: t.type_id, is_active: !t.is_active }),
      })
      if (!res.ok) throw new Error('failed')
    } catch {
      setTypes(prev => prev.map(x => (x.type_id === t.type_id ? { ...x, is_active: t.is_active } : x)))
      toast.error('Kunde inte ändra status')
    }
  }

  async function deleteType(t: AgreementType) {
    if (!confirm(`Ta bort "${t.name}"?`)) return
    try {
      const res = await fetch(`/api/agreement-types?type_id=${t.type_id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('failed')
      setTypes(prev => prev.filter(x => x.type_id !== t.type_id))
      toast.success('Avtalstypen borttagen')
    } catch {
      toast.error('Kunde inte ta bort avtalstypen')
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/settings"
            className="w-8 h-8 rounded-lg border border-[#E2E8F0] flex items-center justify-center text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Serviceavtal — katalog</h1>
            <p className="text-sm text-gray-500">Avtalstyper som kan erbjudas kunder (intervall, besökslängd, pris)</p>
          </div>
        </div>
        <button
          onClick={startCreate}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors bg-primary-700 text-white hover:opacity-90 min-h-[44px]"
        >
          <Plus className="w-4 h-4" /> Ny avtalstyp
        </button>
      </div>

      {migrationPending && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          Serviceavtal-katalogen är inte redo än — migrationen väntar på att köras.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-primary-700" />
        </div>
      ) : (
        <div className="space-y-3">
          {creating && (
            <AgreementTypeCard
              draft={draft}
              setDraft={setDraft}
              onUpdateRow={updateRow}
              onAddRow={addRow}
              onRemoveRow={removeRow}
              onSave={saveDraft}
              onCancel={cancelEdit}
              saving={saving}
              isNew
            />
          )}

          {types.length === 0 && !creating && (
            <div className="bg-white border border-[#E2E8F0] rounded-xl px-7 py-10 text-center">
              <RefreshCw className="w-7 h-7 text-primary-700 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                Inga avtalstyper ännu. De skapas automatiskt utifrån din bransch första gången
                du öppnar denna sida, eller lägg till en egen ovan.
              </p>
            </div>
          )}

          {types.map(t =>
            editingId === t.type_id ? (
              <AgreementTypeCard
                key={t.type_id}
                draft={draft}
                setDraft={setDraft}
                onUpdateRow={updateRow}
                onAddRow={addRow}
                onRemoveRow={removeRow}
                onSave={saveDraft}
                onCancel={cancelEdit}
                saving={saving}
              />
            ) : (
              <div
                key={t.type_id}
                className={`bg-white border border-[#E2E8F0] rounded-xl p-4 sm:p-5 ${!t.is_active ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-900">{t.name}</h3>
                      {t.seeded && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Standard</span>
                      )}
                    </div>
                    {t.description && <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>}
                    <p className="text-xs text-gray-500 mt-1">
                      Var {t.interval_months}:e månad · {t.visit_duration_min} min · {(t.price_items || [])
                        .reduce((s, i) => s + (i.total || 0), 0)
                        .toLocaleString('sv-SE')}{' '}
                      kr (exkl. moms)
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleActive(t)}
                      title={t.is_active ? 'Inaktivera' : 'Aktivera'}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                        t.is_active ? 'text-primary-700 hover:bg-primary-50' : 'text-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(t)}
                      title="Redigera"
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteType(t)}
                      title="Ta bort"
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

function AgreementTypeCard({
  draft,
  setDraft,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
  onSave,
  onCancel,
  saving,
  isNew,
}: {
  draft: Draft
  setDraft: (updater: (prev: Draft) => Draft) => void
  onUpdateRow: (idx: number, field: keyof RowDraft, value: string | boolean) => void
  onAddRow: () => void
  onRemoveRow: (idx: number) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  isNew?: boolean
}) {
  return (
    <div className="bg-white border-2 border-primary-200 rounded-xl p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">{isNew ? 'Ny avtalstyp' : 'Redigera avtalstyp'}</h3>

      <div className="space-y-3">
        <div>
          <label className="text-sm text-gray-500 mb-1 block">Namn *</label>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft(prev => ({ ...prev, name: e.target.value }))}
            placeholder="T.ex. Värmepumpsservice"
            className="w-full px-3 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-[#0F766E] min-h-[44px]"
          />
        </div>

        <div>
          <label className="text-sm text-gray-500 mb-1 block">Beskrivning (visas för kund)</label>
          <input
            type="text"
            value={draft.description}
            onChange={(e) => setDraft(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Kort, kundvänlig beskrivning"
            className="w-full px-3 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-[#0F766E] min-h-[44px]"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-gray-500 mb-1 block">Intervall (månader) *</label>
            <input
              type="number"
              min={1}
              value={draft.interval_months}
              onChange={(e) => setDraft(prev => ({ ...prev, interval_months: e.target.value }))}
              className="w-full px-3 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E] min-h-[44px]"
            />
          </div>
          <div>
            <label className="text-sm text-gray-500 mb-1 block">Besökslängd (min)</label>
            <input
              type="number"
              min={15}
              step={15}
              value={draft.visit_duration_min}
              onChange={(e) => setDraft(prev => ({ ...prev, visit_duration_min: e.target.value }))}
              className="w-full px-3 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E] min-h-[44px]"
            />
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-500 mb-1 block">Prisrader (exkl. moms) *</label>
          <div className="space-y-2">
            {draft.rows.map((row, idx) => (
              <div key={idx} className="flex flex-wrap gap-2 items-center">
                <input
                  type="text"
                  value={row.description}
                  onChange={(e) => onUpdateRow(idx, 'description', e.target.value)}
                  placeholder="Beskrivning"
                  className="flex-1 min-w-[120px] px-3 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-[#0F766E] min-h-[44px]"
                />
                <input
                  type="number"
                  value={row.quantity}
                  onChange={(e) => onUpdateRow(idx, 'quantity', e.target.value)}
                  className="w-16 px-2 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E] min-h-[44px]"
                />
                <input
                  type="text"
                  value={row.unit}
                  onChange={(e) => onUpdateRow(idx, 'unit', e.target.value)}
                  className="w-16 px-2 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E] min-h-[44px]"
                />
                <input
                  type="number"
                  value={row.unit_price}
                  onChange={(e) => onUpdateRow(idx, 'unit_price', e.target.value)}
                  placeholder="kr"
                  className="w-20 px-2 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-[#0F766E] min-h-[44px]"
                />
                <label className="flex items-center gap-1.5 text-xs text-gray-500 min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={row.rot}
                    onChange={(e) => onUpdateRow(idx, 'rot', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-primary-700 focus:ring-primary-600"
                  />
                  ROT
                </label>
                {draft.rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveRow(idx)}
                    className="text-gray-400 hover:text-red-600 min-h-[44px] min-w-[32px] flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2">
            <button
              type="button"
              onClick={onAddRow}
              className="text-xs font-medium text-primary-700 hover:text-primary-800 flex items-center gap-1 min-h-[44px]"
            >
              <Plus className="w-3.5 h-3.5" /> Lägg till rad
            </button>
            <span className="text-sm font-medium text-gray-900">
              {draftTotal(draft).toLocaleString('sv-SE')} kr (exkl. moms)
            </span>
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-500 mb-1 block">Matchningsnyckelord (kommaseparerat, för framtida AI-matchning)</label>
          <input
            type="text"
            value={draft.match_keys}
            onChange={(e) => setDraft(prev => ({ ...prev, match_keys: e.target.value }))}
            placeholder="T.ex. värmepump, bergvärme, luftvärme"
            className="w-full px-3 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-[#0F766E] min-h-[44px]"
          />
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-100 min-h-[44px]"
        >
          Avbryt
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 px-4 py-3 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50 min-h-[44px]"
        >
          {saving ? 'Sparar...' : 'Spara'}
        </button>
      </div>
    </div>
  )
}
