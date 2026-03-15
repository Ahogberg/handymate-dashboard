'use client'

import { useEffect, useState } from 'react'
import { useBusiness } from '@/lib/BusinessContext'
import { useBusinessPlan } from '@/lib/useBusinessPlan'
import UpgradePrompt from '@/components/UpgradePrompt'
import { getImagesForBranch, type IndustryImage } from '@/lib/industry-images'
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
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  X,
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
  certifications: string | null
  created_at: string
  updated_at: string
}

interface BusinessConfig {
  business_name: string
  contact_name: string
  contact_email: string
  phone_number: string
  address: string
  service_area: string
  branch: string
  services_offered: string[]
  working_hours: Record<string, { enabled: boolean; start: string; end: string }> | null
}

interface WorkingDay {
  enabled: boolean
  start: string
  end: string
}

const COLOR_OPTIONS = [
  { id: 'blue', label: 'Blå', color: '#2563eb', gradient: 'from-teal-700 via-blue-700 to-indigo-900' },
  { id: 'green', label: 'Grön', color: '#059669', gradient: 'from-green-600 via-emerald-700 to-teal-900' },
  { id: 'teal', label: 'Teal', color: '#0d9488', gradient: 'from-teal-600 via-teal-700 to-teal-900' },
  { id: 'orange', label: 'Orange', color: '#ea580c', gradient: 'from-orange-500 via-orange-600 to-red-800' },
  { id: 'slate', label: 'Mörk', color: '#334155', gradient: 'from-slate-700 via-slate-800 to-gray-900' },
]

const DAY_NAMES: Record<string, string> = {
  monday: 'Mån',
  tuesday: 'Tis',
  wednesday: 'Ons',
  thursday: 'Tor',
  friday: 'Fre',
  saturday: 'Lör',
  sunday: 'Sön',
}

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

// ─── Completeness checks ─────────────────────────────────────────

interface CheckItem {
  label: string
  done: boolean
  weight: number
  fixHint?: string
}

function getCompletenessItems(
  storefront: Storefront | null,
  config: BusinessConfig | null,
  editHeadline: string,
  editDescription: string,
  editAbout: string,
  editHeroImageUrl: string | null,
  editCertifications: string,
): CheckItem[] {
  const businessName = config?.business_name || ''
  const isNameOk = businessName.length >= 4 && !/^test/i.test(businessName.trim())

  const hasWorkingHours = config?.working_hours
    ? Object.values(config.working_hours).some((d: WorkingDay | null) => d?.enabled)
    : false

  return [
    { label: 'Företagsnamn', done: isNameOk, weight: 1, fixHint: !isNameOk ? 'Ändra i Inställningar' : undefined },
    { label: 'Rubrik', done: editHeadline.length > 3, weight: 1 },
    { label: 'Beskrivning', done: editDescription.length > 10, weight: 1 },
    { label: 'Telefonnummer', done: !!(config?.phone_number), weight: 1, fixHint: !config?.phone_number ? 'Lägg till i Inställningar' : undefined },
    { label: 'E-post', done: !!(config?.contact_email), weight: 0.5, fixHint: !config?.contact_email ? 'Lägg till i Inställningar' : undefined },
    { label: 'Serviceområde', done: !!(config?.service_area), weight: 0.5, fixHint: !config?.service_area ? 'Lägg till i Inställningar' : undefined },
    { label: 'Öppettider', done: hasWorkingHours, weight: 0.5, fixHint: !hasWorkingHours ? 'Ställ in i Inställningar' : undefined },
    { label: 'Hero-bild', done: !!editHeroImageUrl, weight: 1.5 },
    { label: 'Färgschema', done: true, weight: 0.5 },
    { label: 'Tjänster', done: (config?.services_offered?.length || 0) > 0, weight: 1, fixHint: (config?.services_offered?.length || 0) === 0 ? 'Lägg till i Inställningar' : undefined },
    { label: 'Om oss-text', done: editAbout.length > 20, weight: 1 },
    { label: 'Certifieringar', done: editCertifications.trim().length > 0, weight: 0.5 },
  ]
}

function calculateCompleteness(items: CheckItem[]): number {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0)
  const doneWeight = items.reduce((sum, item) => sum + (item.done ? item.weight : 0), 0)
  return totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 0
}

// ─── Collapsible section ─────────────────────────────────────────

function SectionCard({
  title,
  completionText,
  defaultOpen = false,
  children,
}: {
  title: string
  completionText?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {completionText && (
            <span className="text-xs text-gray-400 font-normal">{completionText}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">{children}</div>}
    </div>
  )
}

// ─── ReadOnlyField ──────────────────────────────────────────────

function ReadOnlyField({ label, value, missing }: { label: string; value?: string | null; missing?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {value ? (
        <p className="text-sm text-gray-900 bg-gray-50 rounded-lg px-3 py-2">{value}</p>
      ) : (
        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {missing || 'Ej angiven'}
          <a href="/dashboard/settings" className="ml-auto text-teal-600 hover:underline text-xs font-medium">Inställningar</a>
        </div>
      )}
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────

export default function WebsitePage() {
  const business = useBusiness()
  const { hasFeature } = useBusinessPlan()
  const [loading, setLoading] = useState(true)
  const [storefront, setStorefront] = useState<Storefront | null>(null)
  const [businessConfig, setBusinessConfig] = useState<BusinessConfig | null>(null)
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
  const [editHeroImageUrl, setEditHeroImageUrl] = useState<string | null>(null)
  const [editCertifications, setEditCertifications] = useState('')
  const [customImageUrl, setCustomImageUrl] = useState('')

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ show: true, message, type })
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000)
  }

  useEffect(() => {
    fetchStorefront()
    fetchBusinessConfig()
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

  async function fetchBusinessConfig() {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        if (data.config) {
          setBusinessConfig({
            business_name: data.config.business_name || '',
            contact_name: data.config.contact_name || '',
            contact_email: data.config.contact_email || '',
            phone_number: data.config.phone_number || '',
            address: data.config.address || '',
            service_area: data.config.service_area || '',
            branch: data.config.branch || '',
            services_offered: data.config.services_offered || [],
            working_hours: data.config.working_hours || null,
          })
        }
      }
    } catch {
      // ignore
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
    setEditHeroImageUrl(sf.hero_image_url || null)
    setEditCertifications(sf.certifications || '')
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
          hero_image_url: editHeroImageUrl,
          certifications: editCertifications,
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
      if (sectionId === 'hero') return prev
      if (prev.includes(sectionId)) {
        return prev.filter(s => s !== sectionId)
      }
      return [...prev, sectionId]
    })
  }

  const siteUrl = storefront?.slug
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/site/${storefront.slug}`
    : ''

  // Completeness
  const completenessItems = getCompletenessItems(
    storefront, businessConfig,
    editHeadline, editDescription, editAbout,
    editHeroImageUrl, editCertifications,
  )
  const completeness = calculateCompleteness(completenessItems)
  const missingItems = completenessItems.filter(i => !i.done)

  // Industry images for picker
  const branchImages: IndustryImage[] = getImagesForBranch(businessConfig?.branch)

  // Working hours summary
  const workingHoursSummary = businessConfig?.working_hours
    ? DAY_ORDER
        .filter(day => (businessConfig.working_hours as Record<string, WorkingDay | null>)?.[day]?.enabled)
        .map(day => {
          const d = (businessConfig.working_hours as Record<string, WorkingDay>)[day]
          return `${DAY_NAMES[day]} ${d.start}-${d.end}`
        })
        .join(' | ')
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
          <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl border ${
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
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl border ${
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
            {/* ── Completeness indicator ── */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">Din hemsida är {completeness}% klar</h3>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-sky-700 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
                  Regenerera med AI
                </button>
              </div>
              {/* Progress bar */}
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    completeness >= 80 ? 'bg-emerald-500' : completeness >= 50 ? 'bg-teal-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${completeness}%` }}
                />
              </div>
              {missingItems.length > 0 && (
                <p className="text-sm text-gray-500">
                  Saknas: {missingItems.map(i => i.label).join(' · ')}
                </p>
              )}
            </div>

            {/* ── Business name warning ── */}
            {businessConfig && /^test/i.test(businessConfig.business_name.trim()) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Ditt företagsnamn ser ut som ett test: &quot;{businessConfig.business_name}&quot;
                  </p>
                  <p className="text-sm text-amber-600 mt-1">
                    Uppdatera det i <a href="/dashboard/settings" className="underline font-medium">Inställningar</a> innan du publicerar.
                  </p>
                </div>
              </div>
            )}

            {/* ── Card 1: Grundinfo ── */}
            <SectionCard
              title="Grundinfo"
              completionText={`${completenessItems.filter((i, idx) => idx < 7 && i.done).length}/7 klara`}
              defaultOpen={true}
            >
              {/* Editable: Headline */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rubrik</label>
                <input
                  type="text"
                  value={editHeadline}
                  onChange={e => setEditHeadline(e.target.value)}
                  placeholder="Din slagkraftiga rubrik..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>

              {/* Editable: Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivning</label>
                <textarea
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  rows={3}
                  placeholder="Kort beskrivning av ditt företag..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Read-only fields from business_config */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                <ReadOnlyField label="Företagsnamn" value={businessConfig?.business_name} missing="Ej angivet" />
                <ReadOnlyField label="Telefonnummer" value={businessConfig?.phone_number} missing="Lägg till telefonnummer" />
                <ReadOnlyField label="E-post" value={businessConfig?.contact_email} missing="Lägg till e-post" />
                <ReadOnlyField label="Serviceområde" value={businessConfig?.service_area} missing="Lägg till serviceområde" />
              </div>

              {/* Working hours summary */}
              <div className="pt-2 border-t border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-1">Öppettider</label>
                {workingHoursSummary ? (
                  <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <p className="text-sm text-gray-900">{workingHoursSummary}</p>
                    <a href="/dashboard/settings" className="text-teal-600 hover:underline text-xs font-medium">Ändra</a>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Inga öppettider inställda
                    <a href="/dashboard/settings" className="ml-auto text-teal-600 hover:underline text-xs font-medium">Inställningar</a>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* ── Card 2: Visuellt ── */}
            <SectionCard
              title="Visuellt"
              completionText={`${[completenessItems[7], completenessItems[8]].filter(i => i.done).length}/2 klara`}
            >
              {/* Hero image picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Hero-bild</label>
                <div className="grid grid-cols-3 gap-3">
                  {branchImages.map((img) => (
                    <button
                      key={img.url}
                      onClick={() => setEditHeroImageUrl(img.url)}
                      className={`relative rounded-xl overflow-hidden aspect-video border-2 transition-all ${
                        editHeroImageUrl === img.url ? 'border-teal-500 ring-2 ring-teal-500/30' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <img src={img.url.replace('w=1920', 'w=400')} alt={img.label} className="w-full h-full object-cover" loading="lazy" />
                      {editHeroImageUrl === img.url && (
                        <div className="absolute inset-0 bg-teal-500/20 flex items-center justify-center">
                          <Check className="w-8 h-8 text-white drop-shadow-lg" />
                        </div>
                      )}
                      <span className="absolute bottom-1 left-1 right-1 text-xs text-white bg-black/50 rounded px-1.5 py-0.5 truncate">
                        {img.label}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Custom URL */}
                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="url"
                    value={customImageUrl}
                    onChange={e => setCustomImageUrl(e.target.value)}
                    placeholder="Eller klistra in en egen bild-URL..."
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => {
                      if (customImageUrl.trim()) {
                        setEditHeroImageUrl(customImageUrl.trim())
                        setCustomImageUrl('')
                      }
                    }}
                    disabled={!customImageUrl.trim()}
                    className="px-3 py-2 bg-teal-600 text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    Använd
                  </button>
                </div>

                {editHeroImageUrl && (
                  <button
                    onClick={() => setEditHeroImageUrl(null)}
                    className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700 mt-2"
                  >
                    <X className="w-3.5 h-3.5" />
                    Ta bort bild
                  </button>
                )}
              </div>

              {/* Color scheme */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Färgschema</label>
                <div className="grid grid-cols-5 gap-3">
                  {COLOR_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setEditColorScheme(opt.id)}
                      className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                        editColorScheme === opt.id ? 'border-teal-500 ring-2 ring-teal-500/30' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`h-16 bg-gradient-to-br ${opt.gradient}`} />
                      <div className="px-2 py-1.5 text-center">
                        <span className="text-xs font-medium text-gray-700">{opt.label}</span>
                      </div>
                      {editColorScheme === opt.id && (
                        <div className="absolute top-1 right-1">
                          <Check className="w-4 h-4 text-white drop-shadow-lg" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </SectionCard>

            {/* ── Card 3: Innehåll ── */}
            <SectionCard
              title="Innehåll"
              completionText={`${[completenessItems[9], completenessItems[10]].filter(i => i.done).length}/2 klara`}
            >
              {/* Services (read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tjänster</label>
                {(businessConfig?.services_offered?.length || 0) > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {businessConfig!.services_offered.map(s => (
                      <span key={s} className="px-3 py-1.5 bg-teal-50 text-teal-700 rounded-lg text-sm font-medium">{s}</span>
                    ))}
                    <a href="/dashboard/settings" className="px-3 py-1.5 border border-dashed border-gray-300 text-gray-400 rounded-lg text-sm hover:border-teal-300 hover:text-teal-600 transition-colors">
                      + Redigera
                    </a>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Inga tjänster tillagda
                    <a href="/dashboard/settings" className="ml-auto text-teal-600 hover:underline text-xs font-medium">Inställningar</a>
                  </div>
                )}
              </div>

              {/* About text (editable) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Om oss</label>
                <textarea
                  value={editAbout}
                  onChange={e => setEditAbout(e.target.value)}
                  rows={6}
                  placeholder="Beskriv ditt företag, er erfarenhet och vad som gör er unika..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                />
              </div>
            </SectionCard>

            {/* ── Card 4: Socialt bevis ── */}
            <SectionCard
              title="Socialt bevis"
              completionText={`${completenessItems[11].done ? '1' : '0'}/1 klart`}
            >
              {/* Certifications */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Certifieringar</label>
                <textarea
                  value={editCertifications}
                  onChange={e => setEditCertifications(e.target.value)}
                  rows={2}
                  placeholder="T.ex. Auktoriserad elektriker, F-skattsedel, Behörig elinstallatör..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">Separera med kommatecken. Visas som trust-badges på hemsidan.</p>
              </div>

              {/* Google Reviews status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Google Reviews</label>
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600">
                  Recensioner hämtas automatiskt om du har Google Reviews-koppling.
                </div>
              </div>
            </SectionCard>

            {/* ── Card 5: URL & SEO ── */}
            <SectionCard title="URL & SEO">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL</label>
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
            </SectionCard>

            {/* ── Card 6: Alternativ ── */}
            <SectionCard title="Alternativ">
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

              {/* Sections toggle */}
              <div className="pt-2 border-t border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-2">Sektioner som visas</label>
                <div className="space-y-2">
                  {['hero', 'services', 'about', 'gallery', 'reviews', 'contact'].map(sectionId => (
                    <label key={sectionId} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={editSections.includes(sectionId)}
                        onChange={() => toggleSection(sectionId)}
                        disabled={sectionId === 'hero'}
                        className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                      />
                      <span className="text-sm text-gray-700">
                        {({ hero: 'Hero', services: 'Tjänster', about: 'Om oss', gallery: 'Bildgalleri', reviews: 'Recensioner', contact: 'Kontakt' } as Record<string, string>)[sectionId] || sectionId}
                      </span>
                      {sectionId === 'hero' && <span className="text-xs text-gray-400">(alltid synlig)</span>}
                    </label>
                  ))}
                </div>
              </div>
            </SectionCard>

            {/* Save button */}
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
