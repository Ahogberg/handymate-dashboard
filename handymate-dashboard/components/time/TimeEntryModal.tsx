'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

interface TimeEntryModalProps {
  show: boolean
  onClose: () => void
  editing: boolean
  formData: {
    customer_id: string
    booking_id: string
    work_type_id: string
    project_id: string
    work_category: string
    description: string
    work_date: string
    start_time: string
    end_time: string
    duration_hours: number
    duration_minutes: number
    break_minutes: number
    hourly_rate: string
    is_billable: boolean
  }
  setFormData: (fn: (prev: any) => any) => void
  customers: { customer_id: string; name: string }[]
  bookings: { booking_id: string; notes: string; customer_id: string; customer?: { name: string } }[]
  projects: { project_id: string; name: string; customer_id: string | null }[]
  workTypes: { work_type_id: string; name: string; multiplier: number; billable_default: boolean }[]
  teamMembers: { id: string; name: string; color: string }[]
  isOwnerOrAdmin: boolean
  formPersonId: string
  setFormPersonId: (id: string) => void
  currentUserId?: string
  saving: boolean
  onSave: () => void
  onBookingChange: (id: string) => void
  onWorkTypeChange: (id: string) => void
}

const WORK_CATEGORIES = [
  { value: 'work', label: 'Arbete' },
  { value: 'travel', label: 'Restid' },
  { value: 'material_pickup', label: 'Material' },
  { value: 'meeting', label: 'Möte' },
  { value: 'admin', label: 'Admin' },
]

const QUICK_BUTTONS = [
  { label: '1h', hours: 1 },
  { label: '2h', hours: 2 },
  { label: '4h', hours: 4 },
  { label: '8h', hours: 8 },
]

function addHoursToTime(time: string, hours: number): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const totalM = h * 60 + m + hours * 60
  const nh = Math.floor(totalM / 60) % 24
  const nm = totalM % 60
  return `${nh.toString().padStart(2, '0')}:${nm.toString().padStart(2, '0')}`
}

function computeDuration(start: string, end: string): { hours: number; minutes: number } {
  if (!start || !end) return { hours: 0, minutes: 0 }
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const diff = (eh * 60 + em) - (sh * 60 + sm)
  if (diff <= 0) return { hours: 0, minutes: 0 }
  return { hours: Math.floor(diff / 60), minutes: diff % 60 }
}

export default function TimeEntryModal({
  show, onClose, editing, formData, setFormData,
  customers, bookings, projects, workTypes, teamMembers,
  isOwnerOrAdmin, formPersonId, setFormPersonId, currentUserId,
  saving, onSave, onBookingChange, onWorkTypeChange,
}: TimeEntryModalProps) {
  const [showMore, setShowMore] = useState(false)
  const [activeQuick, setActiveQuick] = useState<string | null>(null)

  if (!show) return null

  const inputClass = 'w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]'
  const labelClass = 'block text-[12px] text-[#64748B] mb-[5px]'

  const handleQuickButton = (hours: number, label: string) => {
    const startTime = formData.start_time || '08:00'
    const endTime = addHoursToTime(startTime, hours)
    const dur = computeDuration(startTime, endTime)
    setFormData((prev: any) => ({
      ...prev,
      start_time: startTime,
      end_time: endTime,
      duration_hours: dur.hours,
      duration_minutes: dur.minutes,
      break_minutes: 0,
    }))
    setActiveQuick(label)
  }

  const handleHeldag = () => {
    setFormData((prev: any) => ({
      ...prev,
      start_time: '07:00',
      end_time: '16:00',
      duration_hours: 9,
      duration_minutes: 0,
      break_minutes: 0,
    }))
    setActiveQuick('Heldag')
  }

  const handleStartChange = (val: string) => {
    setFormData((prev: any) => {
      const updated = { ...prev, start_time: val }
      if (val && prev.end_time) {
        const dur = computeDuration(val, prev.end_time)
        updated.duration_hours = dur.hours
        updated.duration_minutes = dur.minutes
      }
      return updated
    })
    setActiveQuick(null)
  }

  const handleEndChange = (val: string) => {
    setFormData((prev: any) => {
      const updated = { ...prev, end_time: val }
      if (prev.start_time && val) {
        const dur = computeDuration(prev.start_time, val)
        updated.duration_hours = dur.hours
        updated.duration_minutes = dur.minutes
      }
      return updated
    })
    setActiveQuick(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
      <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-7 w-full max-w-[460px] max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-[16px] font-medium text-[#1E293B]">
            {editing ? 'Redigera tidpost' : 'Registrera tid'}
          </span>
          <button
            onClick={onClose}
            className="w-7 h-7 border-thin border-[#E2E8F0] rounded-md bg-transparent text-[#94A3B8] flex items-center justify-center text-[16px] cursor-pointer hover:text-[#1E293B]"
          >
            ×
          </button>
        </div>

        {/* Registrera för (admin only) */}
        {isOwnerOrAdmin && teamMembers.length > 1 && (
          <div className="mb-4">
            <label className={labelClass}>Registrera för</label>
            <select
              value={formPersonId}
              onChange={e => setFormPersonId(e.target.value)}
              className={inputClass}
            >
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name}{m.id === currentUserId ? ' (dig)' : ''}</option>
              ))}
            </select>
          </div>
        )}

        {/* Projekt + Datum */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className={labelClass}>Projekt</label>
            <select
              value={formData.project_id}
              onChange={e => {
                const projId = e.target.value
                const proj = projects.find(p => p.project_id === projId)
                setFormData((prev: any) => ({
                  ...prev,
                  project_id: projId,
                  customer_id: proj?.customer_id || prev.customer_id,
                }))
              }}
              className={inputClass}
            >
              <option value="">Välj projekt...</option>
              {projects.map(p => (
                <option key={p.project_id} value={p.project_id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Datum</label>
            <input
              type="date"
              value={formData.work_date}
              onChange={e => setFormData((prev: any) => ({ ...prev, work_date: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>

        {/* Tid — Start → Slut */}
        <div className="mb-4">
          <label className={labelClass}>Tid</label>
          <div className="grid grid-cols-[1fr_24px_1fr] gap-2 items-center">
            <input
              type="text"
              value={formData.start_time}
              onChange={e => handleStartChange(e.target.value)}
              placeholder="08:00"
              className={`${inputClass} text-center`}
            />
            <div className="text-center text-[16px] text-[#CBD5E1]">→</div>
            <input
              type="text"
              value={formData.end_time}
              onChange={e => handleEndChange(e.target.value)}
              placeholder="16:00"
              className={`${inputClass} text-center`}
            />
          </div>
          <div className="flex gap-[6px] mt-2">
            {QUICK_BUTTONS.map(qb => (
              <button
                key={qb.label}
                onClick={() => handleQuickButton(qb.hours, qb.label)}
                className={`px-[14px] py-[5px] text-[12px] border-thin rounded-full cursor-pointer ${
                  activeQuick === qb.label
                    ? 'bg-[#0F766E] text-white border-[#0F766E]'
                    : 'bg-transparent text-[#64748B] border-[#E2E8F0] hover:border-[#0F766E] hover:text-[#0F766E]'
                }`}
              >
                {qb.label}
              </button>
            ))}
            <button
              onClick={handleHeldag}
              className={`px-[14px] py-[5px] text-[12px] border-thin rounded-full cursor-pointer ${
                activeQuick === 'Heldag'
                  ? 'bg-[#0F766E] text-white border-[#0F766E]'
                  : 'bg-transparent text-[#64748B] border-[#E2E8F0] hover:border-[#0F766E] hover:text-[#0F766E]'
              }`}
            >
              Heldag
            </button>
          </div>
          <div className="text-[11px] text-[#94A3B8] mt-[6px]">Quick-buttons fyller i sluttid automatiskt utifrån starttid</div>
        </div>

        {/* Typ */}
        <div className="mb-4">
          <label className={labelClass}>Typ</label>
          <select
            value={formData.work_category}
            onChange={e => setFormData((prev: any) => ({
              ...prev,
              work_category: e.target.value,
              is_billable: e.target.value === 'work',
            }))}
            className={inputClass}
          >
            {WORK_CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>

        {/* Beskrivning */}
        <div className="mb-4">
          <label className={labelClass}>
            Beskrivning <span className="text-[11px] text-[#CBD5E1]">(valfri)</span>
          </label>
          <textarea
            value={formData.description}
            onChange={e => setFormData((prev: any) => ({ ...prev, description: e.target.value }))}
            placeholder="Vad har du gjort? T.ex. ”Demonterat kakel i badrum, började bila”"
            rows={3}
            className={`${inputClass} resize-y min-h-[72px] leading-relaxed`}
          />
          <p className="text-[11px] text-[#94A3B8] mt-1">
            Visas på fakturarad om tiden faktureras till kund — håll det neutralt och beskrivande.
          </p>
        </div>

        {/* Fakturerbar */}
        <div className="mb-0">
          <label className={labelClass}>Fakturerbar tid</label>
          <select
            value={formData.is_billable ? 'yes' : 'no'}
            onChange={e => setFormData((prev: any) => ({ ...prev, is_billable: e.target.value === 'yes' }))}
            className={inputClass}
          >
            <option value="yes">Ja — faktureras kunden</option>
            <option value="no">Nej — intern tid</option>
          </select>
        </div>

        {/* Fler fält (expandable) */}
        <div className="mt-3">
          <button
            onClick={() => setShowMore(!showMore)}
            className="text-[12px] text-[#94A3B8] hover:text-[#64748B] cursor-pointer bg-transparent border-none"
          >
            {showMore ? 'Färre fält ▲' : 'Fler fält ▼'}
          </button>

          {showMore && (
            <div className="mt-3 space-y-3">
              {bookings.length > 0 && (
                <div>
                  <label className={labelClass}>Bokning</label>
                  <select
                    value={formData.booking_id}
                    onChange={e => onBookingChange(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Välj bokning...</option>
                    {bookings.map(b => (
                      <option key={b.booking_id} value={b.booking_id}>
                        {b.customer?.name || 'Okänd'} - {b.notes?.substring(0, 30) || 'Ingen beskrivning'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className={labelClass}>Kund</label>
                <select
                  value={formData.customer_id}
                  onChange={e => setFormData((prev: any) => ({ ...prev, customer_id: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">Välj kund...</option>
                  {customers.map(c => (
                    <option key={c.customer_id} value={c.customer_id}>{c.name}</option>
                  ))}
                </select>
                {formData.project_id && formData.customer_id && (
                  <p className="text-[11px] text-[#94A3B8] mt-1">Satt automatiskt från projekt</p>
                )}
              </div>

              {workTypes.length > 0 && (
                <div>
                  <label className={labelClass}>Arbetstyp (multiplikator)</label>
                  <select
                    value={formData.work_type_id}
                    onChange={e => onWorkTypeChange(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Normal</option>
                    {workTypes.map(wt => (
                      <option key={wt.work_type_id} value={wt.work_type_id}>
                        {wt.name} ({wt.multiplier}x)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className={labelClass}>Timpris</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={formData.hourly_rate}
                    onChange={e => setFormData((prev: any) => ({ ...prev, hourly_rate: e.target.value }))}
                    placeholder="Standard"
                    className={inputClass}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[#94A3B8]">kr/tim</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 mt-6 pt-5 border-t border-thin border-[#E2E8F0]">
          <button
            onClick={onClose}
            className="px-4 py-[10px] bg-transparent text-[#64748B] border-thin border-[#E2E8F0] rounded-lg text-[13px] cursor-pointer hover:text-[#1E293B]"
          >
            Avbryt
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex-1 py-[11px] bg-[#0F766E] text-white border-none rounded-lg text-[14px] font-medium cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {editing ? 'Spara' : 'Spara'}
          </button>
        </div>

      </div>
    </div>
  )
}
