'use client'

import { useState } from 'react'
import { Plus, Loader2, X } from 'lucide-react'
import { TASK_PRESETS, TASK_PRESET_CATEGORIES, type TaskPreset } from '@/lib/task-presets'

interface TaskPresetPickerProps {
  /** Visas som modal när true */
  open: boolean
  /** Stäng modalen */
  onClose: () => void
  /** Anropas med valda preset-titlar + ev. egna nya. Forwardas till parent som kör POST /api/tasks. */
  onCreate: (titles: string[]) => Promise<void> | void
  /** Visa kontext-info i headern (t.ex. "Lägg till i Projekt: Solrosen") */
  contextLabel?: string
}

export default function TaskPresetPicker({ open, onClose, onCreate, contextLabel }: TaskPresetPickerProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [customTitles, setCustomTitles] = useState<string[]>([])
  const [customInput, setCustomInput] = useState('')
  const [saving, setSaving] = useState(false)

  if (!open) return null

  const totalSelected = selected.size + customTitles.length

  function toggle(preset: TaskPreset) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(preset.key)) next.delete(preset.key)
      else next.add(preset.key)
      return next
    })
  }

  function addCustom() {
    const t = customInput.trim()
    if (!t) return
    setCustomTitles(prev => [...prev, t])
    setCustomInput('')
  }

  function removeCustom(idx: number) {
    setCustomTitles(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (totalSelected === 0) return
    setSaving(true)
    try {
      const presetTitles = TASK_PRESETS
        .filter(p => selected.has(p.key))
        .map(p => p.title)
      const allTitles = [...presetTitles, ...customTitles]
      await onCreate(allTitles)
      // Reset state och stäng
      setSelected(new Set())
      setCustomTitles([])
      setCustomInput('')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Lägg till uppgifter</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {contextLabel ? `Skapas på: ${contextLabel}` : 'Kryssa i de uppgifter du vill skapa'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {TASK_PRESET_CATEGORIES.map(cat => {
            const presets = TASK_PRESETS.filter(p => p.category === cat.key)
            return (
              <div key={cat.key}>
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  {cat.label}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {presets.map(p => {
                    const isSelected = selected.has(p.key)
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => toggle(p)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                          isSelected
                            ? 'bg-primary-50 border-2 border-primary-300 text-primary-900'
                            : 'bg-gray-50 border-2 border-transparent hover:border-gray-200 text-gray-700'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'bg-primary-700 border-primary-700' : 'border-gray-300'
                          }`}
                        >
                          {isSelected && (
                            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M2 6l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        <span className="flex-1">{p.title}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Egna uppgifter */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Egna uppgifter
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
                placeholder="Lägg till egen uppgift..."
                className="flex-1 px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:border-primary-700 focus:outline-none"
              />
              <button
                type="button"
                onClick={addCustom}
                disabled={!customInput.trim()}
                className="flex items-center gap-1 px-3 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {customTitles.length > 0 && (
              <ul className="mt-2 space-y-1">
                {customTitles.map((t, idx) => (
                  <li key={idx} className="flex items-center justify-between px-3 py-1.5 bg-primary-50 border-2 border-primary-300 rounded-lg text-sm text-primary-900">
                    <span>{t}</span>
                    <button onClick={() => removeCustom(idx)} className="text-primary-700 hover:text-primary-900">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-gray-100">
          <span className="text-sm text-gray-500">
            {totalSelected === 0 ? 'Inga uppgifter valda' : `${totalSelected} ${totalSelected === 1 ? 'uppgift' : 'uppgifter'} vald${totalSelected === 1 ? '' : 'a'}`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Avbryt
            </button>
            <button
              onClick={handleSave}
              disabled={totalSelected === 0 || saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Lägg till {totalSelected > 0 && `(${totalSelected})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
