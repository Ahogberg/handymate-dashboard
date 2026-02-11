'use client'

import { useState, useEffect } from 'react'
import { FileStack, Clock, Loader2, X, Trash2 } from 'lucide-react'

interface JobTemplate {
  id: string
  name: string
  description: string | null
  branch: string | null
  estimated_hours: number | null
  labor_cost: number | null
  materials: any[]
  total_estimate: number | null
  usage_count: number
}

interface TemplateSelectorProps {
  onSelect: (template: JobTemplate) => void
  onBack: () => void
}

export default function TemplateSelector({ onSelect, onBack }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<JobTemplate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTemplates()
  }, [])

  async function fetchTemplates() {
    try {
      const res = await fetch('/api/quotes/templates')
      const data = await res.json()
      setTemplates(data.templates || [])
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    }
    setLoading(false)
  }

  async function deleteTemplate(id: string) {
    try {
      await fetch('/api/quotes/templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      setTemplates(templates.filter(t => t.id !== id))
    } catch (err) {
      console.error('Failed to delete template:', err)
    }
  }

  const formatCurrency = (n: number) => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Välj mall</h2>
        <button onClick={onBack} className="p-2 text-zinc-400 hover:text-white rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-8">
          <FileStack className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
          <p className="text-zinc-500">Inga mallar ännu.</p>
          <p className="text-xs text-zinc-600 mt-1">Spara en offert som mall för att komma igång.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <div
              key={t.id}
              className="flex items-center gap-3 p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl hover:border-zinc-600 transition-all group"
            >
              <button
                onClick={() => onSelect(t)}
                className="flex-1 text-left min-w-0"
              >
                <p className="text-sm font-medium text-white truncate">{t.name}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                  {t.estimated_hours && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {t.estimated_hours}h
                    </span>
                  )}
                  {t.total_estimate && <span>{formatCurrency(t.total_estimate)}</span>}
                  <span>Använd {t.usage_count}x</span>
                </div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id) }}
                className="p-2 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
