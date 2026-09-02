'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Download, Loader2, Plus } from 'lucide-react'
import DiaryFilters from './DiaryFilters'
import DiaryEntryCard from './DiaryEntryCard'
import DiaryEntryModal from './DiaryEntryModal'
import DiaryAttestConfirm from './DiaryAttestConfirm'
import {
  EMPTY_DIARY_FILTERS,
  diaryFiltersToQuery,
  type DiaryAtaOption,
  type DiaryFilterState,
  type DiaryFormPayload,
  type DiaryPermissions,
  type DiaryRow,
} from './types'

/**
 * Byggdagboken på projektsidan (Etapp E1, 2026-09-02).
 *
 * Ersätter den inline-kod som låg i app/dashboard/projects/[id]/page.tsx
 * (logs-state, fetchLogs, handleSaveLog/handleDeleteLog, listan och
 * LogModal). Allt tillstånd bor här; sidan monterar bara `<DiaryTab …/>`.
 *
 * Behörigheterna kommer från servern (`permissions` i GET-svaret + `can_edit`
 * per rad) — komponenten gissar aldrig själv vad användaren får göra.
 */
export default function DiaryTab({
  projectId,
  projectName,
  atas,
  showToast,
}: {
  projectId: string
  projectName: string | null
  atas: DiaryAtaOption[]
  showToast: (message: string, type: 'success' | 'error') => void
}) {
  const [rows, setRows] = useState<DiaryRow[]>([])
  const [permissions, setPermissions] = useState<DiaryPermissions>({ can_create: false, can_attest: false, is_owner_or_admin: false })
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<DiaryFilterState>(EMPTY_DIARY_FILTERS)
  const [modal, setModal] = useState<{ open: boolean; editing: DiaryRow | null }>({ open: false, editing: null })
  const [attesting, setAttesting] = useState<DiaryRow | null>(null)
  const [exporting, setExporting] = useState(false)
  const requestSeq = useRef(0)

  const load = useCallback(async (f: DiaryFilterState) => {
    const seq = ++requestSeq.current
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/logs${diaryFiltersToQuery(f)}`)
      const data = await res.json().catch(() => ({}))
      if (seq !== requestSeq.current) return
      if (!res.ok) {
        showToast(data.error || 'Kunde inte läsa dagboken', 'error')
        return
      }
      setRows(data.logs || [])
      if (data.permissions) setPermissions(data.permissions)
    } catch {
      if (seq === requestSeq.current) showToast('Kunde inte läsa dagboken', 'error')
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [projectId, showToast])

  // Fritextsökningen debouncas; övriga filter slår direkt.
  useEffect(() => {
    const t = setTimeout(() => { void load(filters) }, filters.q ? 300 : 0)
    return () => clearTimeout(t)
  }, [filters, load])

  const authors = useMemo(() => {
    const m = new Map<string, { id: string; name: string | null }>()
    for (const r of rows) if (r.business_user) m.set(r.business_user.id, { id: r.business_user.id, name: r.business_user.name })
    return Array.from(m.values())
  }, [rows])

  const felText = async (res: Response, fallback: string) => {
    const data = await res.json().catch(() => ({}))
    return (data && typeof data.error === 'string' && data.error) || fallback
  }

  const save = async (payload: DiaryFormPayload): Promise<string | null> => {
    const editing = modal.editing
    const url = editing ? `/api/projects/${projectId}/logs/${editing.id}` : `/api/projects/${projectId}/logs`
    try {
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        showToast(await felText(res, 'Kunde inte spara dagboksraden'), 'error')
        return null
      }
      const data = await res.json()
      if (data.duplicate) showToast('Den anteckningen fanns redan — inget dubbelt sparades', 'success')
      return data.log?.id ?? editing?.id ?? null
    } catch {
      showToast('Kunde inte spara dagboksraden', 'error')
      return null
    }
  }

  const patchAction = async (row: DiaryRow, body: Record<string, unknown>, fallback: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/projects/${projectId}/logs/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        showToast(await felText(res, fallback), 'error')
        return false
      }
      const data = await res.json()
      if (data.log) setRows(prev => prev.map(r => (r.id === row.id ? data.log : r)))
      return true
    } catch {
      showToast(fallback, 'error')
      return false
    }
  }

  const remove = async (row: DiaryRow) => {
    if (!confirm('Ta bort den här dagboksraden?')) return
    try {
      const res = await fetch(`/api/projects/${projectId}/logs/${row.id}`, { method: 'DELETE' })
      if (!res.ok) {
        showToast(await felText(res, 'Kunde inte ta bort raden'), 'error')
        return
      }
      setRows(prev => prev.filter(r => r.id !== row.id))
      showToast('Dagboksraden togs bort', 'success')
    } catch {
      showToast('Kunde inte ta bort raden', 'error')
    }
  }

  const exportPdf = async () => {
    setExporting(true)
    try {
      const sp = new URLSearchParams()
      if (filters.from) sp.set('from', filters.from)
      if (filters.to) sp.set('to', filters.to)
      const res = await fetch(`/api/projects/${projectId}/logs/pdf${sp.toString() ? `?${sp}` : ''}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `byggdagbok-${projectName || projectId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      showToast('Kunde inte exportera PDF', 'error')
    } finally {
      setExporting(false)
    }
  }

  const harFilter = diaryFiltersToQuery(filters) !== ''

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="min-w-0 text-lg font-semibold text-gray-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-amber-400" />
          Byggdagbok {projectName ? `— ${projectName}` : ''}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {rows.length > 0 && (
            <button
              onClick={exportPdf}
              disabled={exporting}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-600 hover:text-gray-900 hover:border-gray-300 transition-colors disabled:opacity-50"
            >
              {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Exportera PDF{filters.from || filters.to ? ' (urvalet)' : ''}
            </button>
          )}
          {permissions.can_create && (
            <button
              onClick={() => setModal({ open: true, editing: null })}
              className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-lg text-white text-sm font-medium hover:opacity-90"
            >
              <Plus className="w-4 h-4" /> Ny dagboksrad
            </button>
          )}
        </div>
      </div>

      {(rows.length > 0 || harFilter) && (
        <DiaryFilters value={filters} onChange={setFilters} authors={authors} atas={atas} />
      )}

      {loading && rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 flex items-center justify-center text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : rows.length > 0 ? (
        <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
          {rows.map(row => (
            <DiaryEntryCard
              key={row.id}
              row={row}
              permissions={permissions}
              onEdit={r => setModal({ open: true, editing: r })}
              onDelete={remove}
              onAttest={setAttesting}
              onUnlock={async r => {
                if (await patchAction(r, { action: 'unlock' }, 'Kunde inte låsa upp raden')) showToast('Raden är upplåst', 'success')
              }}
              onAddendum={(r, text) => patchAction(r, { action: 'addendum', text }, 'Kunde inte lägga till anteckningen')}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-12 text-center">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{harFilter ? 'Inga rader matchar filtret' : 'Inga dagboksrader ännu'}</p>
          <p className="text-xs text-gray-400 mt-1">
            {harFilter ? 'Prova att rensa filtret.' : 'Dokumentera arbetet dag för dag — det är bevisningen om något ifrågasätts.'}
          </p>
        </div>
      )}

      {modal.open && (
        <DiaryEntryModal
          editing={modal.editing}
          projectId={projectId}
          atas={atas}
          onClose={() => setModal({ open: false, editing: null })}
          onSave={save}
          onSaved={() => {
            showToast(modal.editing ? 'Dagboksraden uppdaterad' : 'Dagboksraden sparad', 'success')
            setModal({ open: false, editing: null })
            void load(filters)
          }}
          onError={msg => showToast(msg, 'error')}
        />
      )}

      {attesting && (
        <DiaryAttestConfirm
          row={attesting}
          onCancel={() => setAttesting(null)}
          onConfirm={async () => {
            const ok = await patchAction(attesting, { action: 'attest' }, 'Kunde inte attestera raden')
            if (ok) showToast('Raden är attesterad och låst', 'success')
            setAttesting(null)
          }}
        />
      )}
    </div>
  )
}
