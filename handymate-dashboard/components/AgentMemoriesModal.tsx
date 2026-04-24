'use client'

import { useEffect, useState, useCallback } from 'react'
import { X, Brain, Lightbulb, Eye, Heart, Check, Trash2, Loader2 } from 'lucide-react'
import { getAgentById } from '@/lib/agents/team'

interface AgentMemory {
  id: string
  memory_type: 'observation' | 'pattern' | 'preference' | 'fact'
  content: string
  importance_score: number
  created_at: string
  last_accessed_at: string
  access_count: number
}

interface Props {
  open: boolean
  onClose: () => void
  agentId: string | null
  onDeleted?: () => void
}

const TYPE_META: Record<AgentMemory['memory_type'], { label: string; icon: typeof Eye; color: string; bg: string }> = {
  observation: { label: 'Observation', icon: Eye,       color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200' },
  pattern:     { label: 'Mönster',     icon: Lightbulb, color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
  preference:  { label: 'Preferens',   icon: Heart,     color: 'text-rose-700',    bg: 'bg-rose-50 border-rose-200' },
  fact:        { label: 'Faktum',      icon: Check,     color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
}

export default function AgentMemoriesModal({ open, onClose, agentId, onDeleted }: Props) {
  const [memories, setMemories] = useState<AgentMemory[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const agent = agentId ? getAgentById(agentId) : null

  const fetchMemories = useCallback(async () => {
    if (!agentId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/agent/memories?agent_id=${agentId}`)
      if (res.ok) {
        const data = await res.json()
        setMemories(data.memories || [])
      }
    } catch { /* noop */ }
    finally { setLoading(false) }
  }, [agentId])

  useEffect(() => {
    if (open && agentId) fetchMemories()
  }, [open, agentId, fetchMemories])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const deleteMemory = useCallback(async (id: string) => {
    if (!confirm('Ta bort detta minne? Agenten kommer inte längre använda det i framtida svar.')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/agent/memories/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setMemories(prev => prev.filter(m => m.id !== id))
        onDeleted?.()
      }
    } finally {
      setDeleting(null)
    }
  }, [onDeleted])

  if (!open || !agent) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl sm:mx-4 flex flex-col h-[90vh] sm:h-[720px] sm:max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-primary-50 to-white">
          <div className="flex items-center gap-3 min-w-0">
            {agent.avatar ? (
              <img src={agent.avatar} alt={agent.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
            ) : (
              <div className={`w-10 h-10 rounded-full ${agent.color} text-white flex items-center justify-center font-bold text-sm flex-shrink-0`}>
                {agent.initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-primary-700" />
                Vad {agent.name} kommer ihåg
              </p>
              <p className="text-[11px] text-gray-500">{memories.length} insikter om ditt företag</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Förklaringsbanner */}
        <div className="px-5 py-3 bg-primary-50/40 border-b border-primary-100">
          <p className="text-xs text-primary-900 leading-relaxed">
            <strong>{agent.name}</strong> sparar automatiskt lärdomar från era interaktioner och använder dem för att ge
            mer skräddarsydda svar över tid. Du kan ta bort enskilda minnen om något är felaktigt.
          </p>
        </div>

        {/* Innehåll */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-primary-700 animate-spin" />
            </div>
          )}

          {!loading && memories.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <Brain className="w-10 h-10 text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-700 mb-1">Inga minnen ännu</p>
              <p className="text-xs text-gray-500 max-w-xs">
                {agent.name} börjar spara lärdomar om ditt företag allt eftersom ni samarbetar mer.
              </p>
            </div>
          )}

          {!loading && memories.length > 0 && (
            <div className="space-y-2">
              {memories.map(mem => {
                const meta = TYPE_META[mem.memory_type] || TYPE_META.fact
                const Icon = meta.icon
                const importanceDots = Math.min(5, Math.max(1, Math.round(mem.importance_score * 5)))
                return (
                  <div key={mem.id} className={`rounded-xl border px-4 py-3 ${meta.bg}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                          <span className={`text-[10px] uppercase tracking-wider font-semibold ${meta.color}`}>
                            {meta.label}
                          </span>
                          <span className="flex items-center gap-0.5 ml-auto sm:ml-0">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <span
                                key={i}
                                className={`w-1 h-1 rounded-full ${i < importanceDots ? meta.color.replace('text-', 'bg-') : 'bg-gray-200'}`}
                              />
                            ))}
                          </span>
                        </div>
                        <p className="text-sm text-gray-800 leading-relaxed">{mem.content}</p>
                        <p className="text-[10px] text-gray-400 mt-1.5">
                          Sparad {new Date(mem.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                          {mem.access_count > 0 && ` · använd ${mem.access_count} gång${mem.access_count === 1 ? '' : 'er'}`}
                        </p>
                      </div>
                      <button
                        onClick={() => deleteMemory(mem.id)}
                        disabled={deleting === mem.id}
                        className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-white transition-colors"
                        title="Ta bort minne"
                      >
                        {deleting === mem.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-[11px] text-gray-500 text-center">
            {agent.name} får nya minnen automatiskt — du kan alltid komma tillbaka hit för att granska eller rensa dem.
          </p>
        </div>
      </div>
    </div>
  )
}
