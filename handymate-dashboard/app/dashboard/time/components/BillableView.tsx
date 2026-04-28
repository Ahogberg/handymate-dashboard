'use client'

import { useEffect, useState, useMemo } from 'react'
import { Loader2, FileText, Receipt, ChevronRight, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

interface BillableEntry {
  time_entry_id: string
  project_id: string | null
  customer_id: string | null
  duration_minutes: number
  hourly_rate: number | null
  description: string | null
  work_date: string
  customer?: { customer_id: string; name: string } | null
  project?: { project_id: string; name: string } | null
}

interface ProjectGroup {
  key: string
  projectId: string | null
  projectName: string
  customerId: string | null
  customerName: string
  entries: BillableEntry[]
  totalMinutes: number
  estimatedRevenue: number
}

const fmtKr = (n: number) => Math.round(n).toLocaleString('sv-SE') + ' kr'
const fmtH = (mins: number) => {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/**
 * "Att fakturera" — godkänd, fakturerbar, ej fakturerad tid grupperad per projekt.
 * Klick på "Skapa faktura" anropar /api/invoices/from-time-entries med projektets entries.
 */
export default function BillableView() {
  const business = useBusiness()
  const [entries, setEntries] = useState<BillableEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (business.business_id) load()
  }, [business.business_id])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('time_entry')
        .select(`
          time_entry_id, project_id, customer_id,
          duration_minutes, hourly_rate, description, work_date,
          customer:customer_id (customer_id, name),
          project:project_id (project_id, name)
        `)
        .eq('business_id', business.business_id)
        .eq('is_billable', true)
        .eq('invoiced', false)
        .eq('approval_status', 'approved')
        .order('work_date', { ascending: false })

      if (error) throw error
      setEntries((data as any) || [])
    } catch (err: any) {
      console.error('Load billable error:', err)
      setToast({ msg: err.message || 'Kunde inte ladda', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  /** Gruppera per projekt (eller per kund om projekt saknas). */
  const groups = useMemo<ProjectGroup[]>(() => {
    const map: Record<string, ProjectGroup> = {}
    for (const e of entries) {
      const key = e.project_id ? `p:${e.project_id}` : `c:${e.customer_id || 'none'}`
      if (!map[key]) {
        map[key] = {
          key,
          projectId: e.project_id,
          projectName: e.project?.name || 'Övrig tid (ej projektlagt)',
          customerId: e.customer_id,
          customerName: e.customer?.name || 'Ingen kund',
          entries: [],
          totalMinutes: 0,
          estimatedRevenue: 0,
        }
      }
      map[key].entries.push(e)
      map[key].totalMinutes += e.duration_minutes || 0
      map[key].estimatedRevenue += ((e.duration_minutes || 0) / 60) * (e.hourly_rate || 0)
    }
    return Object.values(map).sort((a, b) => b.estimatedRevenue - a.estimatedRevenue)
  }, [entries])

  const grandTotalMins = groups.reduce((s, g) => s + g.totalMinutes, 0)
  const grandTotalRev = groups.reduce((s, g) => s + g.estimatedRevenue, 0)

  async function handleCreateInvoice(group: ProjectGroup) {
    if (!group.customerId) {
      showToast('Posten saknar kund — uppdatera först.', 'error')
      return
    }
    if (group.entries.length === 0) return
    setCreating(group.key)
    try {
      const res = await fetch('/api/invoices/from-time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: group.customerId,
          project_id: group.projectId || undefined,
          time_entry_ids: group.entries.map(e => e.time_entry_id),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunde inte skapa faktura')
      showToast(`Faktura skapad för ${group.projectName}`, 'success')
      load()
    } catch (err: any) {
      showToast(err.message || 'Kunde inte skapa faktura', 'error')
    } finally {
      setCreating(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-7 h-7 text-[#0F766E] animate-spin" />
      </div>
    )
  }

  return (
    <div>
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-lg border-thin text-[13px] ${
          toast.type === 'success' ? 'bg-[#F0FDF4] border-[#86EFAC] text-[#16A34A]' : 'bg-[#FEF2F2] border-[#FCA5A5] text-[#DC2626]'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Summa-kort */}
      {groups.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl px-4 py-[14px]">
            <div className="text-[10px] tracking-[0.08em] uppercase text-[#94A3B8] mb-[6px]">Projekt redo</div>
            <div className="text-[20px] font-medium text-[#0F172A]">{groups.length}</div>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-2xl px-4 py-[14px]">
            <div className="text-[10px] tracking-[0.08em] uppercase text-[#94A3B8] mb-[6px]">Ofakturerade timmar</div>
            <div className="text-[20px] font-medium text-[#0F172A]">{fmtH(grandTotalMins)}</div>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-2xl px-4 py-[14px]">
            <div className="text-[10px] tracking-[0.08em] uppercase text-[#94A3B8] mb-[6px]">Beräknat värde</div>
            <div className="text-[20px] font-medium text-[#0F766E]">{fmtKr(grandTotalRev)}</div>
          </div>
        </div>
      )}

      {/* Tom-state */}
      {groups.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-12 text-center">
          <Receipt className="w-10 h-10 text-[#CBD5E1] mx-auto mb-3" />
          <p className="text-[14px] font-medium text-[#0F172A]">Inget att fakturera just nu</p>
          <p className="text-[13px] text-[#64748B] mt-1">
            Tid syns här när den är godkänd och markerad som fakturerbar.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(group => (
            <div key={group.key} className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
              <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-[2px]">
                    <FileText className="w-[14px] h-[14px] text-[#94A3B8] flex-shrink-0" />
                    <span className="text-[13px] font-semibold text-[#0F172A] truncate">
                      {group.projectName}
                    </span>
                  </div>
                  <div className="text-[12px] text-[#64748B]">
                    {group.customerName} · {group.entries.length} {group.entries.length === 1 ? 'post' : 'poster'} · {fmtH(group.totalMinutes)}
                  </div>
                </div>

                <div className="flex items-center gap-4 sm:flex-shrink-0">
                  <div className="text-right">
                    <div className="text-[16px] font-semibold text-[#0F172A] leading-none">{fmtKr(group.estimatedRevenue)}</div>
                    <div className="text-[11px] text-[#94A3B8] mt-[3px]">beräknat</div>
                  </div>
                  <button
                    onClick={() => handleCreateInvoice(group)}
                    disabled={creating === group.key || !group.customerId}
                    className="flex items-center gap-[6px] px-4 py-[9px] bg-[#0F766E] text-white border-none rounded-lg text-[13px] font-medium cursor-pointer hover:bg-[#0D9488] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {creating === group.key ? (
                      <>
                        <Loader2 className="w-[14px] h-[14px] animate-spin" />
                        Skapar…
                      </>
                    ) : (
                      <>
                        <Check className="w-[14px] h-[14px]" />
                        Skapa faktura
                        <ChevronRight className="w-[14px] h-[14px]" />
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Detaljer (kollapsbar disposition — sista 5 raderna) */}
              {group.entries.length > 0 && (
                <details className="border-t border-[#F1F5F9]">
                  <summary className="px-4 py-[10px] text-[12px] text-[#64748B] cursor-pointer hover:text-[#1E293B] select-none">
                    Visa poster ({group.entries.length})
                  </summary>
                  <div className="divide-y divide-[#F1F5F9]">
                    {group.entries.slice(0, 20).map(e => (
                      <div key={e.time_entry_id} className="px-4 py-[10px] flex items-center justify-between gap-3 text-[12px]">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-[#94A3B8] flex-shrink-0">{e.work_date}</span>
                          <span className="font-medium text-[#1E293B] flex-shrink-0">{fmtH(e.duration_minutes)}</span>
                          {e.description && <span className="text-[#64748B] truncate">{e.description}</span>}
                        </div>
                        <span className="text-[#94A3B8] flex-shrink-0 font-mono">
                          {fmtKr(((e.duration_minutes || 0) / 60) * (e.hourly_rate || 0))}
                        </span>
                      </div>
                    ))}
                    {group.entries.length > 20 && (
                      <div className="px-4 py-2 text-[11px] text-[#94A3B8] text-center">
                        +{group.entries.length - 20} fler — visas alla i fakturaförhandsgranskning
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
