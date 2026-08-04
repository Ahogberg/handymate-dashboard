'use client'

import { Check, Eye } from 'lucide-react'
import { TEMPLATE_META, type TemplateStyle } from '@/lib/quote-templates/meta'
import { MiniDoc } from './style-thumbnails'

interface QuoteStylePickerProps {
  value: TemplateStyle | null
  onChange: (s: TemplateStyle | null) => void
  businessDefaultStyle: TemplateStyle
  /** Modern/Friendly speglar företagets accent-färg i tumnageln — Premium
      har en låst dark+amber-palett (samma regel som settings/quote-style). */
  accentColor?: string | null
  /** Endast satt på edit-sidan (offerten är sparad) — visar en länk för att
      förhandsgranska designen i en riktig flik. new-sidan har ingen sparad
      offert ännu och utelämnar länken. */
  quoteId?: string
  /** ETAPP 6c (offert-masterplan.md, faktura-sprinten): fakturaskaparens
      motsvarighet till quoteId — ömsesidigt uteslutande med den (en
      QuoteStylePicker-instans styr ALDRIG både en offert och en faktura). */
  invoiceId?: string
  /** Styr etikett-text + MiniDoc-läge (som redan stödjer 'invoice', se
      DualThumbnail i style-thumbnails.tsx) + förhandsgranskningslänkens
      URL. Default 'quote' — offertens befintliga anropsställen ändras inte. */
  kind?: 'quote' | 'invoice'
}

/**
 * Visuell stilväljare — ETAPP 1b (offert-masterplan.md): ersätter BÅDE
 * inline-kopian som tidigare låg i app/dashboard/quotes/new/page.tsx OCH
 * app/dashboard/quotes/[id]/edit/components/QuoteEditTemplatePicker.tsx
 * (nu borttagen). Återanvänder MiniDoc-tumnaglarna (samma A4-miniatyrer
 * som Inställningar → Dokumentstil) istället för rena textknappar, så
 * hantverkaren faktiskt SER stilen innan valet.
 *
 * ETAPP 6c: generaliserad med `kind` för att även styra fakturaskaparens
 * "Mer"-panel — MiniDoc hade redan kind='invoice'-stöd (se DualThumbnail)
 * men denna komponent hårdkodade kind="quote" + "Offertstil"-etiketten +
 * länken till /api/quotes/pdf, vilket hade varit fel för en faktura.
 */
export function QuoteStylePicker({
  value,
  onChange,
  businessDefaultStyle,
  accentColor,
  quoteId,
  invoiceId,
  kind = 'quote',
}: QuoteStylePickerProps) {
  const effective = value || businessDefaultStyle
  const documentId = kind === 'invoice' ? invoiceId : quoteId
  const previewHref = kind === 'invoice'
    ? `/api/invoices/pdf?invoiceId=${documentId}`
    : `/api/quotes/pdf?id=${documentId}`

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {kind === 'invoice' ? 'Fakturastil' : 'Offertstil'}
        </p>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-slate-500 hover:text-primary-700 transition-colors"
          >
            Återställ
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {TEMPLATE_META.map(meta => {
          const isSelected = effective === meta.id
          const isDefault = !value && businessDefaultStyle === meta.id
          const previewAccent = meta.id === 'premium' ? meta.previewAccentColor : (accentColor || '#0F766E')
          return (
            <button
              key={meta.id}
              type="button"
              onClick={() => onChange(meta.id)}
              className={`relative text-left rounded-xl border overflow-hidden transition-all ${
                isSelected
                  ? 'border-primary-700 ring-2 ring-primary-100'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {isSelected && (
                <span className="absolute top-1.5 right-1.5 z-10 w-4 h-4 rounded-full bg-primary-700 text-white inline-flex items-center justify-center">
                  <Check className="w-2.5 h-2.5" strokeWidth={3} />
                </span>
              )}
              <MiniDoc style={meta.id} bg={meta.previewBgColor} accent={previewAccent} kind={kind} />
              <div className="p-2">
                <div className={`text-xs font-bold tracking-tight ${isSelected ? 'text-primary-700' : 'text-slate-900'}`}>
                  {meta.name}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">{meta.tagline}</div>
                {isDefault && (
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-primary-700 mt-1">
                    Standard
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
      {documentId && (
        <a
          href={previewHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-600 transition-colors"
        >
          <Eye className="w-3 h-3" />
          Förhandsgranska design (sparas först)
        </a>
      )}
    </div>
  )
}
