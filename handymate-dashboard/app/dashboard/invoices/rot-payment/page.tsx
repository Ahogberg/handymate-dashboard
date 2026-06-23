'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, AlertTriangle, Check, Info } from 'lucide-react'
import { validateInvoiceForSkv } from '@/lib/skv/validate-rot-request'
import { categoriesForType } from '@/lib/skv/categories'

type RowType = 'rot' | 'rut'

interface EligibleRow {
  invoice_id: string
  invoice_number: string | null
  customer_name: string | null
  personal_number: string | null
  paid_at: string | null
  tax_year: number
  rot_rut_type: RowType
  work_cost: number
  deduction: number
  category: string | null
  hours: number | null
  material_cost: number | null
  property_type: string
  property_designation: string | null
  brf_org_number: string | null
  apartment_number: string | null
}

interface Edit {
  rot_work_category?: string
  rot_hours?: string
  rot_property_type?: string
  rot_property_designation?: string
  rot_brf_org_number?: string
  rot_apartment_number?: string
}

export default function RotPaymentPage() {
  const [data, setData] = useState<{ org_number: string | null; rot: EligibleRow[]; rut: EligibleRow[] } | null>(null)
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<RowType | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/rot-payment/eligible')
      if (res.ok) setData(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="p-8 text-gray-400">Laddar…</div>

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/dashboard/invoices" className="p-2 text-gray-400 hover:text-gray-900 rounded-lg"><ArrowLeft className="w-5 h-5" /></Link>
        <h1 className="text-2xl font-bold text-gray-900">ROT/RUT till Skatteverket</h1>
      </div>
      <p className="text-sm text-gray-500 mb-4 ml-11">
        Skapa en fil med dina betalda ROT/RUT-fakturor och begär utbetalningen från Skatteverket.
      </p>

      <div className="ml-11 mb-6 flex items-start gap-2 p-3 bg-sky-50 border border-sky-200 rounded-xl text-sm text-sky-800">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>Ladda upp den genererade XML-filen i Skatteverkets e-tjänst <strong>&quot;Rot och rut – företag&quot;</strong> och logga in med BankID. ROT och RUT laddas upp som separata filer.</span>
      </div>

      {!data?.org_number && (
        <div className="ml-11 mb-6 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <AlertTriangle className="w-4 h-4" /> Företagets organisationsnummer saknas — fyll i under Inställningar → Företag innan du genererar fil.
        </div>
      )}

      <Section type="rot" rows={data?.rot || []} edits={edits} setEdits={setEdits} selected={selected} setSelected={setSelected}
        orgNumber={data?.org_number || null} generating={generating} setGenerating={setGenerating} onDone={load} />
      <Section type="rut" rows={data?.rut || []} edits={edits} setEdits={setEdits} selected={selected} setSelected={setSelected}
        orgNumber={data?.org_number || null} generating={generating} setGenerating={setGenerating} onDone={load} />
    </div>
  )
}

function Section({ type, rows, edits, setEdits, selected, setSelected, orgNumber, generating, setGenerating, onDone }: {
  type: RowType; rows: EligibleRow[]; edits: Record<string, Edit>; setEdits: (f: (e: Record<string, Edit>) => Record<string, Edit>) => void
  selected: Record<string, boolean>; setSelected: (f: (s: Record<string, boolean>) => Record<string, boolean>) => void
  orgNumber: string | null; generating: RowType | null; setGenerating: (t: RowType | null) => void; onDone: () => void
}) {
  const categories = categoriesForType(type)

  // Live-validering (samma rena funktion som servern använder)
  const validated = useMemo(() => rows.map(row => {
    const e = edits[row.invoice_id] || {}
    const inv = {
      invoice_id: row.invoice_id, invoice_number: row.invoice_number, status: 'paid', paid_at: row.paid_at,
      rot_rut_type: row.rot_rut_type,
      rot_work_cost: type === 'rot' ? row.work_cost : 0, rut_work_cost: type === 'rut' ? row.work_cost : 0,
      rot_deduction: type === 'rot' ? row.deduction : 0, rut_deduction: type === 'rut' ? row.deduction : 0,
      rot_hours: e.rot_hours !== undefined ? Number(e.rot_hours) : row.hours,
      rot_work_category: e.rot_work_category ?? row.category,
      rot_property_type: e.rot_property_type ?? row.property_type,
      rot_property_designation: e.rot_property_designation ?? row.property_designation,
      rot_brf_org_number: e.rot_brf_org_number ?? row.brf_org_number,
      rot_apartment_number: e.rot_apartment_number ?? row.apartment_number,
    }
    const v = validateInvoiceForSkv({
      invoice: inv, customerPersonalNumber: row.personal_number,
      customerPropertyDesignation: row.property_designation, businessOrgNumber: orgNumber, taxYear: row.tax_year,
    })
    return { row, validation: v }
  }), [rows, edits, type, orgNumber])

  const taxYear = rows[0]?.tax_year || new Date().getFullYear()
  const selectableValid = validated.filter(v => v.validation.valid).map(v => v.row.invoice_id)
  const selectedValidIds = selectableValid.filter(id => selected[id])

  const setEdit = (id: string, patch: Edit) => setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  async function generate() {
    if (selectedValidIds.length === 0) return
    setGenerating(type)
    try {
      const res = await fetch('/api/rot-payment/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: selectedValidIds, requestType: type, taxYear, edits }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(j.error || 'Kunde inte generera fil')
      } else {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `skatteverket-${type}-${taxYear}.xml`
        a.click()
        URL.revokeObjectURL(url)
        onDone()
        setSelected(prev => { const n = { ...prev }; selectedValidIds.forEach(id => delete n[id]); return n })
      }
    } catch { alert('Något gick fel') }
    setGenerating(null)
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">{type.toUpperCase()}-avdrag <span className="text-sm font-normal text-gray-400">({rows.length} betalda fakturor)</span></h2>
        <button onClick={generate} disabled={selectedValidIds.length === 0 || generating === type}
          className="flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40">
          <Download className="w-4 h-4" /> {generating === type ? 'Genererar…' : `Generera ${type.toUpperCase()}-fil (${selectedValidIds.length})`}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-6 text-center text-sm text-gray-400">Inga betalda {type.toUpperCase()}-fakturor att rapportera.</div>
      ) : (
        <div className="space-y-2">
          {validated.map(({ row, validation }) => {
            const e = edits[row.invoice_id] || {}
            const propType = e.rot_property_type ?? row.property_type
            return (
              <div key={row.invoice_id} className={`bg-white rounded-xl border p-4 ${validation.valid ? 'border-gray-200' : 'border-amber-200'}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" disabled={!validation.valid} checked={!!selected[row.invoice_id]}
                    onChange={ev => setSelected(prev => ({ ...prev, [row.invoice_id]: ev.target.checked }))}
                    className="mt-1 w-4 h-4 accent-[#0F766E] disabled:opacity-30" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{row.customer_name || 'Okänd kund'}</span>
                      <span className="text-xs text-gray-400">#{row.invoice_number}</span>
                      <span className="text-xs text-gray-400">· {row.paid_at?.slice(0, 10)}</span>
                      {validation.valid
                        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check className="w-3 h-3" /> Klar</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="w-3 h-3" /> {validation.errors.length} att åtgärda</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">Arbetskostnad {row.work_cost.toLocaleString('sv-SE')} kr · Begärt avdrag <strong>{row.deduction.toLocaleString('sv-SE')} kr</strong></div>

                    {/* Luckfält */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                      <select value={e.rot_work_category ?? row.category ?? ''} onChange={ev => setEdit(row.invoice_id, { rot_work_category: ev.target.value })}
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5">
                        <option value="">Välj arbete…</option>
                        {categories.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                      </select>
                      <input type="number" placeholder="Timmar" value={e.rot_hours ?? (row.hours ?? '')} onChange={ev => setEdit(row.invoice_id, { rot_hours: ev.target.value })}
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
                      {type === 'rot' && (
                        <select value={propType} onChange={ev => setEdit(row.invoice_id, { rot_property_type: ev.target.value })}
                          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5">
                          <option value="smahus">Småhus/villa</option>
                          <option value="bostadsratt">Bostadsrätt</option>
                        </select>
                      )}
                      {type === 'rot' && propType === 'bostadsratt' ? (
                        <>
                          <input placeholder="BRF org-nr" value={e.rot_brf_org_number ?? (row.brf_org_number ?? '')} onChange={ev => setEdit(row.invoice_id, { rot_brf_org_number: ev.target.value })}
                            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
                          <input placeholder="Lägenhetsnr (0001)" value={e.rot_apartment_number ?? (row.apartment_number ?? '')} onChange={ev => setEdit(row.invoice_id, { rot_apartment_number: ev.target.value })}
                            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
                        </>
                      ) : type === 'rot' ? (
                        <input placeholder="Fastighetsbeteckning" value={e.rot_property_designation ?? (row.property_designation ?? '')} onChange={ev => setEdit(row.invoice_id, { rot_property_designation: ev.target.value })}
                          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
                      ) : null}
                    </div>

                    {!validation.valid && (
                      <ul className="mt-2 text-xs text-amber-700 list-disc list-inside space-y-0.5">
                        {validation.errors.map((err, i) => <li key={i}>{err}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
