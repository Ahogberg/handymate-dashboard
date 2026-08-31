'use client'

/**
 * Snabbprissättning av EN prislös artikel (Prisslingan V2, UX2a/2c).
 *
 * Delas av "Prissätt snabbt"-läget i Inställningar → Produkter och
 * onboardingens "10 vanliga att prissätta nu". Enter sparar (PUT
 * /api/products, samma väg som saveStandardPrice) och flyttar fokus vidare
 * via onSaved — hantverkaren kan beta av listan utan att släppa tangentbordet.
 * Tomt/0 sparar inget (0 = "osatt" är en signal, inte ett pris).
 */
import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'

export function QuickPriceInput({
  productId,
  unit,
  onSaved,
  autoFocus,
}: {
  productId: string
  unit: string
  /** Anropas efter lyckad sparning med det nya priset. */
  onSaved: (price: number) => void
  autoFocus?: boolean
}) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [fel, setFel] = useState(false)

  async function spara() {
    const pris = Math.round(Number(value))
    if (!(pris > 0) || saving) return
    setSaving(true)
    setFel(false)
    try {
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productId, sales_price: pris }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      onSaved(pris)
    } catch {
      setFel(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="number"
        inputMode="numeric"
        min={1}
        value={value}
        autoFocus={autoFocus}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            spara()
          }
        }}
        placeholder="Pris"
        className={`w-24 min-h-[44px] px-2.5 py-1.5 text-sm text-right tabular-nums border rounded-lg focus:outline-none focus:border-primary-600 ${
          fel ? 'border-red-300 bg-red-50/50' : 'border-slate-200 bg-white'
        }`}
      />
      <span className="text-xs text-slate-400 w-10">kr/{unit}</span>
      <button
        type="button"
        onClick={spara}
        disabled={saving || !(Number(value) > 0)}
        title="Spara pris (Enter)"
        className="p-2 min-h-[44px] rounded-lg text-primary-700 hover:bg-primary-50 disabled:opacity-30"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      </button>
    </span>
  )
}
