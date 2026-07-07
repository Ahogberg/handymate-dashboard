'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { ProductWithComponents } from './applyProductToItem'

interface QuoteRowProductComboProps {
  /** Radens beskrivning — kontrollerad av föräldern */
  value: string
  /** Fritext-skrivning — anropas för VARJE tangenttryck, aldrig blockerad */
  onChangeText: (text: string) => void
  /** Produktval från dropdown — produkten kommer med komponenter (include=components) */
  onSelectProduct: (product: ProductWithComponents) => void
  placeholder?: string
  /** Klass för själva input-fältet — ärver radens utseende */
  inputClassName?: string
}

const MAX_RESULTS = 8

/**
 * Inline-autocomplete i offertradens beskrivningsfält (produktbank, Del A).
 * Skriv artikelnr ELLER namn → ≥2 tecken → debounced (250 ms) sök mot
 * /api/products (name+sku) → dropdown `{sku} · {namn} · {pris} kr/{enhet}`.
 *
 * Fritext förblir förstahandsvägen: varje tangenttryck skriver direkt till
 * raden; dropdownen är ett erbjudande, aldrig ett krav. Inga träffar →
 * ingen dropdown, inget brus.
 */
export function QuoteRowProductCombo({
  value,
  onChangeText,
  onSelectProduct,
  placeholder,
  inputClassName,
}: QuoteRowProductComboProps) {
  // query = vad användaren själv skrivit — söket triggas ALDRIG av externa
  // value-ändringar (edit-load, produktval) utan bara av tangenttryck.
  const [query, setQuery] = useState<string | null>(null)
  const [results, setResults] = useState<ProductWithComponents[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce-sök på användarens inmatning
  useEffect(() => {
    if (query === null) return
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setOpen(false)
      setLoading(false)
      return
    }
    const timer = setTimeout(() => {
      setLoading(true)
      fetch(`/api/products?search=${encodeURIComponent(q)}&include=components`)
        .then(r => (r.ok ? r.json() : { products: [] }))
        .then(data => {
          const hits: ProductWithComponents[] = (data.products || []).slice(0, MAX_RESULTS)
          setResults(hits)
          setOpen(hits.length > 0)
          setActiveIdx(-1)
        })
        .catch(() => {
          setResults([])
          setOpen(false)
        })
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    return () => {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    }
  }, [])

  function close() {
    setOpen(false)
    setResults([])
    setActiveIdx(-1)
    setQuery(null)
  }

  function handleSelect(p: ProductWithComponents) {
    onSelectProduct(p)
    close()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (e.key === 'Escape') close()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && results[activeIdx]) {
        e.preventDefault()
        handleSelect(results[activeIdx])
      } else {
        // Enter utan markerad rad = fritext — stäng bara dropdownen
        setOpen(false)
      }
    } else if (e.key === 'Escape') {
      close()
    }
  }

  return (
    <div className="relative flex-1 w-full min-w-0">
      <input
        type="text"
        value={value}
        onChange={e => {
          onChangeText(e.target.value)
          setQuery(e.target.value)
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Liten fördröjning så klick i dropdownen hinner registreras
          blurTimerRef.current = setTimeout(() => setOpen(false), 150)
        }}
        placeholder={placeholder}
        className={inputClassName}
      />
      {loading && (
        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 animate-spin pointer-events-none" />
      )}

      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 bg-white border border-slate-200 rounded-xl shadow-lg max-h-72 overflow-y-auto py-1">
          {results.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleSelect(p)}
                onMouseEnter={() => setActiveIdx(i)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                  activeIdx === i ? 'bg-primary-50' : 'hover:bg-slate-50'
                }`}
              >
                <span className="min-w-0 flex-1 flex items-center gap-1.5 text-sm text-slate-900">
                  {p.sku && (
                    <>
                      <span className="shrink-0 font-mono text-[11px] text-slate-400">{p.sku}</span>
                      <span className="shrink-0 text-slate-300">·</span>
                    </>
                  )}
                  <span className="truncate">{p.name}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                  {p.sales_price?.toLocaleString('sv-SE')} kr/{p.unit}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
