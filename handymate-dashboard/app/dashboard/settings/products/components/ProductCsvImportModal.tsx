'use client'

import { useRef, useState } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { useToast } from '@/components/Toast'
import {
  parseCsvText,
  autoDetectPriceListColumns,
  mapCsvRowsToPriceList,
  type PriceListColumnMapping,
  type PriceListRow,
  type PriceListRowError,
} from '@/lib/csv/parse-price-list'

const SELECT_CLS =
  'w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors'

interface ProductCsvImportModalProps {
  onClose: () => void
  /** Anropas efter att minst en produkt sparats — orchestrator hämtar om listan. */
  onImported: () => void
}

type Step = 'upload' | 'map' | 'importing'

/**
 * CSV-import till produktbanken (P2, UX-revision 2026-08-03). Kolumner:
 * namn, enhet, pris, kategori (valfri). Ren parsning via
 * lib/csv/parse-price-list.ts (samma grundlogik som den befintliga,
 * fungerande grossist-importen i settings/pricelist/page.tsx — se
 * filhuvudet där för varför den INTE återanvänds direkt: den skriver till
 * en annan tabell, suppliers/products, som AI:n inte läser).
 *
 * /api/products saknar ett bulk-POST-läge — raderna skickas sekventiellt,
 * en POST per rad. Rimligt för en prislista i taget (typiskt tiotals-
 * hundratals rader); ett riktigt bulk-endpoint är en separat förbättring
 * om volymen blir ett problem.
 */
export function ProductCsvImportModal({ onClose, onImported }: ProductCsvImportModalProps) {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<PriceListColumnMapping>({})
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 })

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Endast CSV-filer stöds')
      return
    }
    const reader = new FileReader()
    reader.onload = event => {
      const text = event.target?.result as string
      const { headers: parsedHeaders, rows } = parseCsvText(text)
      if (parsedHeaders.length === 0) {
        toast.error('Filen verkar vara tom')
        return
      }
      setHeaders(parsedHeaders)
      setRawRows(rows)
      setMapping(autoDetectPriceListColumns(parsedHeaders))
      setStep('map')
    }
    reader.onerror = () => toast.error('Kunde inte läsa filen')
    reader.readAsText(file)
  }

  const { valid: mappedRows, errors: mappedErrors }: { valid: PriceListRow[]; errors: PriceListRowError[] } =
    mapping.name && mapping.price
      ? mapCsvRowsToPriceList(rawRows, mapping)
      : { valid: [], errors: [] }

  async function handleImport() {
    if (mappedRows.length === 0) return
    setStep('importing')
    setImportProgress({ done: 0, total: mappedRows.length })

    let successCount = 0
    let failCount = 0
    for (const row of mappedRows) {
      try {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: row.name,
            unit: row.unit,
            sales_price: row.sales_price,
            category: row.category || 'material',
          }),
        })
        if (res.ok) successCount += 1
        else failCount += 1
      } catch {
        failCount += 1
      }
      setImportProgress(p => ({ ...p, done: p.done + 1 }))
    }

    if (successCount > 0) {
      toast.success(
        failCount > 0
          ? `${successCount} produkter importerade, ${failCount} misslyckades`
          : `${successCount} produkter importerade`,
      )
      onImported()
    } else {
      toast.error('Ingen produkt kunde importeras')
      setStep('map')
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary-700" />
            Ladda upp prislista (CSV)
          </h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Ladda upp en CSV-fil med dina priser. Filen bör ha kolumner för produktnamn och pris —
                enhet och kategori är valfria.
              </p>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-10 text-center cursor-pointer hover:border-primary-300 transition-colors"
              >
                <Upload className="w-9 h-9 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-900 font-medium text-sm">Klicka för att välja fil</p>
                <p className="text-slate-400 text-xs mt-1">CSV-filer (.csv)</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleFile(file)
                }}
              />
            </div>
          )}

          {step === 'map' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Välj vilka kolumner i din fil som motsvarar produktdata. Namn och pris krävs.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    { key: 'name', label: 'Produktnamn *' },
                    { key: 'unit', label: 'Enhet' },
                    { key: 'price', label: 'Pris *' },
                    { key: 'category', label: 'Kategori' },
                  ] as const
                ).map(field => (
                  <div key={field.key}>
                    <label className="block text-xs text-slate-500 mb-1">{field.label}</label>
                    <select
                      value={mapping[field.key] || ''}
                      onChange={e =>
                        setMapping(prev => ({ ...prev, [field.key]: e.target.value || undefined }))
                      }
                      className={SELECT_CLS}
                    >
                      <option value="">Ingen kolumn</option>
                      {headers.map(h => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {mapping.name && mapping.price && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                      <div className="text-lg font-bold text-emerald-600">{mappedRows.length}</div>
                      <div className="text-xs text-emerald-600/80">Giltiga rader</div>
                    </div>
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
                      <div className="text-lg font-bold text-red-600">{mappedErrors.length}</div>
                      <div className="text-xs text-red-600/80">Fel</div>
                    </div>
                  </div>

                  {mappedErrors.length > 0 && (
                    <div className="max-h-24 overflow-y-auto p-3 bg-red-50 border border-red-200 rounded-lg">
                      <ul className="text-xs text-red-600/80 space-y-0.5">
                        {mappedErrors.slice(0, 10).map((e, i) => (
                          <li key={i}>{e.message}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {mappedRows.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1.5">Förhandsgranskning (första 5):</p>
                      <div className="bg-slate-50 rounded-lg overflow-hidden overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-200">
                              <th className="text-left p-2 text-slate-400">Namn</th>
                              <th className="text-left p-2 text-slate-400">Enhet</th>
                              <th className="text-right p-2 text-slate-400">Pris</th>
                              <th className="text-left p-2 text-slate-400">Kategori</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mappedRows.slice(0, 5).map((r, i) => (
                              <tr key={i} className="border-b border-slate-100">
                                <td className="p-2 text-slate-900">{r.name}</td>
                                <td className="p-2 text-slate-500">{r.unit}</td>
                                <td className="p-2 text-right text-slate-900">
                                  {r.sales_price.toLocaleString('sv-SE')} kr
                                </td>
                                <td className="p-2 text-slate-500">{r.category || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-between pt-2">
                <button
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 text-sm text-slate-500 hover:text-slate-900"
                >
                  Tillbaka
                </button>
                <button
                  onClick={handleImport}
                  disabled={mappedRows.length === 0}
                  className="px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors"
                >
                  Importera {mappedRows.length > 0 ? mappedRows.length : ''} produkter
                </button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="text-center py-12">
              <Loader2 className="w-10 h-10 text-primary-700 animate-spin mx-auto mb-4" />
              <p className="text-slate-900 font-medium text-sm">
                Importerar {importProgress.done}/{importProgress.total}…
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
