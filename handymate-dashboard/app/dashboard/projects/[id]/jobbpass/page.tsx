'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Loader2, AlertTriangle, ArrowLeft, Check, Copy, ExternalLink,
  FileText, Sparkles, Wrench, ClipboardCheck, Receipt, Zap,
  Mail,
  Package,
} from 'lucide-react'
import type { JobbpassCustomerView } from '@/lib/jobbpass/jobbpass'

/**
 * Ägarens jobbpass-yta (Etapp Ä, Closeout-to-Lifetime). Öppnas från
 * jobbpass-förslagskortet (approval_type 'jobbpass_proposal') efter
 * projektavslut. Ägaren väljer vilka foton som får följa med, bockar i/ur
 * samtycke till framtida servicepåminnelse, ser exakt det kunden kommer
 * se — och publicerar när hen är nöjd.
 */

interface CandidatePhoto {
  id: string
  name: string | null
  url: string
}

interface JobbpassState {
  id: string
  status: 'draft' | 'published'
  token: string | null
  published_at: string | null
  selected_photo_ids: string[]
  service_consent: boolean
}

export default function JobbpassOwnerPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [jobbpass, setJobbpass] = useState<JobbpassState | null>(null)
  const [candidates, setCandidates] = useState<CandidatePhoto[]>([])
  const [preview, setPreview] = useState<JobbpassCustomerView | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [consent, setConsent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState('')
  const [notifying, setNotifying] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/projects/${projectId}/jobbpass`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Jobbpasset kunde inte läsas')
        return
      }
      setJobbpass(data.jobbpass)
      setCandidates(data.candidate_photos || [])
      setPreview(data.preview)
      setSelected(new Set(data.jobbpass.selected_photo_ids || []))
      setConsent(!!data.jobbpass.service_consent)
    } catch {
      setError('Något gick fel. Försök igen.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) load()
  }, [projectId, load])

  function togglePhoto(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    setNotice('')
    try {
      const res = await fetch(`/api/projects/${projectId}/jobbpass`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_photo_ids: Array.from(selected), service_consent: consent }),
      })
      const data = await res.json()
      if (!res.ok) {
        setNotice(data.error || 'Kunde inte spara')
        return
      }
      setJobbpass(data.jobbpass)
      await load()
      setNotice('Sparat.')
    } catch {
      setNotice('Något gick fel vid sparandet.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    setPublishing(true)
    setNotice('')
    try {
      // Spara alltid urvalet innan publicering, så det som publiceras är
      // exakt det ägaren senast valde.
      await fetch(`/api/projects/${projectId}/jobbpass`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_photo_ids: Array.from(selected), service_consent: consent }),
      })
      const res = await fetch(`/api/projects/${projectId}/jobbpass/publish`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setNotice(data.error || 'Publiceringen misslyckades')
        return
      }
      await load()
      setNotice('Jobbpasset är publicerat.')
    } catch {
      setNotice('Något gick fel vid publiceringen.')
    } finally {
      setPublishing(false)
    }
  }

  // Sanningsgrind 5 (2026-08-27): publicering och utskick är två handlingar.
  // Mejlet går bara när ägaren trycker här — genom portalens befintliga
  // utskicksgrind (kundens portal på, e-post finns, 1 h-dedup). Aldrig SMS.
  async function handleNotify() {
    setNotifying(true)
    setNotice('')
    try {
      const res = await fetch(`/api/projects/${projectId}/jobbpass/notify`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setNotice(data.error || 'Utskicket misslyckades')
        return
      }
      setNotice(data.message || 'Kunden har meddelats.')
    } catch {
      setNotice('Något gick fel vid utskicket.')
    } finally {
      setNotifying(false)
    }
  }

  function publicUrl(token: string): string {
    if (typeof window === 'undefined') return `/jobbpass/${token}`
    return `${window.location.origin}/jobbpass/${token}`
  }

  async function copyLink() {
    if (!jobbpass?.token) return
    try {
      await navigator.clipboard.writeText(publicUrl(jobbpass.token))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setNotice('Kunde inte kopiera länken — markera och kopiera manuellt.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  if (error || !jobbpass) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error || 'Jobbpasset kunde inte läsas.'}</p>
        </div>
      </div>
    )
  }

  const isPublished = jobbpass.status === 'published'

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      <button
        onClick={() => router.push(`/dashboard/projects/${projectId}`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Tillbaka till projektet
      </button>

      <h1 className="text-xl font-bold text-gray-900 mb-1">Jobbpass</h1>
      <p className="text-sm text-gray-500 mb-6">
        Välj vilka bilder som får följa med, kryssa i om kunden får en framtida servicepåminnelse — och publicera.
      </p>

      {isPublished && jobbpass.token && (
        <div className="mb-6 p-5 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <p className="text-sm font-semibold text-emerald-800 mb-2">Jobbpasset är publicerat.</p>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={publicUrl(jobbpass.token)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary-700 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Öppna kundens vy
            </a>
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-medium bg-white border border-emerald-200 rounded-lg text-emerald-700 hover:bg-emerald-50"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Kopierad' : 'Kopiera länk'}
            </button>
            <button
              onClick={handleNotify}
              disabled={notifying}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-medium bg-emerald-600 rounded-lg text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <Mail className="w-3.5 h-3.5" />
              {notifying ? 'Skickar...' : 'Meddela kunden via mejl'}
            </button>
          </div>
          <p className="text-xs text-emerald-700 mt-3">
            Publiceringen skickar inget själv. Kunden får mejlet med länk till jobbpasset i sin portal först när du trycker — och bara om kundportalen är på och kunden har en e-postadress.
          </p>
        </div>
      )}

      {/* Fotoval */}
      <section className="bg-white shadow-sm rounded-2xl border border-gray-200 p-5 sm:p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Bilder</h2>
        <p className="text-xs text-gray-500 mb-4">
          Bara de bilder du kryssar i visas för kunden. Opublicerade bilder följer aldrig med automatiskt.
        </p>
        {candidates.length === 0 ? (
          <p className="text-sm text-gray-400">Inga bilder uppladdade på projektet ännu.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {candidates.map(photo => {
              const isSelected = selected.has(photo.id)
              return (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => togglePhoto(photo.id)}
                  className={`relative rounded-xl overflow-hidden border-2 transition-colors ${
                    isSelected ? 'border-primary-600' : 'border-transparent'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.name || 'Projektfoto'} className="w-full h-28 object-cover bg-gray-50" />
                  <span
                    className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center border ${
                      isSelected ? 'bg-primary-700 border-primary-700' : 'bg-white/80 border-gray-300'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Samtycke */}
      <section className="bg-white shadow-sm rounded-2xl border border-gray-200 p-5 sm:p-6 mb-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={e => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-primary-700"
          />
          <span>
            <span className="block text-sm font-medium text-gray-900">Kunden får en framtida servicepåminnelse</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              Kryssa i bara om kunden uttryckligen sagt ja till att bli kontaktad om service och underhåll längre fram.
            </span>
          </span>
        </label>
      </section>

      {/* Förhandsgranskning */}
      {preview && <PreviewSummary preview={preview} />}

      {notice && <p className="text-sm text-gray-600 mb-4">{notice}</p>}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-3 min-h-[44px] bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {saving ? 'Sparar...' : 'Spara urval'}
        </button>
        <button
          onClick={handlePublish}
          disabled={publishing}
          className="px-5 py-3 min-h-[44px] bg-primary-700 hover:bg-primary-800 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
        >
          {publishing ? 'Publicerar...' : isPublished ? 'Publicera igen (uppdaterar inget — samma länk)' : 'Publicera jobbpass'}
        </button>
      </div>
    </div>
  )
}

function PreviewSummary({ preview }: { preview: JobbpassCustomerView }) {
  const rows: Array<{ icon: React.ElementType; label: string; value: string }> = []
  if (preview.scope) rows.push({ icon: FileText, label: 'Omfattning', value: `${preview.scope.items.length} poster från offerten` })
  if (preview.changes.length > 0) rows.push({ icon: Sparkles, label: 'Ändringar', value: `${preview.changes.length} godkända ÄTA` })
  if (preview.work_report) rows.push({ icon: Wrench, label: 'Utfört arbete', value: 'Signerad fältrapport ingår' })
  if (preview.checklists.length > 0) rows.push({ icon: ClipboardCheck, label: 'Egenkontroll', value: `${preview.checklists.length} checklista(or)` })
  if (preview.invoice_reference) rows.push({ icon: Receipt, label: 'Faktura', value: preview.invoice_reference.invoice_number || 'Referens finns' })
  if (preview.installations.length > 0) rows.push({ icon: Package, label: 'Sitter hos kunden', value: `${preview.installations.length} bekräftad${preview.installations.length === 1 ? '' : 'e'} installation${preview.installations.length === 1 ? '' : 'er'}` })
  if (preview.future_service.consent) rows.push({ icon: Zap, label: 'Service', value: 'Kunden har sagt ja till framtida servicepåminnelse' })

  return (
    <section className="bg-slate-50 rounded-2xl border border-gray-200 p-5 sm:p-6 mb-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Så här ser kundens jobbpass ut</h2>
      <p className="text-xs text-gray-500 mb-4">
        Bara det som faktiskt finns underlag för visas — inget hittat på.{' '}
        <Link href={`/dashboard/projects/${preview.project.project_id}/installationer`} className="text-primary-700 hover:underline">Installationer →</Link>
      </p>
      <ul className="space-y-2.5">
        {rows.map((row, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <row.icon className="w-4 h-4 text-primary-700 shrink-0 mt-0.5" />
            <span>
              <span className="font-medium text-gray-800">{row.label}:</span>{' '}
              <span className="text-gray-600">{row.value}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
