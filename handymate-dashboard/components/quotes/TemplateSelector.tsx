'use client'

import { useState, useEffect } from 'react'
import { FileStack, Loader2, X, Trash2, Star, Wrench, Package } from 'lucide-react'
import type { QuoteTemplate } from '@/lib/types/quote'

interface TemplateSelectorProps {
  onSelect: (template: QuoteTemplate) => void
  onBack: () => void
}

export default function TemplateSelector({ onSelect, onBack }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<QuoteTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  useEffect(() => {
    fetchTemplates()
  }, [])

  async function fetchTemplates() {
    try {
      const res = await fetch('/api/quote-templates')
      const data = await res.json()
      setTemplates(data.templates || [])
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    }
    setLoading(false)
  }

  async function deleteTemplate(id: string) {
    try {
      await fetch(`/api/quote-templates?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      setTemplates(templates.filter(t => t.id !== id))
    } catch (err) {
      console.error('Failed to delete template:', err)
    }
  }

  async function toggleFavorite(id: string) {
    try {
      const res = await fetch('/api/quote-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (data.template) {
        setTemplates(prev => prev.map(t => (t.id === id ? data.template : t)))
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err)
    }
  }

  const formatCurrency = (n: number) => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n)

  // Get unique categories
  const categories = Array.from(new Set(templates.map(t => t.category).filter(Boolean))) as string[]

  const filteredTemplates = categoryFilter === 'all'
    ? templates
    : templates.filter(t => t.category === categoryFilter)

  // Sort favorites first
  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    if (a.is_favorite && !b.is_favorite) return -1
    if (!a.is_favorite && b.is_favorite) return 1
    return 0
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Välj mall</h2>
        <button onClick={onBack} className="p-2 text-gray-500 hover:text-gray-900 rounded-lg">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Category filter tabs */}
      {categories.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              categoryFilter === 'all'
                ? 'bg-primary-700 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            Alla
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                categoryFilter === cat
                  ? 'bg-primary-700 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-sky-700 animate-spin" />
        </div>
      ) : sortedTemplates.length === 0 ? (
        <div className="text-center py-8">
          <FileStack className="w-10 h-10 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-400">Inga mallar ännu.</p>
          <p className="text-xs text-gray-400 mt-1">Spara en offert som mall för att komma igång.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedTemplates.map(t => {
            const itemRows = (t.default_items || []).filter(i => i.item_type === 'item')
            const laborCount = itemRows.filter(i => i.unit === 'tim' || i.unit === 'timme').length
            const materialCount = itemRows.length - laborCount
            const totalEstimate = itemRows.reduce((sum, i) => sum + (i.total ?? i.quantity * i.unit_price), 0)
            const hasGronTeknik = (t.default_items || []).some(i => (i.rot_rut_type || '').startsWith('gron'))
            const rotTag = hasGronTeknik ? 'GRÖN TEKNIK' : t.rot_enabled ? 'ROT' : t.rut_enabled ? 'RUT' : null

            return (
              <div
                key={t.id}
                className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl hover:border-primary-300 transition-all group"
              >
                <button
                  onClick={() => toggleFavorite(t.id)}
                  className={`p-1 transition-all ${t.is_favorite ? 'text-amber-500' : 'text-gray-300 opacity-0 group-hover:opacity-100'}`}
                >
                  <Star className={`w-4 h-4 ${t.is_favorite ? 'fill-amber-500' : ''}`} />
                </button>
                <button
                  onClick={() => onSelect(t)}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                    {rotTag && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-600 rounded">
                        {rotTag}
                      </span>
                    )}
                    {t.category && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary-100 text-sky-700 rounded">
                        {t.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    {laborCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Wrench className="w-3 h-3" />
                        {laborCount} arbeten
                      </span>
                    )}
                    {materialCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        {materialCount} material
                      </span>
                    )}
                    {totalEstimate > 0 && <span>{formatCurrency(totalEstimate)}</span>}
                    {t.usage_count > 0 && <span>Använd {t.usage_count}x</span>}
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id) }}
                  className="p-2 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
