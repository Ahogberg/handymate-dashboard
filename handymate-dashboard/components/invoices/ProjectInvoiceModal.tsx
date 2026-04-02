'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Receipt, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface InvoiceLine {
  id: string
  source: 'time_entry' | 'material' | 'manual'
  source_id?: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  is_rot_eligible: boolean
  is_rut_eligible: boolean
}

interface ProjectInvoiceData {
  project: {
    id: string
    name: string
    customer: {
      customer_id: string
      name: string
      email?: string
      phone_number?: string
      personal_number?: string
      address_line?: string
    } | null
  }
  labor: { lines: InvoiceLine[]; total: number }
  materials: { lines: InvoiceLine[]; total: number }
  config: {
    default_hourly_rate: number
    default_payment_days: number
    invoice_prefix: string
    next_invoice_number: number
    bankgiro_number?: string
    swish_number?: string
    f_skatt_registered?: boolean
  }
}

interface Props {
  projectId: string
  onClose: () => void
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n) + ' kr'
}

export default function ProjectInvoiceModal({ projectId, onClose }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [data, setData] = useState<ProjectInvoiceData | null>(null)
  const [error, setError] = useState('')

  // Editable lines
  const [laborLines, setLaborLines] = useState<InvoiceLine[]>([])
  const [materialLines, setMaterialLines] = useState<InvoiceLine[]>([])
  const [extraLines, setExtraLines] = useState<InvoiceLine[]>([])

  // Settings
  const [rotRutType, setRotRutType] = useState<'rot' | 'rut' | ''>('')
  const [discountPercent, setDiscountPercent] = useState(0)
  const [paymentDays, setPaymentDays] = useState(30)

  useEffect(() => {
    fetchData()
  }, [projectId])

  async function fetchData() {
    try {
      const res = await fetch(`/api/invoices/from-project?project_id=${projectId}`)
      if (!res.ok) throw new Error('Kunde inte hämta underlag')
      const json = await res.json()
      setData(json)
      setLaborLines(json.labor.lines.map((l: any, i: number) => ({ ...l, id: `labor_${i}` })))
      setMaterialLines(json.materials.lines.map((l: any, i: number) => ({ ...l, id: `mat_${i}` })))
      setPaymentDays(json.config.default_payment_days || 30)
    } catch (e: any) {
      setError(e.message)
    }
    setLoading(false)
  }

  function updateLine(
    lines: InvoiceLine[],
    setLines: (l: InvoiceLine[]) => void,
    id: string,
    field: string,
    value: any
  ) {
    setLines(lines.map(l => {
      if (l.id !== id) return l
      const updated = { ...l, [field]: value }
      if (field === 'quantity' || field === 'unit_price') {
        updated.total = Math.round(updated.quantity * updated.unit_price)
      }
      return updated
    }))
  }

  function removeLine(lines: InvoiceLine[], setLines: (l: InvoiceLine[]) => void, id: string) {
    setLines(lines.filter(l => l.id !== id))
  }

  function addManualLine(setLines: (fn: (prev: InvoiceLine[]) => InvoiceLine[]) => void, source: 'time_entry' | 'material' | 'manual') {
    const newLine: InvoiceLine = {
      id: `manual_${Date.now()}`,
      source,
      description: '',
      quantity: 1,
      unit: source === 'time_entry' ? 'tim' : 'st',
      unit_price: source === 'time_entry' ? (data?.config.default_hourly_rate || 895) : 0,
      total: source === 'time_entry' ? (data?.config.default_hourly_rate || 895) : 0,
      is_rot_eligible: source === 'time_entry',
      is_rut_eligible: false,
    }
    setLines(prev => [...prev, newLine])
  }

  // Beräkningar
  const laborTotal = laborLines.reduce((s, l) => s + l.total, 0)
  const materialTotal = materialLines.reduce((s, l) => s + l.total, 0)
  const extraTotal = extraLines.reduce((s, l) => s + l.total, 0)
  const subtotal = laborTotal + materialTotal + extraTotal
  const discountAmount = Math.round(subtotal * (discountPercent / 100))
  const netAmount = subtotal - discountAmount
  const vatAmount = Math.round(netAmount * 0.25)
  const grossTotal = netAmount + vatAmount

  const rotEligible = [...laborLines, ...extraLines].filter(l => l.is_rot_eligible).reduce((s, l) => s + l.total, 0)
  const rutEligible = [...laborLines, ...extraLines].filter(l => l.is_rut_eligible).reduce((s, l) => s + l.total, 0)
  const rotDeduction = rotRutType === 'rot' ? Math.min(Math.round(rotEligible * 0.3), 50000) : 0
  const rutDeduction = rotRutType === 'rut' ? Math.min(Math.round(rutEligible * 0.5), 75000) : 0
  const customerPays = grossTotal - rotDeduction - rutDeduction

  async function handleGenerate() {
    if (!data) return
    setGenerating(true)

    const allItems = [
      ...laborLines.map(l => ({ ...l, item_type: 'item' })),
      ...materialLines.map(l => ({ ...l, item_type: 'item' })),
      ...extraLines.map(l => ({ ...l, item_type: 'item' })),
    ]

    const sourceTimeIds = laborLines.filter(l => l.source === 'time_entry' && l.source_id).map(l => l.source_id)
    const sourceMaterialIds = materialLines.filter(l => l.source === 'material' && l.source_id).map(l => l.source_id)

    try {
      const res = await fetch('/api/invoices/from-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          customer_id: data.project.customer?.customer_id,
          items: allItems,
          vat_rate: 25,
          rot_rut_type: rotRutType || null,
          discount_percent: discountPercent,
          payment_days: paymentDays,
          source_time_entry_ids: sourceTimeIds,
          source_material_ids: sourceMaterialIds,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Kunde inte skapa faktura')
      }

      const result = await res.json()
      onClose()
      router.push(`/dashboard/invoices/${result.invoice_id}`)
    } catch (e: any) {
      setError(e.message)
      setGenerating(false)
    }
  }

  const allLines = laborLines.length + materialLines.length + extraLines.length

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-8">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Fakturaunderlag
            </h2>
            {data && (
              <p className="text-sm text-gray-500 mt-0.5">{data.project.name}</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-6 h-6 text-primary-700 animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-400">Hämtar underlag...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-500 text-sm">{error}</div>
        ) : (
          <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Kund-info */}
            {data?.project.customer && (
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-semibold text-sm">
                  {data.project.customer.name?.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{data.project.customer.name}</p>
                  <p className="text-xs text-gray-400">{data.project.customer.email || data.project.customer.phone_number || ''}</p>
                </div>
              </div>
            )}

            {/* Arbetstid */}
            <Section
              title="Arbetstid"
              total={laborTotal}
              lines={laborLines}
              setLines={setLaborLines}
              updateLine={updateLine}
              removeLine={removeLine}
              onAddLine={() => addManualLine(setLaborLines, 'time_entry')}
            />

            {/* Material */}
            <Section
              title="Material"
              total={materialTotal}
              lines={materialLines}
              setLines={setMaterialLines}
              updateLine={updateLine}
              removeLine={removeLine}
              onAddLine={() => addManualLine(setMaterialLines, 'material')}
            />

            {/* Övrigt */}
            <Section
              title="Övrigt"
              total={extraTotal}
              lines={extraLines}
              setLines={setExtraLines}
              updateLine={updateLine}
              removeLine={removeLine}
              onAddLine={() => addManualLine(setExtraLines, 'manual')}
            />

            {/* Summering */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Netto exkl. moms</span>
                <span className="font-medium text-gray-900">{formatCurrency(netAmount)}</span>
              </div>
              {discountPercent > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Rabatt ({discountPercent}%)</span>
                  <span className="text-red-600">-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Moms 25%</span>
                <span className="text-gray-700">{formatCurrency(vatAmount)}</span>
              </div>
              {rotDeduction > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">ROT-avdrag (30% av {formatCurrency(rotEligible)})</span>
                  <span className="text-green-600">-{formatCurrency(rotDeduction)}</span>
                </div>
              )}
              {rutDeduction > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">RUT-avdrag (50% av {formatCurrency(rutEligible)})</span>
                  <span className="text-green-600">-{formatCurrency(rutDeduction)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-200">
                <span>Att betala</span>
                <span className="text-primary-700">{formatCurrency(customerPays)}</span>
              </div>
            </div>

            {/* Inställningar */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ROT/RUT</label>
                <select
                  value={rotRutType}
                  onChange={e => setRotRutType(e.target.value as any)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Inget avdrag</option>
                  <option value="rot">ROT (30%)</option>
                  <option value="rut">RUT (50%)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Rabatt %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={discountPercent}
                  onChange={e => setDiscountPercent(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Betalningsvillkor</label>
                <select
                  value={paymentDays}
                  onChange={e => setPaymentDays(Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value={14}>14 dagar</option>
                  <option value={30}>30 dagar</option>
                  <option value={60}>60 dagar</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {!loading && !error && (
          <div className="flex items-center justify-between p-5 border-t bg-gray-50 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700">
              Avbryt
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleGenerate}
                disabled={generating || allLines === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary-800 text-white rounded-xl text-sm font-semibold hover:bg-primary-800 transition-colors disabled:opacity-40"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Receipt className="w-4 h-4" />
                )}
                Generera faktura
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section Component ──

function Section({
  title,
  total,
  lines,
  setLines,
  updateLine,
  removeLine,
  onAddLine,
}: {
  title: string
  total: number
  lines: InvoiceLine[]
  setLines: (l: InvoiceLine[]) => void
  updateLine: (lines: InvoiceLine[], set: (l: InvoiceLine[]) => void, id: string, field: string, val: any) => void
  removeLine: (lines: InvoiceLine[], set: (l: InvoiceLine[]) => void, id: string) => void
  onAddLine: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="text-sm font-medium text-gray-500">{formatCurrency(total)}</span>
      </div>

      {lines.length === 0 ? (
        <p className="text-xs text-gray-400 mb-2">Inga poster</p>
      ) : (
        <div className="space-y-1.5 mb-2">
          {lines.map(line => (
            <div key={line.id} className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2 group">
              <input
                value={line.description}
                onChange={e => updateLine(lines, setLines, line.id, 'description', e.target.value)}
                className="flex-1 text-sm border-0 outline-none bg-transparent min-w-0"
                placeholder="Beskrivning"
              />
              <input
                type="number"
                value={line.quantity}
                onChange={e => updateLine(lines, setLines, line.id, 'quantity', Number(e.target.value))}
                className="w-16 text-sm text-right border rounded px-1.5 py-0.5"
              />
              <span className="text-xs text-gray-400 w-8">{line.unit}</span>
              <span className="text-xs text-gray-400">×</span>
              <input
                type="number"
                value={line.unit_price}
                onChange={e => updateLine(lines, setLines, line.id, 'unit_price', Number(e.target.value))}
                className="w-20 text-sm text-right border rounded px-1.5 py-0.5"
              />
              <span className="text-xs text-gray-400 w-4">kr</span>
              <span className="text-sm font-medium text-gray-700 w-20 text-right">
                {formatCurrency(line.total)}
              </span>
              <button
                onClick={() => removeLine(lines, setLines, line.id)}
                className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onAddLine}
        className="flex items-center gap-1 text-xs text-primary-700 hover:text-primary-700 font-medium"
      >
        <Plus className="w-3.5 h-3.5" />
        Lägg till rad
      </button>
    </div>
  )
}
