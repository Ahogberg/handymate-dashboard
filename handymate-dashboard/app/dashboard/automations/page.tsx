'use client'

import { useEffect, useState, useCallback } from 'react'
import AutomationSettings from '@/components/AutomationSettings'
import AutomationLog from '@/components/AutomationLog'
import AutomationRuleBuilder from '@/components/AutomationRuleBuilder'

interface AutomationRule {
  id: string
  name: string
  description: string | null
  is_active: boolean
  is_system: boolean
  trigger_type: string
  trigger_config: Record<string, unknown>
  action_type: string
  action_config: Record<string, unknown>
  requires_approval: boolean
  respects_work_hours: boolean
  respects_night_mode: boolean
  run_count: number
  last_run_at: string | null
  last_run_status: string | null
}

type TabType = 'rules' | 'settings' | 'log'

const TRIGGER_LABELS: Record<string, string> = {
  cron: 'Schemalagd',
  event: 'Händelse',
  threshold: 'Tröskel',
  manual: 'Manuell',
}

const TRIGGER_COLORS: Record<string, string> = {
  cron: 'bg-blue-100 text-blue-700',
  event: 'bg-purple-100 text-purple-700',
  threshold: 'bg-amber-100 text-amber-700',
  manual: 'bg-gray-100 text-gray-600',
}

const ACTION_LABELS: Record<string, string> = {
  send_sms: 'SMS',
  send_email: 'E-post',
  create_approval: 'Godkännande',
  update_status: 'Status',
  run_agent: 'AI-agent',
  notify_owner: 'Notis',
  reject_lead: 'Avvisa',
  generate_quote: 'Offert',
  create_booking: 'Bokning',
  schedule_followup: 'Uppföljning',
}

const STATUS_DOT: Record<string, string> = {
  success: 'bg-green-500',
  pending_approval: 'bg-yellow-500',
  failed: 'bg-red-500',
  skipped: 'bg-gray-400',
}

type FilterType = 'all' | 'active' | 'inactive' | 'cron' | 'event' | 'threshold'

export default function AutomationsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('rules')
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editRule, setEditRule] = useState<AutomationRule | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [toggling, setToggling] = useState<string | null>(null)
  const [running, setRunning] = useState<string | null>(null)

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/automation/rules')
      const data = await res.json()
      setRules(data)
    } catch {
      // error
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const toggleRule = async (id: string) => {
    setToggling(id)
    try {
      const res = await fetch(`/api/automation/rules/${id}/toggle`, { method: 'POST' })
      if (res.ok) {
        const updated = await res.json()
        setRules(prev => prev.map(r => r.id === id ? { ...r, is_active: updated.is_active } : r))
      }
    } catch { /* error */ }
    setToggling(null)
  }

  const runRule = async (id: string) => {
    setRunning(id)
    try {
      await fetch(`/api/automation/rules/${id}/run`, { method: 'POST' })
      await fetchRules()
    } catch { /* error */ }
    setRunning(null)
  }

  const deleteRule = async (id: string) => {
    if (!confirm('Vill du radera denna regel?')) return
    try {
      const res = await fetch(`/api/automation/rules/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setRules(prev => prev.filter(r => r.id !== id))
      } else {
        const data = await res.json()
        alert(data.error || 'Kunde inte radera')
      }
    } catch { /* error */ }
  }

  const filteredRules = rules.filter(r => {
    if (filter === 'active') return r.is_active
    if (filter === 'inactive') return !r.is_active
    if (filter === 'cron') return r.trigger_type === 'cron'
    if (filter === 'event') return r.trigger_type === 'event'
    if (filter === 'threshold') return r.trigger_type === 'threshold'
    return true
  })

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Aldrig'
    return new Date(dateStr).toLocaleString('sv-SE', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Automationer</h1>
        <p className="text-sm text-gray-500 mt-1">
          Regler som styr hur din AI-assistent agerar automatiskt
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
        {[
          { key: 'rules' as TabType, label: 'Regler' },
          { key: 'settings' as TabType, label: 'Inställningar' },
          { key: 'log' as TabType, label: 'Aktivitetslogg' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Regler */}
      {activeTab === 'rules' && (
        <div>
          {/* Header row */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex gap-1.5 flex-wrap">
              {[
                { key: 'all' as FilterType, label: 'Alla' },
                { key: 'active' as FilterType, label: 'Aktiva' },
                { key: 'inactive' as FilterType, label: 'Inaktiva' },
                { key: 'cron' as FilterType, label: 'Schemalagda' },
                { key: 'event' as FilterType, label: 'Händelse' },
                { key: 'threshold' as FilterType, label: 'Tröskel' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    filter === f.key
                      ? 'bg-teal-100 text-teal-800'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setEditRule(null); setShowBuilder(true) }}
              className="px-4 py-2 bg-teal-700 text-white rounded-lg text-sm font-medium hover:bg-teal-800 transition-colors"
            >
              + Ny regel
            </button>
          </div>

          {/* Rules list */}
          {loading ? (
            <div className="p-8 text-center text-gray-500">Laddar regler...</div>
          ) : filteredRules.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
              Inga regler hittades
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRules.map(rule => (
                <div
                  key={rule.id}
                  className={`bg-white rounded-xl border p-4 transition-colors ${
                    rule.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {rule.is_system && (
                          <span className="text-xs text-gray-400" title="Systemregel">🔒</span>
                        )}
                        <span className="text-sm font-semibold text-gray-900">{rule.name}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${TRIGGER_COLORS[rule.trigger_type] || 'bg-gray-100'}`}>
                          {TRIGGER_LABELS[rule.trigger_type] || rule.trigger_type}
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          {ACTION_LABELS[rule.action_type] || rule.action_type}
                        </span>
                      </div>
                      {rule.description && (
                        <p className="text-xs text-gray-500 mb-2">{rule.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          {rule.last_run_status && (
                            <span className={`w-1.5 h-1.5 rounded-full inline-block ${STATUS_DOT[rule.last_run_status] || 'bg-gray-400'}`} />
                          )}
                          Senast: {formatDate(rule.last_run_at)}
                        </span>
                        <span>{rule.run_count} körningar</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Run button */}
                      <button
                        onClick={() => runRule(rule.id)}
                        disabled={running === rule.id}
                        className="p-1.5 text-gray-400 hover:text-teal-600 transition-colors"
                        title="Kör nu"
                      >
                        {running === rule.id ? (
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="32" strokeDashoffset="32" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </button>

                      {/* Edit button (non-system only) */}
                      {!rule.is_system && (
                        <button
                          onClick={() => { setEditRule(rule); setShowBuilder(true) }}
                          className="p-1.5 text-gray-400 hover:text-teal-600 transition-colors"
                          title="Redigera"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      )}

                      {/* Delete button (non-system only) */}
                      {!rule.is_system && (
                        <button
                          onClick={() => deleteRule(rule.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                          title="Radera"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      )}

                      {/* Toggle */}
                      <label className="relative inline-flex items-center cursor-pointer ml-2">
                        <input
                          type="checkbox"
                          checked={rule.is_active}
                          onChange={() => toggleRule(rule.id)}
                          disabled={toggling === rule.id}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Inställningar */}
      {activeTab === 'settings' && <AutomationSettings />}

      {/* Tab: Aktivitetslogg */}
      {activeTab === 'log' && <AutomationLog />}

      {/* Rule builder modal */}
      {showBuilder && (
        <AutomationRuleBuilder
          onClose={() => { setShowBuilder(false); setEditRule(null) }}
          onSaved={() => { setShowBuilder(false); setEditRule(null); fetchRules() }}
          editRule={editRule || undefined}
        />
      )}
    </div>
  )
}
