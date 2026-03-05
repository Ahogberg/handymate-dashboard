'use client'

import { useEffect, useState } from 'react'
import { useBusiness } from '@/lib/BusinessContext'
import { useBusinessPlan } from '@/lib/useBusinessPlan'
import UpgradePrompt from '@/components/UpgradePrompt'
import {
  Globe,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Eye,
  Pencil,
  BarChart3,
  CheckCircle2,
  Rocket,
  Lock,
  MessageCircle,
  FileText,
  Star,
  Image,
  Palette,
} from 'lucide-react'

interface Storefront {
  id: string
  slug: string
  is_published: boolean
  hero_headline: string
  hero_description: string
  about_text: string
  hero_image_url: string | null
  gallery_images: string[]
  color_scheme: string
  service_descriptions: Record<string, string>
  meta_title: string
  meta_description: string
  sections: string[]
  show_chat_widget: boolean
  page_views: number
  contact_form_submissions: number
  created_at: string
  updated_at: string
}

const COLOR_OPTIONS = [
  { id: 'blue', label: 'Blå', color: '#2563eb' },
  { id: 'green', label: 'Grön', color: '#059669' },
  { id: 'teal', label: 'Teal', color: '#0d9488' },
  { id: 'orange', label: 'Orange', color: '#ea580c' },
  { id: 'slate', label: 'Mörk', color: '#334155' },
]

const SECTION_LABELS: Record<string, string> = {
  hero: 'Hero',
  services: 'Tjänster',
  about: 'Om oss',
  gallery: 'Bildgalleri',
  reviews: 'Recensioner',
  contact: 'Kontakt',
}

export default function WebsitePage() {
  const business = useBusiness()
  const { hasFeature } = useBusinessPlan()
  const [loading, setLoading] = useState(true)
  const [storefront, setStorefront] = useState<Storefront | null>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'edit' | 'stats'>('preview')
  const [slugCopied, setSlugCopied] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  // Edit form state
  const [editSlug, setEditSlug] = useState('')
  const [editHeadline, setEditHeadline] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editAbout, setEditAbout] = useState('')
  const [editColorScheme, setEditColorScheme] = useState('blue')
  const [editMetaTitle, setEditMetaTitle] = useState('')
  const [editMetaDescription, setEditMetaDescription] = useState('')
  const [editShowWidget, setEditShowWidget] = useState(false)
  const [editSections, setEditSections] = useState<string[]>([])
  const [editPublished, setEditPublished] = useState(true)

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ show: true, message, type })
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000)
  }

  useEffect(() => {
    fetchStorefront()
  }, [])

  async function fetchStorefront() {
    try {
      const res = await fetch('/api/storefront')
      if (res.ok) {
        const data = await res.json()
        if (data.storefront) {
          setStorefront(data.storefront)
          populateEditForm(data.storefront)
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  function populateEditForm(sf: Storefront) {
    setEditSlug(sf.slug || '')
    setEditHeadline(sf.hero_headline || '')
    setEditDescription(sf.hero_description || '')
    setEditAbout(sf.about_text || '')
    setEditColorScheme(sf.color_scheme || 'blue')
    setEditMetaTitle(sf.meta_title || '')
    setEditMetaDescription(sf.meta_description || '')
    setEditShowWidget(sf.show_chat_widget || false)
    setEditSections(sf.sections || ['hero', 'services', 'about', 'gallery', 'reviews', 'contact'])
    setEditPublished(sf.is_published)
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/storefront/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        showToast('Hemsida skapad!')
        await fetchStorefront()
        setActiveTab('preview')
      } else {
        const data = await res.json()
        showToast(data.error || 'Kunde inte skapa hemsida', 'error')
      }
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/storefront', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: editSlug,
          is_published: editPublished,
          hero_headline: editHeadline,
          hero_description: editDescription,
          about_text: editAbout,
          color_scheme: editColorScheme,
          meta_title: editMetaTitle,
          meta_description: editMetaDescription,
          show_chat_widget: editShowWidget,
          sections: editSections,
        }),
      })
      if (res.ok) {
        showToast('Ändringar sparade!')
        await fetchStorefront()
      } else {
        const data = await res.json()
        showToast(data.error || 'Kunde inte spara', 'error')
      }
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setSaving(false)
    }
  }

  function toggleSection(sectionId: string) {
    setEditSections(prev => {
      if (sectionId === 'hero') return prev // Hero always visible
      if (prev.includes(sectionId)) {
        return prev.filter(s => s !== sectionId)
      }
      return [...prev, sectionId]
    })
  }

  const siteUrl = storefront?.slug
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/site/${storefront.slug}`
    : ''

  // Feature gate check
  if (!hasFeature('storefront_basic')) {
    return (
      <div className="p-8">
        <UpgradePrompt featureKey="storefront_basic" />
      </div>
    )
  }

  // Plan-based locked sections for Starter
  const isStarterPlan = (business.plan || 'starter') === 'starter'
  const lockedSections = isStarterPlan ? [
    { icon: MessageCircle, label: 'AI-chatbot', description: 'Fånga leads dygnet runt', featureKey: 'storefront_chatbot' },
    { icon: FileText, label: 'Kontaktformulär', description: 'Leads direkt i din pipeline', featureKey: 'storefront_contact_form' },
    { icon: Star, label: 'Recensioner', description: 'Visa dina recensioner och bygg förtroende', featureKey: 'storefront_reviews' },
    { icon: Image, label: 'Bildgalleri', description: 'Visa upp dina bästa projekt', featureKey: 'storefront_customization' },
    { icon: Palette, label: 'Färgschema', description: 'Matcha din profil', featureKey: 'storefront_customization' },
  ] : []

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    )
  }

  // ─── Not created yet ───────────────────────────────────────
  if (!storefront) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen">
        {toast.show && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
            toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-red-100 border-red-200 text-red-600'
          }`}>{toast.message}</div>
        )}
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Globe className="w-8 h-8 text-teal-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Din hemsida</h1>
          <p className="text-gray-500 text-lg mb-8">
            Skapa en professionell hemsida på 30 sekunder. Vi bygger den automatiskt från din företagsprofil.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto mb-10 text-left">
            {[
              'Dina tjänster och priser visas',
              'Google-recensioner hämtas automatiskt',
              'Kontaktformulär skickar leads till din pipeline',
              'AI-chatbot kan aktiveras',
              'Uppdateras automatiskt',
            ].map(item => (
              <div key={item} className="flex items-center gap-2 text-sm text-gray-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center px-8 py-4 bg-teal-600 rounded-xl font-semibold text-white text-lg hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-teal-500/25"
          >
            {generating ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Rocket className="w-5 h-5 mr-2" />
            )}
            {generating ? 'Skapar din hemsida...' : 'Skapa min hemsida'}
          </button>
        </div>
      </div>
    )
  }

  // ─── Dashboard view (created) ──────────────────────────────
  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-red-100 border-red-200 text-red-600'
        }`}>{toast.message}</div>
      )}

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Din hemsida</h1>
            <div className="flex items-center gap-2 mt-1">
              <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-sky-700 hover:text-teal-700 flex items-center gap-1">
                {siteUrl} <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(siteUrl)
                  setSlugCopied(true)
                  setTimeout(() => setSlugCopied(false), 2000)
                }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                {slugCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              storefront.is_published ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {storefront.is_published ? 'Publicerad' : 'Utkast'}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
          {[
            { id: 'preview' as const, label: 'Förhandsgranska', icon: Eye },
            { id: 'edit' as const, label: 'Redigera', icon: Pencil },
            { id: 'stats' as const, label: 'Statistik', icon: BarChart3 },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ═══ Preview Tab ═══ */}
        {activeTab === 'preview' && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="p-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs text-gray-400 font-mono">{siteUrl}</span>
              <a href={siteUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-700 flex items-center gap-1">
                Öppna i ny flik <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <iframe
              src={`/site/${storefront.slug}`}
              className="w-full h-[700px] border-0"
              title="Förhandsgranska hemsida"
            />
          </div>
        )}

        {/* ═══ Edit Tab ═══ */}
        {activeTab === 'edit' && (
          <div className="space-y-6">
            {/* URL */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">URL</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">{typeof window !== 'undefined' ? window.location.origin : ''}/site/</span>
                <input
                  type="text"
                  value={editSlug}
                  onChange={e => setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Content */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Innehåll</h3>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-sky-700 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
                  Regenerera med AI
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rubrik</label>
                <input
                  type="text"
                  value={editHeadline}
                  onChange={e => setEditHeadline(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivning</label>
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Om oss</label>
                <textarea
                  value={editAbout}
                  onChange={e => setEditAbout(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            {/* Design */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">Design</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Färgschema</label>
                <div className="flex gap-3">
                  {COLOR_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setEditColorScheme(opt.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                        editColorScheme === opt.id ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="w-5 h-5 rounded-full" style={{ backgroundColor: opt.color }} />
                      <span className="text-sm">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Sections */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">Sektioner</h3>
              <p className="text-sm text-gray-500">Välj vilka sektioner som visas på hemsidan</p>
              <div className="space-y-2">
                {['hero', 'services', 'about', 'gallery', 'reviews', 'contact'].map(sectionId => (
                  <label key={sectionId} className="flex items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      checked={editSections.includes(sectionId)}
                      onChange={() => toggleSection(sectionId)}
                      disabled={sectionId === 'hero'}
                      className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-700">{SECTION_LABELS[sectionId] || sectionId}</span>
                    {sectionId === 'hero' && <span className="text-xs text-gray-400">(alltid synlig)</span>}
                  </label>
                ))}
              </div>
            </div>

            {/* SEO */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">SEO</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SEO-titel (max 60 tecken)</label>
                <input
                  type="text"
                  value={editMetaTitle}
                  onChange={e => setEditMetaTitle(e.target.value)}
                  maxLength={60}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">{editMetaTitle.length}/60</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SEO-beskrivning (max 160 tecken)</label>
                <textarea
                  value={editMetaDescription}
                  onChange={e => setEditMetaDescription(e.target.value)}
                  maxLength={160}
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">{editMetaDescription.length}/160</p>
              </div>
            </div>

            {/* Options */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <h3 className="font-semibold text-gray-900">Alternativ</h3>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={editShowWidget}
                  onChange={e => setEditShowWidget(e.target.checked)}
                  className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">Visa AI-chatbot på hemsidan</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={editPublished}
                  onChange={e => setEditPublished(e.target.checked)}
                  className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                />
                <span className="text-sm text-gray-700">Publicerad (synlig för besökare)</span>
              </label>
            </div>

            {/* Save */}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center px-6 py-3 bg-teal-600 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                Spara ändringar
              </button>
            </div>
          </div>
        )}

        {/* ═══ Stats Tab ═══ */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <p className="text-sm text-gray-500 mb-1">Sidvisningar</p>
                <p className="text-3xl font-bold text-gray-900">{storefront.page_views}</p>
                <p className="text-xs text-gray-400 mt-1">Totalt sedan publicering</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <p className="text-sm text-gray-500 mb-1">Kontaktförfrågningar</p>
                <p className="text-3xl font-bold text-gray-900">{storefront.contact_form_submissions}</p>
                <p className="text-xs text-gray-400 mt-1">Leads genererade via formuläret</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Konverteringsgrad</h3>
              <p className="text-2xl font-bold text-gray-900">
                {storefront.page_views > 0
                  ? ((storefront.contact_form_submissions / storefront.page_views) * 100).toFixed(1)
                  : '0.0'}%
              </p>
              <p className="text-sm text-gray-500 mt-1">Andel besökare som skickat en förfrågan</p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500">
              Detaljerad daglig statistik och Google Analytics-koppling kommer i en framtida uppdatering.
            </div>
          </div>
        )}

        {/* ═══ Locked sections for Starter ═══ */}
        {lockedSections.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Uppgradera din hemsida</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {lockedSections.map((section) => (
                <div key={section.label} className="bg-white rounded-2xl border border-gray-200 p-5 opacity-75">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                      <section.icon className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900 text-sm">{section.label}</h3>
                        <Lock className="w-3.5 h-3.5 text-gray-400" />
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mb-3">{section.description}</p>
                  <UpgradePrompt featureKey={section.featureKey} inline />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
