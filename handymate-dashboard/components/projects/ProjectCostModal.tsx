'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'

/**
 * ProjectCostModal — manuell kostnad-input (Etapp 2.3.3b).
 *
 * Återinför funktionalitet som togs bort i 2.2-omskrivningen (TD-60).
 * Sparar till project_cost (sql/easoft_parity.sql:48). Beloppen
 * inkluderas i computeProjectEconomics.kostnader.extra_kr och
 * påverkar marginal.
 */

interface ProjectCostModalProps {
  projectId: string
  onClose: () => void
  onSaved: () => void
  onError?: (msg: string) => void
}

type Category = 'subcontractor' | 'other'

export function ProjectCostModal({
  projectId,
  onClose,
  onSaved,
  onError,
}: ProjectCostModalProps) {
  const [category, setCategory] = useState<Category>('subcontractor')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    const numAmount = Number(amount)
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setError('Ange ett positivt belopp')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/costs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          description: description.trim() || null,
          amount: numAmount,
          date,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Kunde inte spara kostnad')
      }
      onSaved()
    } catch (err: any) {
      const msg = err.message || 'Kunde inte spara kostnad'
      setError(msg)
      onError?.(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Lägg till manuell kostnad</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Kategori
            </label>
            <div className="flex gap-2">
              <CategoryButton
                active={category === 'subcontractor'}
                onClick={() => setCategory('subcontractor')}
                label="Underentreprenör"
              />
              <CategoryButton
                active={category === 'other'}
                onClick={() => setCategory('other')}
                label="Övrigt"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Beskrivning
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={category === 'subcontractor' ? 'T.ex. Elektriker Andersson' : 'T.ex. Container, parkering'}
              className={INPUT_CLS}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Belopp (kr)
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Datum
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className={INPUT_CLS}
              />
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !amount}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-700 hover:bg-primary-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Spara kostnad
          </button>
        </div>
      </div>
    </div>
  )
}

function CategoryButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-2 text-sm font-semibold rounded-lg border transition-colors ${
        active
          ? 'border-primary-700 bg-primary-50 text-primary-700'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
      }`}
    >
      {label}
    </button>
  )
}

const INPUT_CLS =
  'w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors'
