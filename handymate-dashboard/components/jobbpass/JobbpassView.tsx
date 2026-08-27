'use client'

/**
 * JobbpassView — EN rendering av kundvyn, två ytor (Fastighetspasset steg 1,
 * 2026-08-27): den publika sidan app/jobbpass/[token] och kundportalens
 * "Ditt hem" (app/portal/[token]). Samma JobbpassCustomerView in, samma
 * sektioner ut — bara sektioner som faktiskt har data renderas (kvitto-
 * principen: hellre missa än gissa).
 */
import {
  CheckCircle2, FileText, Wrench, ClipboardCheck, Receipt,
  Image as ImageIcon, Sparkles, Zap,
} from 'lucide-react'
import type { JobbpassCustomerView } from '@/lib/jobbpass/jobbpass'

const formatSEK = (amount: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount)

export function formatJobbpassDatum(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function JobbpassView({ pass }: { pass: JobbpassCustomerView }) {
  const businessName = pass.business.name || 'Ditt hantverksföretag'
  return (
    <div>
      {/* Klart-banner */}
      <div className="mb-6 p-5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-800">Jobbet är klart.</p>
          <p className="text-xs text-emerald-700 mt-0.5">
            {pass.project.completed_at
              ? `Avslutat ${formatJobbpassDatum(pass.project.completed_at)}. Här är en sammanställning av vad som gjordes.`
              : 'Här är en sammanställning av vad som gjordes.'}
          </p>
        </div>
      </div>

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
              {pass.work_report.signed_at ? ` · ${formatJobbpassDatum(pass.work_report.signed_at)}` : ''}
            </p>
          )}
        </Card>
      )}

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

      {pass.invoice_reference && (
        <Card icon={Receipt} title="Faktura">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-400">Fakturanummer</span>
            <span className="text-gray-700">{pass.invoice_reference.invoice_number || '—'}</span>
          </div>
          {pass.invoice_reference.invoice_date && (
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-400">Datum</span>
              <span className="text-gray-700">{formatJobbpassDatum(pass.invoice_reference.invoice_date)}</span>
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

      {pass.future_service.consent && (
        <Card icon={Zap} title="Framtida service">
          <p className="text-sm text-gray-700">
            Du har sagt ja till att bli kontaktad om service och underhåll längre fram. {businessName} hör av sig när det är dags.
          </p>
        </Card>
      )}

      <p className="text-center text-xs text-gray-400 mb-8">{pass.certificates_note}</p>
    </div>
  )
}

function Card({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
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

export default JobbpassView
