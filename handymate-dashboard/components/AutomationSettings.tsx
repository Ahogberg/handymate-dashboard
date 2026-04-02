'use client'

import { useState, useEffect } from 'react'

interface SettingsData {
  work_days: string[]
  work_start: string
  work_end: string
  night_mode_enabled: boolean
  night_queue_messages: boolean
  min_job_value_sek: number
  max_distance_km: number | null
  auto_reject_below_minimum: boolean
  require_approval_send_quote: boolean
  require_approval_send_invoice: boolean
  require_approval_send_sms: boolean
  require_approval_create_booking: boolean
  lead_response_target_minutes: number
  quote_followup_days: number
  invoice_reminder_days: number
}

const DAY_OPTIONS = [
  { value: 'mon', label: 'Mån' },
  { value: 'tue', label: 'Tis' },
  { value: 'wed', label: 'Ons' },
  { value: 'thu', label: 'Tor' },
  { value: 'fri', label: 'Fre' },
  { value: 'sat', label: 'Lör' },
  { value: 'sun', label: 'Sön' },
]

export default function AutomationSettings() {
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/automation/settings')
      .then(res => res.json())
      .then(data => {
        setSettings(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/automation/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        const data = await res.json()
        setSettings(data)
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch {
      // error
    }
    setSaving(false)
  }

  const toggleDay = (day: string) => {
    if (!settings) return
    const days = settings.work_days.includes(day)
      ? settings.work_days.filter(d => d !== day)
      : [...settings.work_days, day]
    setSettings({ ...settings, work_days: days })
  }

  if (loading) {
    return <div className="p-6 text-gray-500">Laddar inställningar...</div>
  }

  if (!settings) {
    return <div className="p-6 text-red-500">Kunde inte ladda inställningar</div>
  }

  return (
    <div className="space-y-6">
      {/* Arbetstider */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Arbetstider</h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-600 mb-2 block">Arbetsdagar</label>
            <div className="flex gap-2 flex-wrap">
              {DAY_OPTIONS.map(day => (
                <button
                  key={day.value}
                  onClick={() => toggleDay(day.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    settings.work_days.includes(day.value)
                      ? 'bg-primary-100 text-primary-800 border border-primary-300'
                      : 'bg-gray-100 text-gray-500 border border-gray-200'
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Starttid</label>
              <input
                type="time"
                value={settings.work_start}
                onChange={e => setSettings({ ...settings, work_start: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">Sluttid</label>
              <input
                type="time"
                value={settings.work_end}
                onChange={e => setSettings({ ...settings, work_end: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Nattspärr */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold text-gray-900">Nattspärr</h3>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.night_mode_enabled}
              onChange={e => setSettings({ ...settings, night_mode_enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-700"></div>
          </label>
        </div>
        <p className="text-sm text-gray-500">
          Blockerar SMS och e-post mellan 21:00 och 07:00. Meddelanden köas och skickas nästa morgon.
        </p>
      </div>

      {/* Jobbregler */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Jobbregler</h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-600 mb-1 block">Minsta jobbvärde (kr)</label>
            <input
              type="number"
              value={settings.min_job_value_sek}
              onChange={e => setSettings({ ...settings, min_job_value_sek: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 mb-1 block">Max avstånd (km)</label>
            <input
              type="number"
              value={settings.max_distance_km || ''}
              placeholder="Obegränsat"
              onChange={e => setSettings({ ...settings, max_distance_km: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Avvisa automatiskt under minimivärde</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.auto_reject_below_minimum}
                onChange={e => setSettings({ ...settings, auto_reject_below_minimum: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-700"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Godkännande */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Godkännandekrav</h3>
        <div className="space-y-3">
          {[
            { key: 'require_approval_send_quote' as const, label: 'Skicka offert' },
            { key: 'require_approval_send_invoice' as const, label: 'Skicka faktura' },
            { key: 'require_approval_send_sms' as const, label: 'Skicka SMS' },
            { key: 'require_approval_create_booking' as const, label: 'Skapa bokning' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between">
              <span className="text-sm text-gray-700">{item.label}</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings[item.key]}
                  onChange={e => setSettings({ ...settings, [item.key]: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-700"></div>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Responstider */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Responstider</h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-600 mb-1 block">Lead-svarstid (minuter)</label>
            <input
              type="number"
              value={settings.lead_response_target_minutes}
              onChange={e => setSettings({ ...settings, lead_response_target_minutes: parseInt(e.target.value) || 30 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 mb-1 block">Offertuppföljning (dagar)</label>
            <input
              type="number"
              value={settings.quote_followup_days}
              onChange={e => setSettings({ ...settings, quote_followup_days: parseInt(e.target.value) || 5 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 mb-1 block">Fakturapåminnelse (dagar)</label>
            <input
              type="number"
              value={settings.invoice_reminder_days}
              onChange={e => setSettings({ ...settings, invoice_reminder_days: parseInt(e.target.value) || 7 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      {/* Spara-knapp */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-primary-700 text-white rounded-lg font-medium hover:bg-primary-800 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Sparar...' : 'Spara inställningar'}
        </button>
        {saved && (
          <span className="text-sm text-primary-700 font-medium">Sparat!</span>
        )}
      </div>
    </div>
  )
}
