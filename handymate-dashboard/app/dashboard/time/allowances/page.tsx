'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Car,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  X,
  Settings,
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import Link from 'next/link'
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  format,
  parseISO,
  getISOWeek,
  isSameDay,
  addDays,
} from 'date-fns'
import { sv } from 'date-fns/locale'

interface AllowanceType {
  id: string
  name: string
  type: string  // 'mileage' | 'daily' | 'hourly' | 'fixed'
  rate: number
  unit: string
  is_taxable: boolean
  billable_to_customer: boolean
  is_system: boolean
}

interface AllowanceReport {
  id: string
  allowance_type_id: string
  project_id: string | null
  business_user_id: string | null
  report_date: string
  quantity: number
  amount: number
  description: string | null
  billable: boolean
  invoiced: boolean
  from_address: string | null
  to_address: string | null
  distance_km: number | null
  created_at: string
  allowance_type: AllowanceType | null
  project: { name: string } | null
}

interface SimpleProject {
  project_id: string
  name: string
}

const TYPE_ICONS: Record<string, typeof Car> = {
  mileage: Car,
  daily: Sun,
  hourly: Moon,
  fixed: Settings,
}

export default function AllowancesPage() {
  const business = useBusiness()
  const { user: currentUser } = useCurrentUser()
  const [loading, setLoading] = useState(true)
  const [types, setTypes] = useState<AllowanceType[]>([])
  const [reports, setReports] = useState<AllowanceReport[]>([])
  const [projects, setProjects] = useState<SimpleProject[]>([])
  const [weekDate, setWeekDate] = useState(new Date())
  const [showModal, setShowModal] = useState(false)
  const [showTypeModal, setShowTypeModal] = useState(false)

  const weekStart = startOfWeek(weekDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(weekDate, { weekStartsOn: 1 })
  const weekNumber = getISOWeek(weekDate)

  useEffect(() => {
    if (business.business_id) {
      fetchTypes()
      fetchProjects()
    }
  }, [business.business_id])

  useEffect(() => {
    if (business.business_id) fetchReports()
  }, [business.business_id, weekDate])

  async function fetchTypes() {
    try {
      const res = await fetch('/api/allowance-types')
      if (res.ok) {
        const data = await res.json()
        setTypes(data.types || [])
      }
    } catch { /* ignore */ }
  }

  async function fetchReports() {
    setLoading(true)
    try {
      const start = format(weekStart, 'yyyy-MM-dd')
      const end = format(weekEnd, 'yyyy-MM-dd')
      const res = await fetch(`/api/allowances?startDate=${start}&endDate=${end}`)
      if (res.ok) {
        const data = await res.json()
        setReports(data.reports || [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function fetchProjects() {
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data } = await supabase
        .from('project')
        .select('project_id, name')
        .eq('business_id', business.business_id)
        .in('status', ['active', 'in_progress', 'planning'])
        .order('name')
      setProjects(data || [])
    } catch { /* ignore */ }
  }

  async function deleteReport(id: string) {
    if (!confirm('Ta bort denna ersättning?')) return
    try {
      const res = await fetch(`/api/allowances?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setReports(prev => prev.filter(r => r.id !== id))
      }
    } catch { /* ignore */ }
  }

  const fmtKr = (n: number) => n.toLocaleString('sv-SE') + ' kr'
  const fmtDate = (d: string) => format(parseISO(d), 'EEEE d MMMM', { locale: sv })

  // Group reports by date
  const reportsByDate: Record<string, AllowanceReport[]> = {}
  for (const r of reports) {
    if (!reportsByDate[r.report_date]) reportsByDate[r.report_date] = []
    reportsByDate[r.report_date].push(r)
  }
  const sortedDates = Object.keys(reportsByDate).sort()

  // Totals
  const weekTotal = reports.reduce((s, r) => s + r.amount, 0)
  const weekBillable = reports.filter(r => r.billable).reduce((s, r) => s + r.amount, 0)

  const getTypeIcon = (type: string) => {
    const Icon = TYPE_ICONS[type] || Settings
    return <Icon className="w-4 h-4" />
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/time" className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Ersättningar</h1>
            <p className="text-sm text-gray-500 mt-0.5">Milersättning, traktamente, OB-tillägg</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Ny ersättning
          </button>
        </div>

        {/* Week navigator */}
        <div className="flex items-center justify-between mb-4 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <button onClick={() => setWeekDate(subWeeks(weekDate, 1))} className="p-1 text-gray-400 hover:text-gray-900 rounded-lg transition-all">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-900">Vecka {weekNumber}</p>
            <p className="text-xs text-gray-500">
              {format(weekStart, 'd MMM', { locale: sv })} – {format(weekEnd, 'd MMM yyyy', { locale: sv })}
            </p>
          </div>
          <button onClick={() => setWeekDate(addWeeks(weekDate, 1))} className="p-1 text-gray-400 hover:text-gray-900 rounded-lg transition-all">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Vecka totalt</p>
            <p className="text-lg font-semibold text-gray-900">{fmtKr(weekTotal)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Debiterbart</p>
            <p className="text-lg font-semibold text-primary-700">{fmtKr(weekBillable)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Löneunderlag</p>
            <p className="text-lg font-semibold text-gray-900">{fmtKr(weekTotal)}</p>
          </div>
        </div>

        {/* Report list by day */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <Car className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Inga ersättningar denna vecka</p>
            <p className="text-xs text-gray-400 mt-1">Klicka "Ny ersättning" för att rapportera</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedDates.map(date => (
              <div key={date}>
                <h3 className="text-sm font-medium text-gray-500 mb-2 capitalize">{fmtDate(date)}</h3>
                <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                  {reportsByDate[date].map(report => (
                    <div key={report.id} className="flex items-start gap-3 p-4">
                      <div className={`mt-0.5 p-2 rounded-lg flex-shrink-0 ${
                        report.allowance_type?.type === 'mileage' ? 'bg-blue-50 text-blue-600' :
                        report.allowance_type?.type === 'daily' ? 'bg-amber-50 text-amber-600' :
                        report.allowance_type?.type === 'hourly' ? 'bg-purple-50 text-purple-600' :
                        'bg-gray-50 text-gray-600'
                      }`}>
                        {getTypeIcon(report.allowance_type?.type || 'fixed')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">{report.allowance_type?.name || 'Okänd typ'}</p>
                          {report.billable && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-primary-50 text-primary-700 border border-primary-300 rounded-full">Debiterbar</span>
                          )}
                        </div>
                        {report.project && (
                          <p className="text-xs text-gray-500">{report.project.name}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {report.quantity} {report.allowance_type?.unit || 'st'} × {fmtKr(report.allowance_type?.rate || 0)}
                          {report.description && ` — ${report.description}`}
                        </p>
                        {report.from_address && report.to_address && (
                          <p className="text-xs text-gray-400">{report.from_address} → {report.to_address}</p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-gray-900">{fmtKr(report.amount)}</p>
                        {!report.invoiced && (
                          <button
                            onClick={() => deleteReport(report.id)}
                            className="mt-1 p-1 text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Allowance Modal */}
      {showModal && (
        <NewAllowanceModal
          types={types}
          projects={projects}
          currentUserId={currentUser?.id || null}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false)
            fetchReports()
          }}
          onCreateType={() => {
            setShowModal(false)
            setShowTypeModal(true)
          }}
        />
      )}

      {/* New Type Modal */}
      {showTypeModal && (
        <NewTypeModal
          onClose={() => setShowTypeModal(false)}
          onSaved={() => {
            setShowTypeModal(false)
            fetchTypes()
            setShowModal(true)
          }}
        />
      )}
    </div>
  )
}

// --- New Allowance Modal ---

function NewAllowanceModal({ types, projects, currentUserId, onClose, onSaved, onCreateType }: {
  types: AllowanceType[]
  projects: SimpleProject[]
  currentUserId: string | null
  onClose: () => void
  onSaved: () => void
  onCreateType: () => void
}) {
  const [typeId, setTypeId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [quantity, setQuantity] = useState('')
  const [description, setDescription] = useState('')
  const [billable, setBillable] = useState(false)
  const [fromAddress, setFromAddress] = useState('')
  const [toAddress, setToAddress] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedType = types.find(t => t.id === typeId)
  const isMileage = selectedType?.type === 'mileage'
  const calculatedAmount = selectedType ? (selectedType.rate * (parseFloat(quantity) || 0)) : 0

  // When type changes, default billable
  useEffect(() => {
    if (selectedType) {
      setBillable(selectedType.billable_to_customer)
    }
  }, [typeId])

  const handleSave = async () => {
    if (!typeId || !quantity) return
    setSaving(true)
    try {
      const res = await fetch('/api/allowances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowance_type_id: typeId,
          project_id: projectId || null,
          business_user_id: currentUserId,
          report_date: date,
          quantity: parseFloat(quantity),
          amount: calculatedAmount,
          description: description.trim() || null,
          billable,
          from_address: fromAddress.trim() || null,
          to_address: toAddress.trim() || null,
          distance_km: isMileage ? parseFloat(quantity) || null : null,
        })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error')
      }
      onSaved()
    } catch (err: any) {
      alert(err.message || 'Kunde inte spara')
      setSaving(false)
    }
  }

  // Group types
  const systemTypes = types.filter(t => t.is_system)
  const customTypes = types.filter(t => !t.is_system)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Ny ersättning</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Type selector */}
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Typ</label>
            <select
              value={typeId}
              onChange={e => setTypeId(e.target.value)}
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-600/50"
            >
              <option value="">Välj ersättningstyp...</option>
              {systemTypes.length > 0 && (
                <optgroup label="Skatteverket standard">
                  {systemTypes.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.rate} kr/{t.unit})
                    </option>
                  ))}
                </optgroup>
              )}
              {customTypes.length > 0 && (
                <optgroup label="Egna typer">
                  {customTypes.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.rate} kr/{t.unit})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <button
              onClick={onCreateType}
              className="mt-2 text-xs text-primary-700 hover:text-primary-700 font-medium"
            >
              + Skapa ny typ
            </button>
          </div>

          {/* Project */}
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Projekt (valfritt)</label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-600/50"
            >
              <option value="">Inget projekt</option>
              {projects.map(p => (
                <option key={p.project_id} value={p.project_id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Datum</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-600/50"
            />
          </div>

          {/* Quantity */}
          <div>
            <label className="text-sm text-gray-500 mb-2 block">
              Antal {selectedType ? `(${selectedType.unit})` : ''}
            </label>
            <input
              type="number"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="0"
              min="0"
              step="0.5"
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/50"
            />
            {selectedType && quantity && (
              <p className="text-xs text-gray-500 mt-1">
                {quantity} {selectedType.unit} × {selectedType.rate} kr = <strong>{calculatedAmount.toLocaleString('sv-SE')} kr</strong>
              </p>
            )}
          </div>

          {/* Mileage fields */}
          {isMileage && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-500 mb-2 block">Från</label>
                <input
                  type="text"
                  value={fromAddress}
                  onChange={e => setFromAddress(e.target.value)}
                  placeholder="Startadress"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/50"
                />
              </div>
              <div>
                <label className="text-sm text-gray-500 mb-2 block">Till</label>
                <input
                  type="text"
                  value={toAddress}
                  onChange={e => setToAddress(e.target.value)}
                  placeholder="Slutadress"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/50"
                />
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Kommentar (valfritt)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Valfri kommentar..."
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/50"
            />
          </div>

          {/* Billable toggle */}
          <button
            type="button"
            onClick={() => setBillable(v => !v)}
            className="flex items-center gap-3 w-full text-left"
          >
            <div className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${billable ? 'bg-primary-700' : 'bg-gray-300'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${billable ? 'left-[18px]' : 'left-0.5'}`} />
            </div>
            <span className="text-sm text-gray-700">Debiterbar till kund</span>
          </button>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200">
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !typeId || !quantity}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Spara
          </button>
        </div>
      </div>
    </div>
  )
}

// --- New Type Modal ---

function NewTypeModal({ onClose, onSaved }: {
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState('fixed')
  const [rate, setRate] = useState('')
  const [unit, setUnit] = useState('st')
  const [isTaxable, setIsTaxable] = useState(true)
  const [billable, setBillable] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !rate) return
    setSaving(true)
    try {
      const res = await fetch('/api/allowance-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type,
          rate: parseFloat(rate),
          unit,
          is_taxable: isTaxable,
          billable_to_customer: billable,
        })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error')
      }
      onSaved()
    } catch (err: any) {
      alert(err.message || 'Kunde inte skapa typ')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Ny ersättningstyp</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Namn *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="T.ex. Reseersättning"
              autoFocus
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Typ</label>
              <select
                value={type}
                onChange={e => {
                  setType(e.target.value)
                  if (e.target.value === 'mileage') setUnit('km')
                  else if (e.target.value === 'daily') setUnit('dag')
                  else if (e.target.value === 'hourly') setUnit('tim')
                  else setUnit('st')
                }}
                className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-600/50"
              >
                <option value="mileage">Milersättning</option>
                <option value="daily">Dagersättning</option>
                <option value="hourly">Timtillägg</option>
                <option value="fixed">Fast belopp</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Enhet</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-600/50"
              >
                <option value="km">km</option>
                <option value="dag">dag</option>
                <option value="tim">tim</option>
                <option value="st">st</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-2 block">Sats (kr per enhet) *</label>
            <input
              type="number"
              value={rate}
              onChange={e => setRate(e.target.value)}
              placeholder="0"
              min="0"
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/50"
            />
          </div>

          <div className="space-y-3">
            <button type="button" onClick={() => setIsTaxable(v => !v)} className="flex items-center gap-3 w-full text-left">
              <div className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${isTaxable ? 'bg-primary-700' : 'bg-gray-300'}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${isTaxable ? 'left-[18px]' : 'left-0.5'}`} />
              </div>
              <span className="text-sm text-gray-700">Skattepliktig</span>
            </button>
            <button type="button" onClick={() => setBillable(v => !v)} className="flex items-center gap-3 w-full text-left">
              <div className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${billable ? 'bg-primary-700' : 'bg-gray-300'}`}>
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${billable ? 'left-[18px]' : 'left-0.5'}`} />
              </div>
              <span className="text-sm text-gray-700">Debiterbar till kund som standard</span>
            </button>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200">
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !rate}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Skapa
          </button>
        </div>
      </div>
    </div>
  )
}
