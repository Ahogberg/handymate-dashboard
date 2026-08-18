'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Loader2, AlertTriangle, CheckCircle2, FileText, Wrench, ClipboardCheck,
  Receipt, ShieldCheck, Image as ImageIcon, Sparkles, Zap,
} from 'lucide-react'
import type { JobbpassCustomerView } from '@/lib/jobbpass/jobbpass'

/**
 * Publik jobbpass-portal (Etapp Ä, Closeout-to-Lifetime). Samma
 * publika-länk-idiom som app/quote/[token]/page.tsx: ingen inloggning,
 * token i URL:en, ett fetch mot en publik GET-rutt.
 *
 * Renderar BARA sektioner som faktiskt har data — en tom sektion visas
 * aldrig med påhittat innehåll (kvittoprincipen: hellre missa än gissa).
 */

const formatSEK = (amount: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount)

function formatDatum(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
}

type PageState = 'loading' | 'error' | 'ready'

export default function JobbpassPage() {
  const params = useParams()
  const token = params?.token as string

  const [state, setState] = useState<PageState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [pass, setPass] = useState<JobbpassCustomerView | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/jobbpass/public/${token}`)
        const data = await res.json()
        if (!res.ok) {
          setErrorMessage(data.error || 'Jobbpasset kunde inte hämtas')
          setState('error')
          return
        }
        setPass(data.jobbpass)
        setState('ready')
      } catch {
        setErrorMessage('Kunde inte hämta jobbpasset. Försök igen senare.')
        setState('error')
      }
    }
    if (token) load()
  }, [token])

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary-700 animate-spin" />
          <p className="text-gray-500 text-sm">Laddar jobbpass...</p>
        </div>
      </div>
    )
  }

  if (state === 'error' || !pass) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white shadow-sm rounded-3xl border border-gray-200 p-8 text-center">
          <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Jobbpasset kunde inte visas</h2>
          <p className="text-gray-500">{errorMessage}</p>
        </div>
      </div>
    )
  }

  const businessName = pass.business.name || 'Ditt hantverksföretag'

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-50 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary-50 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg overflow-hidden text-white font-bold text-2xl"
            style={{ background: pass.business.accent_color || '#0F766E' }}
          >
            {pass.business.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pass.business.logo_url} alt={businessName} className="w-full h-full object-contain bg-white" />
            ) : (
              <span>{businessName.charAt(0).toUpperCase() || 'H'}</span>
            )}
          </div>
          <p className="text-xs uppercase tracking-wider text-primary-700 font-semibold mb-1">Jobbpass</p>
          <h1 className="text-2xl font-bold text-gray-900">{pass.project.name}</h1>
          <p className="text-gray-500 mt-1 text-sm">{businessName}</p>
        </div>

        {/* Klart-banner */}
        <div className="mb-6 p-5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-800">Jobbet är klart.</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              {pass.project.completed_at
                ? `Avslutat ${formatDatum(pass.project.completed_at)}. Här är en sammanställning av vad som gjordes.`
                : 'Här är en sammanställning av vad som gjordes.'}
            </p>
          </div>
        </div>

        {/* Omfattning */}
        {pass.scope && (
          <Card icon={FileText} title="Vad som ingick">
            {pass.scope.title && <p className="text-sm font-semibold text-gray-900 mb-1">{pass.scope.title}</p>}
            {pass.scope.description && <p className="text-sm text-gray-600 mb-4">{pass.scope.description}</p>}
            {pass.scope.items.length > 0 && (
              <ul className="divide-y divide-gray-100">
                {pass.scope.items.map((item, i) => (
                  <li key={i} className="py-2.5 flex justify-between gap-4 text-sm">
                    <span className="text-gray-700">{item.description}</span>
                    {item.total != null && <span className="text-gray-500 shrink-0">{formatSEK(item.total)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* ÄTA */}
        {pass.changes.length > 0 && (
          <Card icon={Sparkles} title="Godkända tillägg och ändringar">
            <ul className="divide-y divide-gray-100">
              {pass.changes.map((c, i) => (
                <li key={i} className="py-2.5 flex justify-between gap-4 text-sm">
                  <span className="text-gray-700">
                    {c.ata_number != null && <span className="text-gray-400 mr-1">#{c.ata_number}</span>}
                    {c.description}
                  </span>
                  {c.total != null && <span className="text-gray-500 shrink-0">{formatSEK(c.total)}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Utfört arbete */}
        {pass.work_report && (
          <Card icon={Wrench} title="Utfört arbete">
            {pass.work_report.work_performed && (
              <p className="text-sm text-gray-700 whitespace-pre-line mb-3">{pass.work_report.work_performed}</p>
            )}
            {pass.work_report.materials_used && (
              <div className="mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Material</p>
                <p className="text-sm text-gray-600 whitespace-pre-line">{pass.work_report.materials_used}</p>
              </div>
            )}
            {pass.work_report.signed_by && (
              <p className="text-xs text-gray-400 mt-2">
                Godkänt av {pass.work_report.signed_by}
                {pass.work_report.signed_at ? ` · ${formatDatum(pass.work_report.signed_at)}` : ''}
              </p>
            )}
          </Card>
        )}

        {/* Egenkontroll */}
        {pass.checklists.length > 0 && (
          <Card icon={ClipboardCheck} title="Egenkontroll">
            {pass.checklists.map((cl, i) => (
              <div key={i} className={i > 0 ? 'mt-4 pt-4 border-t border-gray-100' : ''}>
                <p className="text-sm font-semibold text-gray-900 mb-2">{cl.name}</p>
                <ul className="space-y-1.5">
                  {cl.items.map((item, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle2 className={`w-4 h-4 shrink-0 ${item.checked ? 'text-emerald-600' : 'text-gray-300'}`} />
                      <span className={item.checked ? '' : 'text-gray-400'}>{item.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Card>
        )}

        {/* Foton */}
        {pass.photos.length > 0 && (
          <Card icon={ImageIcon} title="Bilder från jobbet">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {pass.photos.map(photo => (
                <figure key={photo.id} className="min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.caption || 'Foto från jobbet'}
                    loading="lazy"
                    className="w-full h-32 object-cover rounded-xl border border-gray-100 bg-gray-50"
                  />
                  {photo.caption && <figcaption className="mt-1 text-xs text-gray-500">{photo.caption}</figcaption>}
                </figure>
              ))}
            </div>
          </Card>
        )}

        {/* Faktura */}
        {pass.invoice_reference && (
          <Card icon={Receipt} title="Faktura">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-400">Fakturanummer</span>
              <span className="text-gray-700">{pass.invoice_reference.invoice_number || '—'}</span>
            </div>
            {pass.invoice_reference.invoice_date && (
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Datum</span>
                <span className="text-gray-700">{formatDatum(pass.invoice_reference.invoice_date)}</span>
              </div>
            )}
            {pass.invoice_reference.total != null && (
              <div className="flex justify-between text-sm font-semibold pt-2 mt-2 border-t border-gray-100">
                <span className="text-gray-500">Totalbelopp</span>
                <span className="text-gray-900">{formatSEK(pass.invoice_reference.total)}</span>
              </div>
            )}
          </Card>
        )}

        {/* Garanti */}
        <Card icon={ShieldCheck} title="Garanti">
          <p className="text-sm text-gray-700">{pass.warranty.text}</p>
        </Card>

        {/* Framtida service — bara om kunden faktiskt sagt ja. */}
        {pass.future_service.consent && (
          <Card icon={Zap} title="Framtida service">
            <p className="text-sm text-gray-700">
              Du har sagt ja till att bli kontaktad om service och underhåll längre fram. {businessName} hör av sig när det är dags.
            </p>
          </Card>
        )}

        {/* Kommer snart */}
        <p className="text-center text-xs text-gray-400 mb-8">{pass.certificates_note}</p>

        <p className="text-center text-xs text-gray-400 pb-8">
          Drivs av <span className="text-primary-700 font-medium">Handymate</span>
        </p>
      </div>
    </div>
  )
}

function Card({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 sm:p-8 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary-700" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      </div>
      {children}
    </div>
  )
}
