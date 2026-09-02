'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { DIARY_WEATHER, WEATHER_EMOJI, WEATHER_LABELS } from '@/lib/diary/weather'
import { svDateStr } from '@/lib/dates'
import DiaryPhotoUploader, { type PendingPhoto } from './DiaryPhotoUploader'
import type { DiaryAtaOption, DiaryFormPayload, DiaryRow } from './types'

/**
 * Ny/redigera dagboksrad (Etapp E1, 2026-09-02). Ersätter LogModal i
 * projektsidan, som hade `hoursWorked`-state utan input och fyra av fem
 * väderval (D5 absorberat här: timmar-input `step=0.5` + 'windy').
 *
 * Bottom-sheet under 640 px — hantverkaren skriver dagboken på telefonen
 * på bygget, och en centrerad dialog med 90 vh-scroll är svår att träffa
 * med tummen. På desktop: vanlig centrerad dialog.
 *
 * Foton: befintliga tas bort direkt via DELETE …/photos (raden finns redan);
 * nya filer laddas upp EFTER att raden sparats — `onSave` returnerar id:t
 * så en ny rad kan få sina foton i samma flöde.
 */
export default function DiaryEntryModal({
  editing,
  projectId,
  atas,
  onClose,
  onSave,
  onSaved,
  onError,
}: {
  editing: DiaryRow | null
  projectId: string
  atas: DiaryAtaOption[]
  onClose: () => void
  /** Sparar raden (POST/PATCH) och returnerar dess id, eller null vid fel. */
  onSave: (payload: DiaryFormPayload) => Promise<string | null>
  onSaved: () => void
  onError: (msg: string) => void
}) {
  const [logDate, setLogDate] = useState(editing?.date || svDateStr(new Date()))
  const [weather, setWeather] = useState<string>(editing?.weather || '')
  const [temperature, setTemperature] = useState(editing?.temperature != null ? String(editing.temperature) : '')
  const [workDescription, setWorkDescription] = useState(editing?.work_performed || '')
  const [materialsUsed, setMaterialsUsed] = useState(editing?.materials_used || '')
  const [hoursWorked, setHoursWorked] = useState(editing?.hours_worked != null ? String(editing.hours_worked) : '')
  const [workersPresent, setWorkersPresent] = useState(editing?.workers_count != null ? String(editing.workers_count) : '')
  const [deviations, setDeviations] = useState(editing?.issues || '')
  const [notes, setNotes] = useState(editing?.description || '')
  const [ataChangeId, setAtaChangeId] = useState(editing?.ata_change_id || '')
  const [existingPhotos, setExistingPhotos] = useState(editing?.photos ?? [])
  const [pending, setPending] = useState<PendingPhoto[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showMore, setShowMore] = useState(Boolean(editing?.materials_used || editing?.description || editing?.workers_count))

  // Frigör object-URL:erna när modalen stängs — via ref, så cleanupen inte
  // körs vid varje ändring av listan och river URL:er som fortfarande visas.
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  useEffect(() => () => { pendingRef.current.forEach(p => URL.revokeObjectURL(p.previewUrl)) }, [])

  const ataOptions = useMemo(
    () => atas.filter(a => a.status !== 'rejected' && a.status !== 'declined'),
    [atas],
  )

  const kanSpara = workDescription.trim().length > 0 && !saving && !uploading

  const addFiles = (files: File[]) =>
    setPending(prev => [...prev, ...files.map(file => ({ file, previewUrl: URL.createObjectURL(file) }))])

  const removePending = (index: number) =>
    setPending(prev => {
      URL.revokeObjectURL(prev[index].previewUrl)
      return prev.filter((_, i) => i !== index)
    })

  const removeExisting = async (path: string) => {
    if (!editing) return
    const res = await fetch(`/api/projects/${projectId}/logs/${editing.id}/photos?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      onError(data.error || 'Kunde inte ta bort fotot')
      return
    }
    setExistingPhotos(prev => prev.filter(p => p.path !== path))
  }

  const uploadPending = async (logId: string): Promise<boolean> => {
    if (pending.length === 0) return true
    setUploading(true)
    let allaOk = true
    for (const p of pending) {
      const fd = new FormData()
      fd.append('file', p.file, p.file.name)
      const res = await fetch(`/api/projects/${projectId}/logs/${logId}/photos`, { method: 'POST', body: fd })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        onError(data.error || `Fotot ${p.file.name} kunde inte laddas upp`)
        allaOk = false
      }
    }
    setUploading(false)
    return allaOk
  }

  const handleSubmit = async () => {
    if (!kanSpara) return
    setSaving(true)
    const id = await onSave({
      log_date: logDate,
      weather: weather || null,
      temperature: temperature.trim() ? Math.round(Number(temperature)) : null,
      work_description: workDescription.trim(),
      materials_used: materialsUsed.trim() || null,
      hours_worked: hoursWorked.trim() ? Number(hoursWorked) : null,
      workers_present: workersPresent.trim() ? Math.round(Number(workersPresent)) : null,
      deviations: deviations.trim() || null,
      notes: notes.trim() || null,
      ata_change_id: ataChangeId || null,
    })
    if (!id) { setSaving(false); return }
    await uploadPending(id)
    setSaving(false)
    onSaved()
  }

  const inputCls = 'w-full px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-primary-400'
  const labelCls = 'text-xs text-gray-400 uppercase tracking-wider mb-1.5 block'

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg max-h-[92vh] sm:max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-xl border border-[#E2E8F0] shadow-xl">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-900">
            {editing ? 'Redigera dagboksrad' : 'Ny dagboksrad'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900" aria-label="Stäng">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Datum</label>
              <input type="date" value={logDate} max={svDateStr(new Date())} onChange={e => setLogDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Timmar</label>
              <input
                type="number"
                inputMode="decimal"
                step={0.5}
                min={0}
                max={24}
                value={hoursWorked}
                onChange={e => setHoursWorked(e.target.value)}
                placeholder="t.ex. 7,5"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Väder</label>
            <div className="grid grid-cols-5 gap-1.5">
              {DIARY_WEATHER.map(w => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWeather(weather === w ? '' : w)}
                  className={`flex flex-col items-center gap-0.5 py-2 rounded-lg border text-sm transition-all ${
                    weather === w
                      ? 'bg-primary-50 border-primary-400 text-primary-700 ring-1 ring-primary-400'
                      : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <span className="text-lg leading-none">{WEATHER_EMOJI[w]}</span>
                  <span className="text-[11px]">{WEATHER_LABELS[w]}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={temperature}
                onChange={e => setTemperature(e.target.value)}
                placeholder="°C"
                className={`${inputCls} w-24`}
                aria-label="Temperatur"
              />
              <span className="text-xs text-gray-400">°C, valfritt</span>
            </div>
          </div>

          <div>
            <label className={labelCls}>Vad gjordes *</label>
            <textarea
              value={workDescription}
              onChange={e => setWorkDescription(e.target.value)}
              rows={3}
              placeholder="Beskriv dagens arbete…"
              autoFocus
              className={`${inputCls} resize-none`}
            />
          </div>

          <div>
            <label className={labelCls}>Foton</label>
            <DiaryPhotoUploader
              existing={existingPhotos}
              pending={pending}
              uploading={uploading}
              onAddFiles={addFiles}
              onRemovePending={removePending}
              onRemoveExisting={removeExisting}
              onTooLarge={name => onError(`${name} är större än 10 MB`)}
            />
          </div>

          <div>
            <label className={labelCls}>Avvikelser</label>
            <textarea
              value={deviations}
              onChange={e => setDeviations(e.target.value)}
              rows={2}
              placeholder="Avvikelser från plan, hinder, väntetid…"
              className={`${inputCls} resize-none`}
            />
          </div>

          {ataOptions.length > 0 && (
            <div>
              <label className={labelCls}>Gäller ÄTA</label>
              <select value={ataChangeId} onChange={e => setAtaChangeId(e.target.value)} className={inputCls}>
                <option value="">Ingen koppling</option>
                {ataOptions.map(a => (
                  <option key={a.change_id} value={a.change_id}>
                    ÄTA {a.ata_number ? `#${a.ata_number}` : ''} · {a.description.slice(0, 60)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowMore(v => !v)}
            className="text-xs text-primary-700 hover:text-primary-800"
          >
            {showMore ? 'Dölj fler fält' : 'Fler fält (material, antal på plats, anteckning)'}
          </button>

          {showMore && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Material som användes</label>
                <textarea
                  value={materialsUsed}
                  onChange={e => setMaterialsUsed(e.target.value)}
                  rows={2}
                  placeholder="T.ex. 10 m kopparrör, 5 kopplingar…"
                  className={`${inputCls} resize-none`}
                />
              </div>
              <div>
                <label className={labelCls}>Antal på plats</label>
                <input type="number" inputMode="numeric" min={0} value={workersPresent} onChange={e => setWorkersPresent(e.target.value)} placeholder="0" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Anteckning</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Övrigt…"
                  className={`${inputCls} resize-none`}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-5 sm:px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-lg text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Avbryt
          </button>
          <button
            onClick={handleSubmit}
            disabled={!kanSpara}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-700 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {(saving || uploading) ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {uploading ? 'Laddar upp foton…' : editing ? 'Spara' : 'Spara dagboksrad'}
          </button>
        </div>
      </div>
    </div>
  )
}
