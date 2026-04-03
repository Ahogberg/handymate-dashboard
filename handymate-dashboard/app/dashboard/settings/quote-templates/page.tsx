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
  Pencil,
  FileText,
  Loader2,
  Sparkles,
  ArrowLeft,
  Layers,
  Hammer,
  Zap,
  Wrench,
  LayoutTemplate,
  CreditCard,
  CheckCircle2,
} from 'lucide-react'
import Link from 'next/link'

interface QuoteTemplate {
  id: string
  name: string
  description?: string
  branch?: string
  category?: string
  default_items: any[]
  default_payment_plan?: any[]
  is_favorite: boolean
  usage_count: number
  rot_enabled: boolean
  rut_enabled: boolean
  created_at: string
  introduction_text?: string
  conclusion_text?: string
}

// Branch icons and colors
const BRANCH_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  'Bygg': { icon: Hammer, color: 'text-amber-600', bg: 'bg-amber-50' },
  'El': { icon: Zap, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  'VVS': { icon: Wrench, color: 'text-blue-600', bg: 'bg-blue-50' },
  'Reparation': { icon: Wrench, color: 'text-orange-600', bg: 'bg-orange-50' },
  'Allround': { icon: Layers, color: 'text-teal-600', bg: 'bg-teal-50' },
}

function getBranchConfig(branch?: string, category?: string) {
  const key = category || branch || 'Allround'
  return BRANCH_CONFIG[key] || BRANCH_CONFIG['Allround']
}

/** Mini-preview of template structure */
function TemplatePreview({ items, rotEnabled }: { items: any[]; rotEnabled: boolean }) {
  const headings = items.filter((i: any) => i.item_type === 'heading')
  const lineItems = items.filter((i: any) => i.item_type === 'item')
  const total = lineItems.reduce((sum: number, i: any) => sum + (i.total || 0), 0)

  return (
    <div className="mt-3 bg-[#F8FAFC] rounded-lg p-3 border border-slate-100">
      {/* Mini header bar */}
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-5 h-5 rounded bg-[#0F766E]/10 flex items-center justify-center">
          <FileText className="w-3 h-3 text-[#0F766E]" />
        </div>
        <div className="h-2 w-20 bg-slate-200 rounded-full" />
        <div className="ml-auto h-2 w-12 bg-slate-200 rounded-full" />
      </div>

      {/* Structure lines */}
      <div className="space-y-1">
        {headings.length > 0 ? (
          headings.slice(0, 3).map((h: any, i: number) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-[#0F766E]" />
              <span className="text-[10px] text-slate-500 truncate">{h.description}</span>
            </div>
          ))
        ) : (
          lineItems.slice(0, 3).map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full bg-slate-300" />
              <span className="text-[10px] text-slate-400 truncate flex-1">{item.description}</span>
              <span className="text-[10px] text-slate-400">{(item.total || 0).toLocaleString('sv-SE')} kr</span>
            </div>
          ))
        )}
      </div>

      {/* Footer total */}
      <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between">
        <div className="flex gap-1">
          {rotEnabled && (
            <span className="text-[9px] font-medium px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded">ROT</span>
          )}
          <span className="text-[9px] text-slate-400">{lineItems.length} rader</span>
        </div>
        <span className="text-[11px] font-semibold text-slate-700">
          {total > 0 ? `${total.toLocaleString('sv-SE')} kr` : '—'}
        </span>
      </div>
    </div>
  )
}

/** Illustrated empty state template card (non-interactive) */
function EmptyTemplateCard({ name, category, lines, color }: {
  name: string; category: string; lines: string[]; color: string
}) {
  return (
    <div className="bg-white border border-dashed border-slate-200 rounded-xl p-5 opacity-60">
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <span className="text-[10px] tracking-wide uppercase text-slate-400">{category}</span>
      </div>
      <h4 className="text-sm font-semibold text-slate-600 mb-3">{name}</h4>
      <div className="space-y-1.5">
        {lines.map((line, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-0.5 h-0.5 rounded-full bg-slate-300" />
            <div className="h-1.5 rounded-full bg-slate-100" style={{ width: `${60 + Math.random() * 30}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
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
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-10 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <LayoutTemplate className="w-6 h-6 text-slate-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Offertmallar</h2>
          <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
            Uppgradera till Professional eller Business för att använda offertmallar och snabba upp ditt offertarbete.
          </p>
          <button
            onClick={() => setShowUpgrade(true)}
            className="px-4 py-2 bg-[#0F766E] text-white text-sm font-medium rounded-lg hover:bg-[#0D6B63] transition-colors"
          >
            Uppgradera plan
          </button>
        </div>
        {showUpgrade && (
          <UpgradeModal feature="Obegränsade offertmallar" onClose={() => setShowUpgrade(false)} />
        )}
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/settings"
            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Offertmallar</h1>
            <p className="text-sm text-slate-500">Återanvänd strukturer för snabbare offerter</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {templateLimit !== null && (
            <span className="text-xs text-slate-400 mr-1">
              {templates.length}/{templateLimit}
            </span>
          )}
          {templates.length === 0 && (
            <button
              onClick={seedTemplates}
              disabled={seeding}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-[#F8FAFC] transition-colors"
            >
              {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-amber-500" />}
              Skapa exempelmallar
            </button>
          )}
          <button
            onClick={createNew}
            disabled={atLimit}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              atLimit
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-[#0F766E] text-white hover:bg-[#0D6B63]'
            }`}
          >
            <Plus className="w-4 h-4" />
            Ny mall
          </button>
        </div>
      </div>

      {/* Branch filter pills */}
      {branches.length > 1 && (
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
          <button
            onClick={() => setBranchFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              branchFilter === 'all'
                ? 'bg-[#0F766E] text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-[#F8FAFC]'
            }`}
          >
            Alla
          </button>
          {branches.map(b => {
            const config = getBranchConfig(b!, b!)
            const Icon = config.icon
            return (
              <button
                key={b}
                onClick={() => setBranchFilter(b!)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  branchFilter === b
                    ? 'bg-[#0F766E] text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-[#F8FAFC]'
                }`}
              >
                <Icon className="w-3 h-3" />
                {b}
              </button>
            )
          })}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-[#0F766E]" />
        </div>
      )}

      {/* Empty state */}
      {!loading && templates.length === 0 && (
        <div className="mt-2">
          {/* Hero empty state */}
          <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-10 text-center mb-6">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-100 flex items-center justify-center mx-auto mb-5">
              <LayoutTemplate className="w-7 h-7 text-[#0F766E]" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Kom igång med offertmallar</h2>
            <p className="text-sm text-slate-500 max-w-lg mx-auto mb-6">
              Spara tid genom att skapa mallar med färdiga rader, texter och betalningsplaner.
              Välj en mall nästa gång du skapar en offert så är grunden redan lagd.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={seedTemplates}
                disabled={seeding}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#0F766E] text-white text-sm font-medium rounded-lg hover:bg-[#0D6B63] transition-colors"
              >
                {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Generera mallar för min bransch
              </button>
              <button
                onClick={createNew}
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-700 text-sm font-medium border border-slate-200 rounded-lg hover:bg-[#F8FAFC] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Skapa från grunden
              </button>
            </div>

            {/* What you get */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto text-left">
              {[
                { icon: FileText, text: 'Färdiga offertrader med grupper och delsummor' },
                { icon: CreditCard, text: 'Betalningsplan med delbetalningar inlagda' },
                { icon: CheckCircle2, text: 'ROT-avdrag och standardtexter förifyllda' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <item.icon className="w-4 h-4 text-[#0F766E] mt-0.5 flex-shrink-0" />
                  <span className="text-xs text-slate-500">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Ghost template previews */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <EmptyTemplateCard
              name="Standard byggoffert"
              category="Bygg"
              color="bg-amber-400"
              lines={['Rivning & demontering', 'Material', 'Arbete', 'Slutbesiktning']}
            />
            <EmptyTemplateCard
              name="Elinstallation"
              category="El"
              color="bg-yellow-400"
              lines={['Elmaterial', 'Installation', 'Besiktning']}
            />
            <EmptyTemplateCard
              name="VVS-jobb"
              category="VVS"
              color="bg-blue-400"
              lines={['Material', 'Arbete', 'Provtryckning']}
            />
          </div>
        </div>
      )}

      {/* Template grid */}
      {!loading && filteredTemplates.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map(template => {
            const config = getBranchConfig(template.branch, template.category)
            const BranchIcon = config.icon
            const lineItems = (template.default_items || []).filter((i: any) => i.item_type === 'item')
            const hasPaymentPlan = (template.default_payment_plan || []).length > 0

            return (
              <div
                key={template.id}
                onClick={() => router.push(`/dashboard/settings/quote-templates/${template.id}`)}
                className="bg-white border-thin border-[#E2E8F0] rounded-xl p-5 hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group relative"
              >
                {/* Favorite star */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(template.id) }}
                  className="absolute top-4 right-4"
                >
                  <Star
                    className={`w-4 h-4 transition-colors ${
                      template.is_favorite
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-slate-200 hover:text-amber-300 group-hover:text-slate-300'
                    }`}
                  />
                </button>

                {/* Category badge */}
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-6 h-6 rounded-lg ${config.bg} flex items-center justify-center`}>
                    <BranchIcon className={`w-3.5 h-3.5 ${config.color}`} />
                  </div>
                  <span className="text-[10px] tracking-wide uppercase text-slate-400 font-medium">
                    {template.category || template.branch || 'Mall'}
                  </span>
                </div>

                {/* Name & description */}
                <h3 className="text-sm font-semibold text-slate-900 mb-0.5 pr-6">{template.name}</h3>
                {template.description && (
                  <p className="text-xs text-slate-400 line-clamp-1 mb-0">{template.description}</p>
                )}

                {/* Mini preview */}
                <TemplatePreview
                  items={template.default_items || []}
                  rotEnabled={template.rot_enabled}
                />

                {/* Footer meta */}
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {hasPaymentPlan && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 bg-blue-50 text-blue-500 rounded">
                        Betalningsplan
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">
                      Använd {template.usage_count}×
                    </span>
                  </div>

                  {/* Quick actions */}
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); duplicateTemplate(template) }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                      title="Duplicera"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteTemplate(template.id) }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Ta bort"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Add new card */}
          {!atLimit && (
            <button
              onClick={createNew}
              className="border-2 border-dashed border-slate-200 rounded-xl p-5 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-[#0F766E] hover:border-[#0F766E]/30 hover:bg-teal-50/30 transition-all min-h-[200px]"
            >
              <Plus className="w-6 h-6" />
              <span className="text-sm font-medium">Ny mall</span>
            </button>
          )}
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
