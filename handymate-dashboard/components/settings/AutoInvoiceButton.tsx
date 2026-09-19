'use client'

// Auto-faktureringsknappen, flyttad ur app/dashboard/settings/page.tsx
// (5 000 rader) 2026-09-18. Flytten är inte städning: Next tillåter inga
// extra namngivna exporter ur en page.tsx, och ui-beviset måste kunna
// montera den RIKTIGA komponenten i 375 px i stället för att skanna sidan
// efter en sträng (.claude/skills/ui-bevis).
//
// Rutten den anropar (app/api/invoices/auto-generate) hoppar över kunder med
// ROT/RUT-historik — avdragsvakten, spår 5. Därför renderas `skipped` här med
// sitt skäl: utan det ser hantverkaren "0 fakturor skapade" utan att få veta
// varför, och vakten blir lika tyst som felet den stänger.

import { useState } from 'react'
import { Loader2, Receipt } from 'lucide-react'

export function AutoInvoiceButton({ businessId, autoSend, maxAmount }: { businessId: string; autoSend: boolean; maxAmount: number }) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ invoices_created: number; invoices: { customer_name: string; total: number }[]; errors: string[]; skipped?: { customer_name: string; reason: string }[] } | null>(null)

  async function runAutoGenerate() {
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/invoices/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_send: autoSend, max_amount: maxAmount }),
      })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ invoices_created: 0, invoices: [], errors: ['Nätverksfel'], skipped: [] })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <button
        onClick={runAutoGenerate}
        disabled={running}
        className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-primary-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
      >
        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
        {running ? 'Genererar...' : 'Generera fakturor nu'}
      </button>

      {result && (
        <div className="mt-3 p-3 bg-gray-50 rounded-xl text-sm">
          {result.invoices_created > 0 ? (
            <>
              <p className="font-medium text-emerald-700">
                {result.invoices_created} faktura{result.invoices_created > 1 ? 'or' : ''} skapad{result.invoices_created > 1 ? 'e' : ''}
              </p>
              <ul className="mt-1 space-y-0.5 text-gray-600">
                {result.invoices.map((inv, i) => (
                  <li key={i}>{inv.customer_name}: {inv.total.toLocaleString('sv-SE')} kr</li>
                ))}
              </ul>
            </>
          ) : (
            // Tomläget får inte påstå att det saknas tidrapporter när
            // sanningen är att kunder hoppades över (avdragsvakten, spår 5)
            // — då letar hantverkaren efter ett fel som inte finns.
            <p className="text-gray-500">
              {(result.skipped || []).length > 0
                ? 'Inga fakturor skapades — se skälen nedan.'
                : 'Inga fakturor att skapa (inga ofakturerade tidrapporter)'}
            </p>
          )}
          {(result.skipped || []).length > 0 && (
            <ul className="mt-2 space-y-1 text-gray-600">
              {(result.skipped || []).map((rad, i) => (
                <li key={i}>
                  <strong className="font-medium text-gray-900">{rad.customer_name}</strong> — {rad.reason}
                </li>
              ))}
            </ul>
          )}
          {result.errors.length > 0 && (
            <div className="mt-2 text-red-600">
              {result.errors.map((err, i) => <p key={i}>{err}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
