'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/lib/BusinessContext'
import { hasFeature, getFeatureLimit, PlanType } from '@/lib/feature-gates'
import { UpgradeModal } from '@/components/UpgradeModal'
import {
  Plus,
  Star,
  Copy,
  Trash2,
  Edit,
  FileText,
  Loader2,
  Sparkles,
  ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'

interface QuoteTemplate {
  id: string
  name: string
  description?: string
  branch?: string
  category?: string
  default_items: any[]
  is_favorite: boolean
  usage_count: number
  rot_enabled: boolean
  rut_enabled: boolean
  created_at: string
}

export default function QuoteTemplatesPage() {
  const router = useRouter()
  const business = useBusiness()
  const [templates, setTemplates] = useState<QuoteTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [branchFilter, setBranchFilter] = useState<string>('all')
  const [showUpgrade, setShowUpgrade] = useState(false)

  const plan = (business as any)?.subscription_plan || 'starter'
  const hasAccess = hasFeature(plan as PlanType, 'quote_templates')
  const templateLimit = getFeatureLimit(plan as PlanType, 'quote_templates')
  const atLimit = templateLimit !== null && templates.length >= templateLimit

  useEffect(() => {
    if (business) fetchTemplates()
  }, [business])

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/quote-templates')
      const data = await res.json()
      setTemplates(data.templates || [])
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    } finally {
      setLoading(false)
    }
  }

  const seedTemplates = async () => {
    setSeeding(true)
    try {
      const res = await fetch('/api/quote-templates/seed', { method: 'POST' })
      if (res.ok) {
        await fetchTemplates()
      }
    } catch (err) {
      console.error('Failed to seed templates:', err)
    } finally {
      setSeeding(false)
    }
  }

  const toggleFavorite = async (id: string) => {
    try {
      await fetch('/api/quote-templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setTemplates(prev =>
        prev.map(t => t.id === id ? { ...t, is_favorite: !t.is_favorite } : t)
      )
    } catch (err) {
      console.error('Failed to toggle favorite:', err)
    }
  }

  const duplicateTemplate = async (template: QuoteTemplate) => {
    if (atLimit) {
      setShowUpgrade(true)
      return
    }
    try {
      const res = await fetch('/api/quote-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...template,
          id: undefined,
          name: template.name + ' (kopia)',
          is_favorite: false,
          usage_count: 0,
        }),
      })
      if (res.ok) {
        await fetchTemplates()
      }
    } catch (err) {
      console.error('Failed to duplicate template:', err)
    }
  }

  const deleteTemplate = async (id: string) => {
    if (!confirm('Vill du ta bort denna mall?')) return
    try {
      await fetch(`/api/quote-templates?id=${id}`, { method: 'DELETE' })
      setTemplates(prev => prev.filter(t => t.id !== id))
    } catch (err) {
      console.error('Failed to delete template:', err)
    }
  }

  const createNew = async () => {
    if (atLimit) {
      setShowUpgrade(true)
      return
    }
    try {
      const res = await fetch('/api/quote-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Ny mall' }),
      })
      const data = await res.json()
      if (data.template) {
        router.push(`/dashboard/settings/quote-templates/${data.template.id}`)
      }
    } catch (err) {
      console.error('Failed to create template:', err)
    }
  }

  const filteredTemplates = branchFilter === 'all'
    ? templates
    : templates.filter(t => t.branch === branchFilter || t.category === branchFilter)

  const branches = Array.from(new Set(templates.map(t => t.branch || t.category).filter(Boolean)))

  if (!hasAccess) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Offertmallar</h2>
          <p className="text-gray-500 mb-4">
            Uppgradera till Professional eller Business för att använda offertmallar.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings" className="text-gray-400 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Offertmallar</h1>
            <p className="text-gray-500 text-sm">Skapa och hantera mallar för snabbare offerter</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Limit counter */}
          {templateLimit !== null && (
            <div className="text-sm text-gray-500">
              {templates.length} / {templateLimit} mallar
              {atLimit && (
                <button
                  onClick={() => setShowUpgrade(true)}
                  className="text-primary-700 font-medium ml-2 hover:underline"
                >
                  Uppgradera →
                </button>
              )}
            </div>
          )}
          <div className="flex gap-2">
            {templates.length === 0 && (
              <button
                onClick={seedTemplates}
                disabled={seeding}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-lg transition-colors"
              >
                {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Skapa exempelmallar
              </button>
            )}
            <button
              onClick={createNew}
              disabled={atLimit}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                atLimit
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-primary-700 text-white hover:bg-primary-800'
              }`}
            >
              <Plus className="w-4 h-4" />
              Ny mall
            </button>
          </div>
        </div>
      </div>

      {/* Branch filter tabs */}
      {branches.length > 1 && (
        <div className="flex gap-2 mb-6 overflow-x-auto">
          <button
            onClick={() => setBranchFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
              branchFilter === 'all'
                ? 'bg-primary-600/20 text-primary-300 border border-primary-600/30'
                : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700 hover:text-white'
            }`}
          >
            Alla
          </button>
          {branches.map(b => (
            <button
              key={b}
              onClick={() => setBranchFilter(b!)}
              className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                branchFilter === b
                  ? 'bg-primary-600/20 text-primary-300 border border-primary-600/30'
                  : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700 hover:text-white'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
        </div>
      )}

      {/* Empty state */}
      {!loading && templates.length === 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-12 text-center">
          <FileText className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">Inga mallar ännu</h3>
          <p className="text-zinc-400 mb-6">
            Skapa din första mall eller generera exempelmallar anpassade för din bransch.
          </p>
          <button
            onClick={seedTemplates}
            disabled={seeding}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary-600 to-primary-600 text-white rounded-lg hover:opacity-90"
          >
            {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generera exempelmallar
          </button>
        </div>
      )}

      {/* Template grid */}
      {!loading && filteredTemplates.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map(template => (
            <div
              key={template.id}
              className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-medium truncate">{template.name}</h3>
                  {template.description && (
                    <p className="text-zinc-500 text-sm mt-1 line-clamp-2">{template.description}</p>
                  )}
                </div>
                <button
                  onClick={() => toggleFavorite(template.id)}
                  className="ml-2 flex-shrink-0"
                >
                  <Star
                    className={`w-5 h-5 ${
                      template.is_favorite
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-zinc-600 hover:text-yellow-400'
                    }`}
                  />
                </button>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {template.branch && (
                  <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-xs rounded">
                    {template.branch}
                  </span>
                )}
                {template.category && template.category !== template.branch && (
                  <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-xs rounded">
                    {template.category}
                  </span>
                )}
                <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-xs rounded">
                  {(template.default_items || []).filter((i: any) => i.item_type === 'item').length} rader
                </span>
                {template.rot_enabled && (
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded">ROT</span>
                )}
                {template.rut_enabled && (
                  <span className="px-2 py-0.5 bg-primary-700/10 text-primary-600 text-xs rounded">RUT</span>
                )}
              </div>

              {/* Usage count */}
              <div className="text-zinc-500 text-xs mb-3">
                Använd {template.usage_count} gånger
              </div>

              {/* Actions */}
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => router.push(`/dashboard/settings/quote-templates/${template.id}`)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                >
                  <Edit className="w-3.5 h-3.5" />
                  Redigera
                </button>
                <button
                  onClick={() => duplicateTemplate(template)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => deleteTemplate(template.id)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 hover:bg-red-900/50 text-zinc-300 hover:text-red-300 text-sm rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upgrade modal */}
      {showUpgrade && (
        <UpgradeModal
          feature="Obegränsade offertmallar"
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </div>
  )
}
