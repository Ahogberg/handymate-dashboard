'use client'

import { useState, useEffect } from 'react'
import { FileStack, Loader2, X, Trash2, Star, Wrench, Package } from 'lucide-react'
import type { QuoteTemplate } from '@/lib/types/quote'
import type { QuoteSetupData } from '@/lib/quotes/job-type-setup'

interface TemplateSelectorProps {
  onSelect: (template: QuoteTemplate) => void
  onBack: () => void
}

type Mall = QuoteTemplate & { job_type_slug?: string | null }

/**
 * Mallväljaren grupperar på JOBBTYP (2026-09-17, Andreas: "skapa och sortera
 * grupper för offertmallar"). Gruppen är inte ett nytt begrepp — det är
 * jobbtyperna kunden redan valde i onboardingen, i den ordning de sorterats
 * i Inställningar → Jobbtyper. En mall hamnar under sin jobbtyp via
 * quote_templates.job_type_slug (v187), och kopplingen görs här, där man
 * står, med "Lägg under …" — inte bara i inställningarna där ingen hittade
 * den. Okopplade mallar ligger sist under "Övriga mallar".
 *
 * Kategorichipsen (mallbankens etikett) finns kvar som filter inuti.
 * Utan jobbtypsdata (ingen behörighet, okörd migration, läsfel) faller
 * väljaren tillbaka till den platta listan — samma som förut.
 */
export default function TemplateSelector({ onSelect, onBack }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<Mall[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [seedDone, setSeedDone] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [setup, setSetup] = useState<(QuoteSetupData & { canManage?: boolean }) | null>(null)
  const [kopplar, setKopplar] = useState<string | null>(null)
  const [kopplingsfel, setKopplingsfel] = useState('')

  useEffect(() => {
    fetchTemplates()
    fetchSetup()
  }, [])

  async function fetchTemplates() {
    try {
      const res = await fetch('/api/quote-templates')
      const data = await res.json()
      // Tomma mallar (inga rader) döljs i VÄLJAREN — en mall utan innehåll
      // går inte att starta en offert från. Vanligaste källan: "Ny mall"-
      // knappen i Inställningar skapar en tom rad direkt som blir kvar om
      // redigeringen överges (Andreas skärmdump 2026-08-03 visade två
      // sådana). De syns och kan redigeras/raderas i Inställningar →
      // Offertmallar som vanligt.
      const all: Mall[] = data.templates || []
      setTemplates(all.filter(t => (t.default_items || []).some(i => i.item_type === 'item')))
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    }
    setLoading(false)
  }

  // Jobbtyperna i inställningarnas ordning + om den här användaren får
  // koppla. 403/503 är inte ett fel för väljaren — bara ingen gruppering.
  async function fetchSetup() {
    try {
      const res = await fetch('/api/job-types/quote-setup', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      if (data && data.linkingAvailable && Array.isArray(data.jobTypes)) setSetup(data)
    } catch {
      /* platt lista */
    }
  }

  // Befintliga konton fick aldrig mallbank-seeden (17 branschmallar) — den
  // kördes bara vid onboarding för NYA konton efter 2026-07-21. Erbjud den
  // direkt i väljaren (idempotent server-side: redan-seedade namn hoppas
  // över, dubbelklick är ofarligt).
  async function seedTemplates() {
    setSeeding(true)
    try {
      const res = await fetch('/api/quote-templates/seed', { method: 'POST' })
      if (res.ok) {
        setSeedDone(true)
        await fetchTemplates()
      }
    } catch (err) {
      console.error('Failed to seed templates:', err)
    }
    setSeeding(false)
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

  // "Lägg under …": samma PUT som inställningarna, med mallens version som
  // villkor (CAS) — en mall någon annan just ändrat kopplas inte om i blindo.
  async function kopplaTillJobbtyp(mall: Mall, jobTypeSlug: string | null) {
    setKopplar(mall.id)
    setKopplingsfel('')
    try {
      const res = await fetch('/api/job-types/quote-setup', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: mall.id, jobTypeSlug, updatedAt: mall.updated_at ?? null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setKopplingsfel(data.error || 'Kunde inte koppla mallen.')
        return
      }
      if (data.template) {
        setTemplates(prev => prev.map(t => (t.id === mall.id ? { ...t, job_type_slug: data.template.job_type_slug ?? null, updated_at: data.template.updated_at } : t)))
      }
    } catch {
      setKopplingsfel('Kunde inte koppla mallen. Försök igen.')
    } finally {
      setKopplar(null)
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

  // Sektioner i jobbtypernas egen ordning (job_types.sort_order, sorterat
  // server-side i loadQuoteSetup). Tomma sektioner visas inte — en rubrik
  // utan mallar säger bara "här finns inget".
  const jobbtyper = setup?.jobTypes ?? []
  const sektioner: { slug: string | null; namn: string; mallar: Mall[] }[] = jobbtyper.length
    ? [
        ...jobbtyper.map(j => ({ slug: j.slug as string | null, namn: j.name, mallar: sortedTemplates.filter(t => t.job_type_slug === j.slug) })),
        { slug: null, namn: 'Övriga mallar', mallar: sortedTemplates.filter(t => !t.job_type_slug || !jobbtyper.some(j => j.slug === t.job_type_slug)) },
      ].filter(sek => sek.mallar.length > 0)
    : [{ slug: null, namn: '', mallar: sortedTemplates }]
  const kanKoppla = Boolean(setup?.canManage) && jobbtyper.length > 0

  function rad(t: Mall) {
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
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary-100 text-primary-700 rounded">
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
        {kanKoppla && (
          <select
            aria-label={`Lägg ${t.name} under jobbtyp`}
            value={t.job_type_slug ?? ''}
            disabled={kopplar === t.id}
            onChange={e => void kopplaTillJobbtyp(t, e.target.value || null)}
            onClick={e => e.stopPropagation()}
            className="max-w-[9.5rem] min-h-[44px] sm:min-h-0 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-600 disabled:opacity-50"
          >
            <option value="">Lägg under…</option>
            {jobbtyper.map(j => <option key={j.id} value={j.slug}>{j.name}</option>)}
          </select>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id) }}
          className="p-2 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    )
  }

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

      {kopplingsfel && (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{kopplingsfel}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
        </div>
      ) : sortedTemplates.length === 0 ? (
        <div className="text-center py-8">
          <FileStack className="w-10 h-10 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-400">Inga mallar ännu.</p>
          {!seedDone && (
            <button
              onClick={seedTemplates}
              disabled={seeding}
              className="mt-3 px-4 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 transition-colors disabled:opacity-50"
            >
              {seeding ? 'Hämtar…' : 'Hämta färdiga mallar för din bransch'}
            </button>
          )}
          <p className="text-xs text-gray-400 mt-2">Eller spara en offert som mall för att komma igång.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sektioner.map(sek => (
            <section key={sek.slug ?? '__ovriga'} aria-label={sek.namn || 'Mallar'} className="space-y-2">
              {sek.namn && (
                <h3 className="px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{sek.namn}</h3>
              )}
              {sek.mallar.map(rad)}
            </section>
          ))}

          {/* Seed-CTA även när några mallar finns men branschbanken saknas —
              befintliga konton (pre 2026-07-21) fick aldrig seeden vid
              onboarding. Tröskel <5: efter seed har även minsta bransch
              fler, så knappen försvinner av sig själv. */}
          {sortedTemplates.length < 5 && !seedDone && (
            <button
              onClick={seedTemplates}
              disabled={seeding}
              className="w-full p-4 border border-dashed border-primary-300 rounded-xl text-sm font-medium text-primary-700 hover:bg-primary-50 transition-colors disabled:opacity-50"
            >
              {seeding ? 'Hämtar…' : 'Hämta färdiga mallar för din bransch'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
