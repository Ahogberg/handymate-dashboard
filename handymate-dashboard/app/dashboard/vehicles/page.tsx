'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Car, Plus, ChevronLeft, ChevronRight, MapPin, Clock,
  Calendar, Edit2, Trash2, X, ExternalLink, Search,
  DollarSign, Loader2, AlertTriangle,
} from 'lucide-react'

// ── Types ──

interface Vehicle {
  id: string
  name: string
  reg_number: string | null
  billing_type: 'km' | 'mil' | 'hour' | 'day'
  rate: number
  is_active: boolean
}

interface VehicleReport {
  id: string
  vehicle_id: string
  project_id: string | null
  report_date: string
  start_address: string | null
  end_address: string | null
  distance: number | null
  distance_unit: string
  google_maps_url: string | null
  hours: number | null
  days: number | null
  amount: number | null
  billable: boolean
  invoiced: boolean
  notes: string | null
  vehicle?: { id: string; name: string; reg_number: string | null; billing_type: string; rate: number }
  project?: { project_id: string; name: string } | null
  business_user?: { id: string; name: string } | null
}

interface Project {
  project_id: string
  name: string
}

// ── Helpers ──

function getWeekDates(date: Date): { start: Date; end: Date; days: Date[] } {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  const start = new Date(d.setDate(diff))
  start.setHours(0, 0, 0, 0)
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const dd = new Date(start)
    dd.setDate(start.getDate() + i)
    days.push(dd)
  }
  const end = new Date(days[6])
  return { start, end, days }
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('sv-SE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function billingLabel(type: string): string {
  switch (type) {
    case 'km': return 'kr/km'
    case 'mil': return 'kr/mil'
    case 'hour': return 'kr/tim'
    case 'day': return 'kr/dag'
    default: return 'kr'
  }
}

function billingUnitLabel(type: string): string {
  switch (type) {
    case 'km': return 'km'
    case 'mil': return 'mil'
    case 'hour': return 'timmar'
    case 'day': return 'dagar'
    default: return ''
  }
}

// ── Main Page ──

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [reports, setReports] = useState<VehicleReport[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [weekDate, setWeekDate] = useState(new Date())
  const [selectedVehicle, setSelectedVehicle] = useState<string>('all')

  // Modal state
  const [showVehicleModal, setShowVehicleModal] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [showReportModal, setShowReportModal] = useState(false)
  const [editingReport, setEditingReport] = useState<VehicleReport | null>(null)
  const [showManageVehicles, setShowManageVehicles] = useState(false)

  const week = getWeekDates(weekDate)

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await fetch('/api/vehicles?show_inactive=true')
      const data = await res.json()
      setVehicles(data.vehicles || [])
    } catch (e) {
      console.error('Fetch vehicles error:', e)
    }
  }, [])

  const fetchReports = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        start_date: toDateStr(week.start),
        end_date: toDateStr(week.end),
      })
      if (selectedVehicle !== 'all') params.set('vehicle_id', selectedVehicle)

      const res = await fetch(`/api/vehicle-reports?${params}`)
      const data = await res.json()
      setReports(data.reports || [])
    } catch (e) {
      console.error('Fetch reports error:', e)
    }
  }, [week.start, week.end, selectedVehicle])

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects?status=active')
      const data = await res.json()
      setProjects(data.projects || [])
    } catch (e) {
      console.error('Fetch projects error:', e)
    }
  }, [])

  useEffect(() => {
    Promise.all([fetchVehicles(), fetchReports(), fetchProjects()]).then(() => setLoading(false))
  }, [fetchVehicles, fetchReports, fetchProjects])

  useEffect(() => {
    if (!loading) fetchReports()
  }, [weekDate, selectedVehicle])

  // Group reports by date
  const reportsByDate: Record<string, VehicleReport[]> = {}
  for (const r of reports) {
    if (!reportsByDate[r.report_date]) reportsByDate[r.report_date] = []
    reportsByDate[r.report_date].push(r)
  }

  // Weekly totals
  const weekTotalKm = reports.reduce((sum, r) => sum + (r.distance || 0), 0)
  const weekTotalAmount = reports.reduce((sum, r) => sum + (r.amount || 0), 0)
  const weekBillableAmount = reports.filter(r => r.billable).reduce((sum, r) => sum + (r.amount || 0), 0)

  const activeVehicles = vehicles.filter(v => v.is_active)

  const prevWeek = () => {
    const d = new Date(weekDate)
    d.setDate(d.getDate() - 7)
    setWeekDate(d)
  }
  const nextWeek = () => {
    const d = new Date(weekDate)
    d.setDate(d.getDate() + 7)
    setWeekDate(d)
  }
  const goToday = () => setWeekDate(new Date())

  const handleDeleteReport = async (reportId: string) => {
    if (!confirm('Ta bort denna körrapport?')) return
    try {
      await fetch('/api/vehicle-reports', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: reportId }),
      })
      setReports(prev => prev.filter(r => r.id !== reportId))
    } catch (e) {
      console.error('Delete report error:', e)
    }
  }

  const weekLabel = `${week.start.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} – ${week.end.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}`

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary-700" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Car className="w-5 h-5 text-primary-700" />
            Fordon
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Körrapporter och fordonskostnader</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowManageVehicles(true)}
            className="px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Hantera fordon
          </button>
          <button
            onClick={() => { setEditingReport(null); setShowReportModal(true) }}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800"
          >
            <Plus className="w-4 h-4" />
            Ny rapport
          </button>
        </div>
      </div>

      {/* Week nav + filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gray-900 min-w-[180px] text-center">{weekLabel}</span>
          <button onClick={nextWeek} className="p-1.5 rounded-lg hover:bg-gray-100">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={goToday} className="px-2.5 py-1 text-xs border border-[#E2E8F0] rounded-md text-gray-600 hover:bg-gray-50 ml-1">
            Idag
          </button>
        </div>

        <select
          value={selectedVehicle}
          onChange={e => setSelectedVehicle(e.target.value)}
          className="px-3 py-1.5 text-sm border border-[#E2E8F0] rounded-lg bg-white text-gray-700"
        >
          <option value="all">Alla fordon</option>
          {activeVehicles.map(v => (
            <option key={v.id} value={v.id}>{v.name}{v.reg_number ? ` (${v.reg_number})` : ''}</option>
          ))}
        </select>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-[#E2E8F0] rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500">Sträcka</p>
          <p className="text-lg font-bold text-gray-900">{weekTotalKm.toLocaleString('sv-SE')} km</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500">Totalt</p>
          <p className="text-lg font-bold text-gray-900">{weekTotalAmount.toLocaleString('sv-SE', { minimumFractionDigits: 0 })} kr</p>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-xl px-4 py-3">
          <p className="text-xs text-gray-500">Fakturerbart</p>
          <p className="text-lg font-bold text-primary-700">{weekBillableAmount.toLocaleString('sv-SE', { minimumFractionDigits: 0 })} kr</p>
        </div>
      </div>

      {/* Day-by-day reports */}
      {week.days.map(day => {
        const dateStr = toDateStr(day)
        const dayReports = reportsByDate[dateStr] || []
        const isToday = toDateStr(new Date()) === dateStr

        return (
          <div key={dateStr} className="mb-4">
            <div className={`flex items-center gap-2 mb-2 px-1 ${isToday ? 'text-primary-700' : 'text-gray-500'}`}>
              <Calendar className="w-3.5 h-3.5" />
              <span className="text-xs font-medium uppercase tracking-wide">
                {day.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              {isToday && <span className="text-[10px] bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full font-medium">Idag</span>}
            </div>

            {dayReports.length === 0 ? (
              <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl px-4 py-3 text-xs text-gray-400 text-center">
                Inga rapporter
              </div>
            ) : (
              <div className="space-y-2">
                {dayReports.map(r => (
                  <div key={r.id} className="bg-white border border-[#E2E8F0] rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Car className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900">
                            {r.vehicle?.name || 'Okänt fordon'}
                          </span>
                          {r.vehicle?.reg_number && (
                            <span className="text-xs text-gray-400">{r.vehicle.reg_number}</span>
                          )}
                          {r.project && (
                            <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">
                              {r.project.name}
                            </span>
                          )}
                        </div>

                        {r.start_address && r.end_address && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{r.start_address}</span>
                            <span className="text-gray-300">→</span>
                            <span className="truncate">{r.end_address}</span>
                            {r.google_maps_url && (
                              <a href={r.google_maps_url} target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:text-primary-700 flex-shrink-0">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          {r.distance != null && (
                            <span>{r.distance} {r.distance_unit || 'km'}</span>
                          )}
                          {r.hours != null && <span>{r.hours} tim</span>}
                          {r.days != null && <span>{r.days} dagar</span>}
                          {r.amount != null && (
                            <span className="font-medium text-gray-700">
                              {r.amount.toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr
                            </span>
                          )}
                          {r.billable && (
                            <span className="text-primary-700 font-medium">Fakturerbar</span>
                          )}
                          {r.invoiced && (
                            <span className="text-blue-600 font-medium">Fakturerad</span>
                          )}
                        </div>

                        {r.notes && (
                          <p className="text-xs text-gray-400 mt-1 italic">{r.notes}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        <button
                          onClick={() => { setEditingReport(r); setShowReportModal(true) }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteReport(r.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Empty state when no vehicles */}
      {activeVehicles.length === 0 && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-8 text-center mt-6">
          <Car className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h3 className="font-medium text-gray-900 mb-1">Inga fordon tillagda</h3>
          <p className="text-sm text-gray-500 mb-4">Lägg till ditt första fordon för att börja spåra körrapporter</p>
          <button
            onClick={() => { setEditingVehicle(null); setShowVehicleModal(true) }}
            className="px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800"
          >
            Lägg till fordon
          </button>
        </div>
      )}

      {/* Modals */}
      {showReportModal && (
        <ReportModal
          editing={editingReport}
          vehicles={activeVehicles}
          projects={projects}
          onClose={() => { setShowReportModal(false); setEditingReport(null) }}
          onSave={async (data) => {
            try {
              const isEditing = !!editingReport
              const res = await fetch('/api/vehicle-reports', {
                method: isEditing ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isEditing ? { id: editingReport.id, ...data } : data),
              })
              if (!res.ok) throw new Error('Misslyckades')
              setShowReportModal(false)
              setEditingReport(null)
              fetchReports()
            } catch (e) {
              console.error('Save report error:', e)
            }
          }}
        />
      )}

      {showManageVehicles && (
        <ManageVehiclesModal
          vehicles={vehicles}
          onClose={() => setShowManageVehicles(false)}
          onAdd={() => { setEditingVehicle(null); setShowVehicleModal(true) }}
          onEdit={(v) => { setEditingVehicle(v); setShowVehicleModal(true) }}
          onToggleActive={async (v) => {
            await fetch('/api/vehicles', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: v.id, is_active: !v.is_active }),
            })
            fetchVehicles()
          }}
          onDelete={async (v) => {
            if (!confirm(`Ta bort ${v.name}?`)) return
            await fetch('/api/vehicles', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: v.id }),
            })
            fetchVehicles()
          }}
        />
      )}

      {showVehicleModal && (
        <VehicleModal
          editing={editingVehicle}
          onClose={() => { setShowVehicleModal(false); setEditingVehicle(null) }}
          onSave={async (data) => {
            try {
              const isEditing = !!editingVehicle
              await fetch('/api/vehicles', {
                method: isEditing ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isEditing ? { id: editingVehicle.id, ...data } : data),
              })
              setShowVehicleModal(false)
              setEditingVehicle(null)
              fetchVehicles()
            } catch (e) {
              console.error('Save vehicle error:', e)
            }
          }}
        />
      )}
    </div>
  )
}

// ── Report Modal ──

function ReportModal({
  editing,
  vehicles,
  projects,
  onClose,
  onSave,
}: {
  editing: VehicleReport | null
  vehicles: Vehicle[]
  projects: Project[]
  onClose: () => void
  onSave: (data: any) => void
}) {
  const [vehicleId, setVehicleId] = useState(editing?.vehicle_id || vehicles[0]?.id || '')
  const [projectId, setProjectId] = useState(editing?.project_id || '')
  const [reportDate, setReportDate] = useState(editing?.report_date || new Date().toISOString().split('T')[0])
  const [reportType, setReportType] = useState<'distance' | 'hours' | 'days'>(
    editing?.hours ? 'hours' : editing?.days ? 'days' : 'distance'
  )
  const [startAddress, setStartAddress] = useState(editing?.start_address || '')
  const [endAddress, setEndAddress] = useState(editing?.end_address || '')
  const [distance, setDistance] = useState(editing?.distance?.toString() || '')
  const [distanceUnit, setDistanceUnit] = useState(editing?.distance_unit || 'km')
  const [hours, setHours] = useState(editing?.hours?.toString() || '')
  const [days, setDays] = useState(editing?.days?.toString() || '')
  const [billable, setBillable] = useState(editing?.billable ?? true)
  const [notes, setNotes] = useState(editing?.notes || '')
  const [googleMapsUrl, setGoogleMapsUrl] = useState(editing?.google_maps_url || '')
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectedVehicle = vehicles.find(v => v.id === vehicleId)
  const rate = selectedVehicle?.rate || 0

  // Calculate amount
  let amount = 0
  if (reportType === 'distance' && distance) {
    amount = parseFloat(distance) * rate
  } else if (reportType === 'hours' && hours) {
    amount = parseFloat(hours) * rate
  } else if (reportType === 'days' && days) {
    amount = parseFloat(days) * rate
  }

  const calculateDistance = async () => {
    if (!startAddress.trim() || !endAddress.trim()) return
    setCalculating(true)
    try {
      const res = await fetch('/api/vehicle-reports/calculate-distance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: startAddress, to: endAddress }),
      })
      const data = await res.json()
      if (data.distance_km != null) {
        setDistance(data.distance_km.toString())
        setDistanceUnit('km')
        if (data.google_maps_url) setGoogleMapsUrl(data.google_maps_url)
      } else if (data.manual) {
        alert('Automatisk avståndsberäkning är inte aktiverad. Fyll i avståndet manuellt.')
      } else {
        alert(data.error || 'Kunde inte beräkna avstånd')
      }
    } catch {
      alert('Fel vid avståndsberäkning')
    } finally {
      setCalculating(false)
    }
  }

  const handleSubmit = () => {
    if (!vehicleId) return
    setSaving(true)
    onSave({
      vehicle_id: vehicleId,
      project_id: projectId || null,
      report_date: reportDate,
      start_address: startAddress.trim() || null,
      end_address: endAddress.trim() || null,
      distance: reportType === 'distance' && distance ? parseFloat(distance) : null,
      distance_unit: distanceUnit,
      google_maps_url: googleMapsUrl || null,
      hours: reportType === 'hours' && hours ? parseFloat(hours) : null,
      days: reportType === 'days' && days ? parseFloat(days) : null,
      amount: Math.round(amount * 100) / 100,
      billable,
      notes: notes.trim() || null,
    })
  }

  const inputCls = 'w-full px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-primary-500'

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10 rounded-t-2xl">
          <h3 className="font-semibold text-gray-900">{editing ? 'Redigera rapport' : 'Ny körrapport'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Vehicle */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fordon</label>
            <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className={inputCls}>
              <option value="">Välj fordon...</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.name}{v.reg_number ? ` (${v.reg_number})` : ''} — {v.rate} {billingLabel(v.billing_type)}</option>
              ))}
            </select>
          </div>

          {/* Project */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Projekt (valfritt)</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputCls}>
              <option value="">Inget projekt</option>
              {projects.map(p => (
                <option key={p.project_id} value={p.project_id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Datum</label>
            <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className={inputCls} />
          </div>

          {/* Type toggle */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Typ</label>
            <div className="flex gap-2">
              {([['distance', 'Körsträcka'], ['hours', 'Timmar'], ['days', 'Dagar']] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setReportType(val)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    reportType === val
                      ? 'bg-primary-50 border-primary-300 text-primary-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Distance fields */}
          {reportType === 'distance' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Från</label>
                <input
                  type="text"
                  value={startAddress}
                  onChange={e => setStartAddress(e.target.value)}
                  placeholder="Storgatan 12, Stockholm"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Till</label>
                <input
                  type="text"
                  value={endAddress}
                  onChange={e => setEndAddress(e.target.value)}
                  placeholder="Solrosvägen 14, Uppsala"
                  className={inputCls}
                />
              </div>
              <button
                onClick={calculateDistance}
                disabled={calculating || !startAddress.trim() || !endAddress.trim()}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-[#E2E8F0] rounded-lg text-primary-700 hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                Beräkna med Google Maps
              </button>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Avstånd</label>
                  <input
                    type="number"
                    value={distance}
                    onChange={e => setDistance(e.target.value)}
                    placeholder="0"
                    step="0.1"
                    className={inputCls}
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Enhet</label>
                  <select value={distanceUnit} onChange={e => setDistanceUnit(e.target.value)} className={inputCls}>
                    <option value="km">km</option>
                    <option value="mil">mil</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Hours */}
          {reportType === 'hours' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Antal timmar</label>
              <input type="number" value={hours} onChange={e => setHours(e.target.value)} step="0.5" placeholder="0" className={inputCls} />
            </div>
          )}

          {/* Days */}
          {reportType === 'days' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Antal dagar</label>
              <input type="number" value={days} onChange={e => setDays(e.target.value)} step="0.5" placeholder="0" className={inputCls} />
            </div>
          )}

          {/* Billable */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={billable}
              onChange={e => setBillable(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-primary-700 focus:ring-primary-600"
            />
            <span className="text-sm text-gray-700">Fakturerbar</span>
          </label>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Anteckning (valfritt)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Valfri kommentar..." className={inputCls} />
          </div>

          {/* Amount preview */}
          {amount > 0 && (
            <div className="bg-primary-50 border border-[#E2E8F0] rounded-lg px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-primary-700">Beräknat belopp</span>
              <span className="text-lg font-bold text-primary-800">{amount.toLocaleString('sv-SE', { minimumFractionDigits: 2 })} kr</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Avbryt
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !vehicleId}
            className="px-4 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 disabled:opacity-50"
          >
            {saving ? 'Sparar...' : editing ? 'Uppdatera' : 'Spara rapport'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Manage Vehicles Modal ──

function ManageVehiclesModal({
  vehicles,
  onClose,
  onAdd,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  vehicles: Vehicle[]
  onClose: () => void
  onAdd: () => void
  onEdit: (v: Vehicle) => void
  onToggleActive: (v: Vehicle) => void
  onDelete: (v: Vehicle) => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-md max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10 rounded-t-2xl">
          <h3 className="font-semibold text-gray-900">Hantera fordon</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-2">
          {vehicles.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">Inga fordon tillagda</p>
          ) : (
            vehicles.map(v => (
              <div key={v.id} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${v.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                <div>
                  <p className="text-sm font-medium text-gray-900">{v.name}</p>
                  <p className="text-xs text-gray-500">
                    {v.reg_number || '–'} · {v.rate} {billingLabel(v.billing_type)}
                    {!v.is_active && ' · Inaktiv'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onToggleActive(v)}
                    className={`px-2 py-1 text-[10px] rounded-md border ${v.is_active ? 'border-gray-200 text-gray-500 hover:bg-gray-100' : 'border-primary-200 text-primary-700 hover:bg-primary-50'}`}
                  >
                    {v.is_active ? 'Inaktivera' : 'Aktivera'}
                  </button>
                  <button onClick={() => onEdit(v)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => onDelete(v)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-4 pb-4">
          <button
            onClick={onAdd}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-primary-300 hover:text-primary-700"
          >
            <Plus className="w-4 h-4" />
            Lägg till fordon
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Vehicle Modal ──

function VehicleModal({
  editing,
  onClose,
  onSave,
}: {
  editing: Vehicle | null
  onClose: () => void
  onSave: (data: any) => void
}) {
  const [name, setName] = useState(editing?.name || '')
  const [regNumber, setRegNumber] = useState(editing?.reg_number || '')
  const [billingType, setBillingType] = useState(editing?.billing_type || 'km')
  const [rate, setRate] = useState(editing?.rate?.toString() || '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = () => {
    if (!name.trim()) return
    setSaving(true)
    onSave({
      name: name.trim(),
      reg_number: regNumber.trim() || null,
      billing_type: billingType,
      rate: rate ? parseFloat(rate) : 0,
    })
  }

  const inputCls = 'w-full px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-primary-500'

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">{editing ? 'Redigera fordon' : 'Nytt fordon'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Namn *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Volvo V70" className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Registreringsnummer</label>
            <input type="text" value={regNumber} onChange={e => setRegNumber(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={7} className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Faktureringstyp</label>
            <select value={billingType} onChange={e => setBillingType(e.target.value as Vehicle['billing_type'])} className={inputCls}>
              <option value="km">Per kilometer</option>
              <option value="mil">Per mil</option>
              <option value="hour">Per timme</option>
              <option value="day">Per dag</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Pris ({billingLabel(billingType)})</label>
            <input type="number" value={rate} onChange={e => setRate(e.target.value)} step="0.5" placeholder="4.50" className={inputCls} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Avbryt
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim()}
            className="px-4 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 disabled:opacity-50"
          >
            {saving ? 'Sparar...' : editing ? 'Uppdatera' : 'Spara'}
          </button>
        </div>
      </div>
    </div>
  )
}
