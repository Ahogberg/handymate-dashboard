'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Edit,
  FileText,
  Loader2,
  Lock,
  MessageSquarePlus,
  Mic,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react'
import { WEATHER_EMOJI, WEATHER_LABELS, isDiaryWeather } from '@/lib/diary/weather'
import { useFilePreview } from '@/components/documents/FilePreviewProvider'
import { formatDiaryDate, formatDiaryTimestamp, type DiaryPermissions, type DiaryRow } from './types'

/**
 * En dagboksrad. Etiketterna berättar radens tillstånd — Låst / Attesterad /
 * ÄTA #n / timmar / Röst — och åtgärderna följer tillståndet: en låst rad
 * har bara "Tilläggsanteckning" (och "Lås upp" för ägare/admin).
 */
export default function DiaryEntryCard({
  row,
  permissions,
  onEdit,
  onDelete,
  onAttest,
  onUnlock,
  onAddendum,
}: {
  row: DiaryRow
  permissions: DiaryPermissions
  onEdit: (row: DiaryRow) => void
  onDelete: (row: DiaryRow) => void
  onAttest: (row: DiaryRow) => void
  onUnlock: (row: DiaryRow) => Promise<void>
  onAddendum: (row: DiaryRow, text: string) => Promise<boolean>
}) {
  const { openFilePreview } = useFilePreview()
  const [addendumOpen, setAddendumOpen] = useState(false)
  const [addendumText, setAddendumText] = useState('')
  const [busy, setBusy] = useState(false)

  const weather = isDiaryWeather(row.weather) ? row.weather : null
  const fromVoice = row.id.startsWith('log_report_')
  const fromCall = row.id.startsWith('log_call_')
  const lockLabel =
    row.lock_reason === 'attested' ? 'Attesterad' :
    row.lock_reason === 'age' ? 'Låst (äldre än 7 dagar)' :
    row.lock_reason === 'manual' ? 'Låst' : null

  const skickaAddendum = async () => {
    if (!addendumText.trim()) return
    setBusy(true)
    const ok = await onAddendum(row, addendumText.trim())
    setBusy(false)
    if (ok) { setAddendumText(''); setAddendumOpen(false) }
  }

  const lasUpp = async () => {
    setBusy(true)
    try { await onUnlock(row) } finally { setBusy(false) }
  }

  const badge = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium'

  return (
    <div className={`bg-white rounded-xl border p-4 sm:p-5 ${row.locked ? 'border-gray-200' : 'border-[#E2E8F0]'}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-gray-900 font-semibold capitalize">{formatDiaryDate(row.date)}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {row.business_user?.name || 'Okänd'}
            {row.created_at ? ` · ${formatDiaryTimestamp(row.created_at)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          {row.attested_at && (
            <span className={`${badge} bg-primary-50 text-primary-700`} title={row.attested_by?.name ? `Attesterad av ${row.attested_by.name}` : undefined}>
              <CheckCircle2 className="w-3 h-3" /> Attesterad
            </span>
          )}
          {row.locked && row.lock_reason !== 'attested' && lockLabel && (
            <span className={`${badge} bg-gray-100 text-gray-600`}>
              <Lock className="w-3 h-3" /> {lockLabel}
            </span>
          )}
          {row.ata && (
            <span className={`${badge} bg-amber-50 text-amber-800`} title={row.ata.description || undefined}>
              <FileText className="w-3 h-3" /> ÄTA {row.ata.ata_number ? `#${row.ata.ata_number}` : ''}
            </span>
          )}
          {row.hours_worked != null && (
            <span className={`${badge} bg-gray-100 text-gray-700`}>
              <Clock className="w-3 h-3" /> {row.hours_worked} h
            </span>
          )}
          {row.time_entry_hours != null && row.time_entry_hours > 0 && (
            <span className={`${badge} bg-gray-50 text-gray-500`} title="Registrerad tid i tidrapporten samma dag">
              tid {row.time_entry_hours} h
            </span>
          )}
          {(fromVoice || fromCall) && (
            <span className={`${badge} bg-gray-100 text-gray-600`}>
              <Mic className="w-3 h-3" /> {fromCall ? 'Samtal' : 'Röst'}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-2">
        {weather && (
          <span>
            {WEATHER_EMOJI[weather]} {WEATHER_LABELS[weather]}
            {row.temperature != null ? `, ${row.temperature}°C` : ''}
          </span>
        )}
        {!weather && row.temperature != null && <span>{row.temperature}°C</span>}
        {row.workers_count != null && (
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" /> {row.workers_count} på plats
          </span>
        )}
      </div>

      {row.work_performed && (
        <p className="text-sm text-gray-800 mt-3 whitespace-pre-line">{row.work_performed}</p>
      )}

      {row.materials_used && (
        <p className="text-xs text-gray-500 mt-2">
          <span className="font-medium text-gray-600">Material:</span> {row.materials_used}
        </p>
      )}

      {row.issues && (
        <div className="flex items-start gap-2 mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 whitespace-pre-line">{row.issues}</p>
        </div>
      )}

      {row.description && (
        <p className="text-xs text-gray-500 italic mt-2 whitespace-pre-line">{row.description}</p>
      )}

      {row.photos.length > 0 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {row.photos.map((photo, i) => (
            <button
              key={photo.path}
              type="button"
              disabled={!photo.url}
              onClick={() => photo.url && openFilePreview({ name: `Foto ${i + 1} — ${row.date}`, mimeType: 'image/jpeg', inlineUrl: photo.url })}
              className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-[#E2E8F0] bg-gray-50"
            >
              {photo.url ? (
                <img src={photo.url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-gray-400">Saknas</span>
              )}
            </button>
          ))}
        </div>
      )}

      {row.addendum && (
        <div className="mt-3 pl-3 border-l-2 border-primary-200">
          <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Tilläggsanteckningar</p>
          <p className="text-xs text-gray-700 italic whitespace-pre-line">{row.addendum}</p>
        </div>
      )}

      {row.attested_at && (
        <p className="text-[11px] text-primary-700 mt-3">
          Attesterad {formatDiaryTimestamp(row.attested_at)}
          {row.attested_by?.name ? ` av ${row.attested_by.name}` : ''}
        </p>
      )}

      {addendumOpen && (
        <div className="mt-3 space-y-2">
          <textarea
            value={addendumText}
            onChange={e => setAddendumText(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Vad ska läggas till? Stämplas med tid och lämnar originalet orört."
            className="w-full px-3 py-2 bg-gray-50 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-primary-400 resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setAddendumOpen(false); setAddendumText('') }} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-900">Avbryt</button>
            <button
              onClick={skickaAddendum}
              disabled={busy || !addendumText.trim()}
              className="px-3 py-1.5 bg-primary-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-1"
            >
              {busy && <Loader2 className="w-3 h-3 animate-spin" />} Lägg till
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 pt-3 border-t border-gray-100">
        {row.can_edit && !row.locked && (
          <button onClick={() => onEdit(row)} className="flex items-center gap-1 text-xs text-primary-700 hover:text-primary-800">
            <Edit className="w-3.5 h-3.5" /> Redigera
          </button>
        )}
        {row.can_edit && !addendumOpen && (
          <button onClick={() => setAddendumOpen(true)} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900">
            <MessageSquarePlus className="w-3.5 h-3.5" /> Tilläggsanteckning
          </button>
        )}
        {permissions.can_attest && !row.attested_at && (
          <button onClick={() => onAttest(row)} className="flex items-center gap-1 text-xs text-primary-700 hover:text-primary-800">
            <CheckCircle2 className="w-3.5 h-3.5" /> Attestera
          </button>
        )}
        {permissions.is_owner_or_admin && row.locked && (
          <button onClick={lasUpp} disabled={busy} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-50">
            <Unlock className="w-3.5 h-3.5" /> Lås upp
          </button>
        )}
        {row.can_edit && !row.locked && (
          <button onClick={() => onDelete(row)} className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 ml-auto">
            <Trash2 className="w-3.5 h-3.5" /> Ta bort
          </button>
        )}
      </div>
    </div>
  )
}
