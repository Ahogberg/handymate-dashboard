'use client'

import { useEffect, useRef, useState } from 'react'
import { TASK_PRESETS, TASK_PRESET_CATEGORIES, type TaskPresetCategory } from '@/lib/task-presets'

interface SmartTaskTitleInputProps {
  value: string
  onChange: (value: string) => void
  /** Triggas vid Enter eller när användaren väljer ur dropdown — föräldern kan submit:a direkt */
  onSubmit?: (title: string) => void
  placeholder?: string
  className?: string
  /** Avgör om dropdownen visas — föräldern kan stänga via blur */
  autoFocus?: boolean
  disabled?: boolean
}

/**
 * Smart input för uppgiftstitel:
 * - Klicka i fältet → visar alla förvalda uppgifter grupperade per fas
 * - Skriv → filtrerar förslag + visar "Skapa: <din text>" om inget matchar exakt
 * - Enter eller klick på förslag → använd det värdet och triggas onSubmit
 *
 * Ersätter den separata "Förvalda uppgifter"-knappen som tidigare öppnade
 * en stor modal — nu är allt i en dropdown direkt på fältet.
 */
export default function SmartTaskTitleInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Vad behöver göras?',
  className = '',
  autoFocus,
  disabled,
}: SmartTaskTitleInputProps) {
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filtrera presets baserat på input
  const trimmed = value.trim().toLowerCase()
  const matched = trimmed
    ? TASK_PRESETS.filter(p => p.title.toLowerCase().includes(trimmed))
    : TASK_PRESETS

  const exactMatch = matched.some(p => p.title.toLowerCase() === trimmed)
  const showCustomOption = trimmed.length > 0 && !exactMatch

  // Bygg upp en flat lista där varje rad har en stabil position så piltangenter funkar
  type Row =
    | { type: 'preset'; title: string; category: TaskPresetCategory }
    | { type: 'custom'; title: string }
  const rows: Row[] = []
  if (showCustomOption) rows.push({ type: 'custom', title: value.trim() })
  for (const p of matched) rows.push({ type: 'preset', title: p.title, category: p.category })

  // Stäng vid klick utanför
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Reset highlight när rader ändras
  useEffect(() => {
    setHighlightIndex(0)
  }, [trimmed])

  function selectRow(row: Row) {
    onChange(row.title)
    setOpen(false)
    if (onSubmit) onSubmit(row.title)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlightIndex(i => Math.min(i + 1, Math.max(rows.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && rows[highlightIndex]) {
        selectRow(rows[highlightIndex])
      } else if (value.trim() && onSubmit) {
        onSubmit(value.trim())
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Beräkna grupperade rader för rendering (custom alltid överst)
  const groupedPresets = TASK_PRESET_CATEGORIES.map(cat => ({
    cat,
    items: matched.filter(p => p.category === cat.key),
  })).filter(g => g.items.length > 0)

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        className="w-full px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:border-primary-700 focus:outline-none bg-white"
      />
      {open && rows.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-[#E2E8F0] rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {showCustomOption && (() => {
            const isHighlighted = rows[highlightIndex]?.type === 'custom'
            return (
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); selectRow({ type: 'custom', title: value.trim() }) }}
                onMouseEnter={() => setHighlightIndex(0)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                  isHighlighted ? 'bg-primary-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className="text-xs px-1.5 py-0.5 rounded bg-primary-100 text-primary-700 font-medium">Ny</span>
                <span className="text-gray-900 truncate">{value.trim()}</span>
              </button>
            )
          })()}
          {groupedPresets.map(group => (
            <div key={group.cat.key}>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-50 border-t border-b border-gray-100">
                {group.cat.label}
              </div>
              {group.items.map(p => {
                const flatIndex = rows.findIndex(r => r.type === 'preset' && r.title === p.title)
                const isHighlighted = flatIndex === highlightIndex
                return (
                  <button
                    key={p.key}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); selectRow({ type: 'preset', title: p.title, category: p.category }) }}
                    onMouseEnter={() => setHighlightIndex(flatIndex)}
                    className={`w-full text-left px-3 py-2 text-sm text-gray-700 ${
                      isHighlighted ? 'bg-primary-50 text-primary-900' : 'hover:bg-gray-50'
                    }`}
                  >
                    {p.title}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
