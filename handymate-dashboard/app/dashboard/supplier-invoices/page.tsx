'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Search } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { PermissionGate } from '@/components/PermissionGate'

interface SupplierInvoice {
  id: string
  supplier_name: string
  invoice_number: string | null
  invoice_date: string | null
  due_date: string | null
  total_amount: number
  status: 'unpaid' | 'paid' | 'invoiced'
  project_id: string | null
  subcontractor_id: string | null
}

interface ProjectOption {
  project_id: string
  name: string
}

interface SubcontractorOption {
  subcontractor_id: string
  name: string
}

type DisplayStatus = 'unpaid' | 'overdue' | 'paid'

/**
 * Härleder klientsidan om en obetald faktura är förfallen — supplier_invoices
 * har ingen egen 'overdue'-status lagrad i databasen (bara unpaid/paid/
 * invoiced), samma princip som Fortnox-importens mappning använder
 * (lib/fortnox/map-supplier-invoice.ts).
 */
function displayStatus(inv: SupplierInvoice): DisplayStatus {
  if (inv.status === 'paid') return 'paid'
  if (inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10)) return 'overdue'
  return 'unpaid'
}

const STATUS_LABEL: Record<DisplayStatus, string> = {
  unpaid: 'Obetald',
  overdue: 'Förfallen',
  paid: 'Betald',
}

const STATUS_BADGE_CLASS: Record<DisplayStatus, string> = {
  unpaid: 'bg-slate-100 text-slate-600',
  overdue: 'bg-red-50 text-red-600',
  paid: 'bg-green-50 text-green-600',
}

function SupplierInvoicesPageContent() {
  const business = useBusiness()
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [subcontractors, setSubcontractors] = useState<SubcontractorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | DisplayStatus>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!business.business_id) return

    fetch('/api/supplier-invoices')
      .then(r => r.json())
      .then(d => setInvoices(d.invoices || []))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false))

    fetch('/api/projects')
      .then(r => (r.ok ? r.json() : { projects: [] }))
      .then(d => setProjects(d.projects || []))
      .catch(() => setProjects([]))

    // Fail-soft: subcontractors-endpointen är feature-gated ('subcontractors'-
    // planfunktionen) — ett konto utan den ska bara visa inget UE-namn,
    // aldrig ett fel. Samma mönster som Karins matchningskö.
    fetch('/api/subcontractors?status=active')
      .then(r => (r.ok ? r.json() : { subcontractors: [] }))
      .then(d => setSubcontractors(d.subcontractors || []))
      .catch(() => setSubcontractors([]))
  }, [business.business_id])

  const projectNameById = new Map(projects.map(p => [p.project_id, p.name]))
  const subcontractorNameById = new Map(subcontractors.map(s => [s.subcontractor_id, s.name]))

  const filtered = invoices.filter(inv => {
    if (statusFilter !== 'all' && displayStatus(inv) !== statusFilter) return false
    if (search.trim() && !inv.supplier_name.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="font-heading text-xl font-semibold text-slate-900 mb-4">Leverantörsfakturor</h1>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Sök leverantör…"
            className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | DisplayStatus)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900"
        >
          <option value="all">Alla statusar</option>
          <option value="unpaid">Obetald</option>
          <option value="overdue">Förfallen</option>
          <option value="paid">Betald</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-sm text-slate-500">
          Inga leverantörsfakturor matchar filtret.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inv => {
            const status = displayStatus(inv)
            const projectName = inv.project_id ? projectNameById.get(inv.project_id) : null
            const subcontractorName = inv.subcontractor_id ? subcontractorNameById.get(inv.subcontractor_id) : null

            return (
              <div key={inv.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[15px] font-semibold text-slate-900 truncate m-0">{inv.supplier_name}</h3>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE_CLASS[status]}`}>
                      {STATUS_LABEL[status]}
                    </span>
                  </div>
                  <p className="text-[13px] text-slate-500 m-0 truncate">
                    {inv.invoice_date || 'Datum saknas'}
                    {inv.invoice_number && ` · Fakturanr ${inv.invoice_number}`}
                    {subcontractorName && ` · ${subcontractorName}`}
                  </p>
                  {projectName ? (
                    <Link href={`/dashboard/projects/${inv.project_id}`} className="text-[13px] text-primary-700 hover:underline">
                      {projectName}
                    </Link>
                  ) : (
                    <Link href="/dashboard/karin" className="text-[13px] text-amber-600 hover:underline">
                      Ej kopplad — matcha i kön
                    </Link>
                  )}
                </div>
                <span className="font-heading text-sm font-bold tabular-nums text-slate-900 whitespace-nowrap shrink-0">
                  {inv.total_amount.toLocaleString('sv-SE')} kr
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function SupplierInvoicesPage() {
  return (
    <PermissionGate permission="see_financials">
      <SupplierInvoicesPageContent />
    </PermissionGate>
  )
}
