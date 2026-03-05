'use client'

import { useState, useCallback } from 'react'
import { ArrowRight, ArrowLeft, Loader2, Calendar, Mail, Upload, FileSpreadsheet, Check, Clock } from 'lucide-react'
import { DAYS, TIME_OPTIONS, DEFAULT_WORKING_HOURS } from '../constants'
import { parseCSV, autoDetectMapping, prepareCustomerRows } from '@/lib/csv-parser'
import type { StepProps, WorkingHours } from '../types'

export default function Step4Connections({ data, onNext, onBack, onUpdate, saving }: StepProps) {
  const [googleConnected, setGoogleConnected] = useState(data.google_connected || false)
  const [gmailEnabled, setGmailEnabled] = useState(data.gmail_enabled || false)
  const [workingHours, setWorkingHours] = useState<WorkingHours>(
    (data.working_hours as WorkingHours) || DEFAULT_WORKING_HOURS
  )
  const [hoursExpanded, setHoursExpanded] = useState(false)

  // CSV state
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvParsed, setCsvParsed] = useState<{ name: string; phone_number: string }[]>([])
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResult, setCsvResult] = useState<{ success: number; failed: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleGoogleConnect = () => {
    // Redirect to Google OAuth with return URL to onboarding
    window.location.href = '/api/google/connect?redirect=/onboarding'
  }

  const handleCsvFile = useCallback((file: File) => {
    setCsvFile(file)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { headers, rows } = parseCSV(text)
      const mapping = autoDetectMapping(headers)
      const prepared = prepareCustomerRows(rows, mapping)
      setCsvParsed(prepared)
    }
    reader.readAsText(file, 'UTF-8')
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.txt'))) {
      handleCsvFile(file)
    }
  }, [handleCsvFile])

  const handleImport = async () => {
    if (csvParsed.length === 0) return
    setCsvImporting(true)
    try {
      const res = await fetch('/api/customers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customers: csvParsed }),
      })
      const result = await res.json()
      setCsvResult({ success: result.success || 0, failed: result.failed || 0 })
    } catch {
      setCsvResult({ success: 0, failed: csvParsed.length })
    }
    setCsvImporting(false)
  }

  const saveHours = async () => {
    await fetch('/api/onboarding/hours', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        businessId: data.business_id,
        working_hours: workingHours,
      }),
    }).catch(() => {})
  }

  const handleNext = async () => {
    await saveHours()
    onUpdate({ working_hours: workingHours })
    onNext()
  }

  const activeDays = DAYS.filter(d => workingHours[d.key]?.active)
  const hoursSummary = activeDays.length === 0 ? 'Inga öppettider' :
    activeDays.length >= 5 && DAYS.slice(0, 5).every(d => workingHours[d.key]?.active)
      ? `Mån-Fre ${workingHours.monday?.start || '08:00'}–${workingHours.monday?.end || '17:00'}`
      : `${activeDays.length} dagar/vecka`

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white">Kopplingar</h1>
        <p className="text-zinc-400 mt-2">Steg 4 av 7 — Integreringar, öppettider & kundimport</p>
      </div>

      {/* Google Calendar / Gmail */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Calendar className="w-5 h-5 text-teal-400" />
          Google Calendar & Gmail
        </h2>

        {googleConnected ? (
          <div className="flex items-center gap-2 text-emerald-400">
            <Check className="w-5 h-5" />
            <span>Google Calendar kopplad!</span>
          </div>
        ) : (
          <div>
            <p className="text-sm text-zinc-400 mb-3">
              Koppla Google Calendar för att synka bokningar och Gmail för att importera kundkommunikation.
            </p>
            <button
              onClick={handleGoogleConnect}
              className="px-4 py-2.5 bg-white text-gray-800 rounded-lg font-medium hover:bg-gray-100 flex items-center gap-2"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Koppla Google
            </button>
          </div>
        )}

        {googleConnected && (
          <label className="flex items-center gap-3 cursor-pointer pt-2 border-t border-zinc-800">
            <div className={`w-10 h-6 rounded-full transition-colors relative ${gmailEnabled ? 'bg-teal-600' : 'bg-zinc-700'}`}
                 onClick={() => setGmailEnabled(!gmailEnabled)}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${gmailEnabled ? 'left-[18px]' : 'left-0.5'}`} />
            </div>
            <div>
              <span className="text-sm text-white flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Gmail-synk</span>
              <span className="text-xs text-zinc-500">Importera e-post till kundtidslinjen</span>
            </div>
          </label>
        )}
      </div>

      {/* Working Hours */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
        <button
          onClick={() => setHoursExpanded(!hoursExpanded)}
          className="w-full flex items-center justify-between"
        >
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-teal-400" />
            Öppettider
          </h2>
          <span className="text-sm text-zinc-400">{hoursSummary}</span>
        </button>

        {hoursExpanded && (
          <div className="space-y-2 pt-2 border-t border-zinc-800">
            {DAYS.map((day) => {
              const dayHours = workingHours[day.key] || { active: false, start: '08:00', end: '17:00' }
              return (
                <div key={day.key} className="flex items-center gap-3">
                  <label className="flex items-center gap-2 w-24 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dayHours.active}
                      onChange={(e) => setWorkingHours(prev => ({
                        ...prev,
                        [day.key]: { ...prev[day.key], active: e.target.checked }
                      }))}
                      className="rounded border-zinc-700 bg-zinc-800 text-teal-500 focus:ring-teal-500"
                    />
                    <span className={`text-sm ${dayHours.active ? 'text-white' : 'text-zinc-500'}`}>{day.short}</span>
                  </label>
                  {dayHours.active && (
                    <>
                      <select
                        value={dayHours.start}
                        onChange={(e) => setWorkingHours(prev => ({
                          ...prev,
                          [day.key]: { ...prev[day.key], start: e.target.value }
                        }))}
                        className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-teal-500"
                      >
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <span className="text-zinc-500">—</span>
                      <select
                        value={dayHours.end}
                        onChange={(e) => setWorkingHours(prev => ({
                          ...prev,
                          [day.key]: { ...prev[day.key], end: e.target.value }
                        }))}
                        className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-teal-500"
                      >
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* CSV Import */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Upload className="w-5 h-5 text-teal-400" />
          Importera kunder (valfritt)
        </h2>
        <p className="text-sm text-zinc-400">Ladda upp en CSV-fil med dina befintliga kunder.</p>

        {csvResult ? (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-center">
            <Check className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
            <p className="text-emerald-400">{csvResult.success} kunder importerade</p>
            {csvResult.failed > 0 && <p className="text-sm text-zinc-400">{csvResult.failed} kunde inte importeras</p>}
          </div>
        ) : csvParsed.length > 0 ? (
          <div className="space-y-3">
            <div className="bg-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm text-zinc-300 mb-2">
                <FileSpreadsheet className="w-4 h-4" />
                {csvFile?.name} — {csvParsed.length} kunder hittade
              </div>
              <div className="max-h-32 overflow-y-auto text-xs text-zinc-400 space-y-1">
                {csvParsed.slice(0, 5).map((row, i) => (
                  <div key={i}>{row.name} {row.phone_number && `(${row.phone_number})`}</div>
                ))}
                {csvParsed.length > 5 && <div className="text-zinc-500">...och {csvParsed.length - 5} till</div>}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setCsvFile(null); setCsvParsed([]) }}
                className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-400 hover:text-white"
              >
                Avbryt
              </button>
              <button
                onClick={handleImport}
                disabled={csvImporting}
                className="flex-1 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {csvImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : `Importera ${csvParsed.length} kunder`}
              </button>
            </div>
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragOver ? 'border-teal-500 bg-teal-500/5' : 'border-zinc-700 hover:border-zinc-600'
            }`}
          >
            <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
            <p className="text-sm text-zinc-400">Dra och släpp en CSV-fil här</p>
            <p className="text-xs text-zinc-500 mt-1">eller</p>
            <label className="inline-block mt-2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:text-white cursor-pointer">
              Välj fil
              <input
                type="file"
                accept=".csv,.txt"
                onChange={(e) => e.target.files?.[0] && handleCsvFile(e.target.files[0])}
                className="hidden"
              />
            </label>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {onBack && (
          <button onClick={onBack} className="px-6 py-3 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-xl hover:bg-zinc-700 flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Tillbaka
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={saving}
          className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Fortsätt <ArrowRight className="w-5 h-5" /></>}
        </button>
      </div>
    </div>
  )
}
