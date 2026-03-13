'use client'

import { useState, useEffect, useCallback } from 'react'

interface LogEntry {
  id: string
  rule_name: string
  trigger_type: string
  action_type: string
  status: string
  context: Record<string, unknown>
  result: Record<string, unknown>
  error_message: string | null
  created_at: string
}

const STATUS_COLORS: Record<string, string> = {
  success: 'bg-green-100 text-green-800',
  pending_approval: 'bg-yellow-100 text-yellow-800',
  rejected: 'bg-red-100 text-red-800',
  skipped: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-100 text-red-800',
}

const STATUS_LABELS: Record<string, string> = {
  success: 'Lyckades',
  pending_approval: 'Väntar godkännande',
  rejected: 'Avvisad',
  skipped: 'Hoppades över',
  failed: 'Misslyckades',
}

const ACTION_LABELS: Record<string, string> = {
  send_sms: 'SMS',
  send_email: 'E-post',
  create_approval: 'Godkännande',
  update_status: 'Statusuppdatering',
  run_agent: 'AI-agent',
  notify_owner: 'Notis',
  reject_lead: 'Avvisa lead',
  generate_quote: 'Offert',
  create_booking: 'Bokning',
  schedule_followup: 'Uppföljning',
}

export default function AutomationLog() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/automation/logs?${params}`)
      const data = await res.json()
      setLogs(data.logs || [])
      setTotalPages(data.total_pages || 1)
    } catch {
      // error
    }
    setLoading(false)
  }, [page, statusFilter])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => { setStatusFilter(''); setPage(1) }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${!statusFilter ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-600'}`}
        >
          Alla
        </button>
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setStatusFilter(key); setPage(1) }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${statusFilter === key ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Log list */}
      {loading ? (
        <div className="text-gray-500 p-4">Laddar logg...</div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          Inga loggposter hittades
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {logs.map(log => (
              <div key={log.id} className="p-4 hover:bg-gray-50">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm text-gray-500 whitespace-nowrap">{formatDate(log.created_at)}</span>
                    <span className="text-sm font-medium text-gray-900 truncate">{log.rule_name}</span>
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 whitespace-nowrap">
                      {ACTION_LABELS[log.action_type] || log.action_type}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${STATUS_COLORS[log.status] || 'bg-gray-100'}`}>
                    {STATUS_LABELS[log.status] || log.status}
                  </span>
                </div>

                {expandedId === log.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-600 space-y-2">
                    <div><strong>Trigger:</strong> {log.trigger_type}</div>
                    {log.error_message && (
                      <div className="text-red-600"><strong>Fel:</strong> {log.error_message}</div>
                    )}
                    {Object.keys(log.context).length > 0 && (
                      <div>
                        <strong>Kontext:</strong>
                        <pre className="mt-1 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                          {JSON.stringify(log.context, null, 2)}
                        </pre>
                      </div>
                    )}
                    {Object.keys(log.result).length > 0 && (
                      <div>
                        <strong>Resultat:</strong>
                        <pre className="mt-1 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                          {JSON.stringify(log.result, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-600 disabled:opacity-50"
          >
            Föregående
          </button>
          <span className="text-sm text-gray-500">
            Sida {page} av {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-600 disabled:opacity-50"
          >
            Nästa
          </button>
        </div>
      )}
    </div>
  )
}
