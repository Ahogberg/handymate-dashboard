'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, ExternalLink, FileText, Loader2, Palette, Receipt } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { supabase } from '@/lib/supabase'
import { TEMPLATE_META, type TemplateStyle } from '@/lib/quote-templates'
import { DualThumbnail } from '@/components/quotes/style-thumbnails'

/**
 * Dokumentstil — väljer visuell mall för OFFERTER, FAKTUROR och PÅMINNELSER.
 * En enda inställning (`business_config.quote_template_style`) styr alla
 * tre dokumenttyper så hantverkarens kund ser konsekvent stil från offert
 * till faktura.
 */
export default function DocumentStylePage() {
  const business = useBusiness()
  const [style, setStyle] = useState<TemplateStyle>('modern')
  const [accentColor, setAccentColor] = useState<string>('#0F766E')
  const [sampleQuoteId, setSampleQuoteId] = useState<string | null>(null)
  const [sampleInvoiceId, setSampleInvoiceId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<TemplateStyle | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: config } = await supabase
        .from('business_config')
        .select('quote_template_style, accent_color')
        .eq('business_id', business.business_id)
        .maybeSingle()

      if (config?.quote_template_style) {
        setStyle(config.quote_template_style as TemplateStyle)
      }
      if (config?.accent_color) {
        setAccentColor(config.accent_color)
      }

      const [qRes, iRes] = await Promise.all([
        supabase
          .from('quotes')
          .select('quote_id')
          .eq('business_id', business.business_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('invoice')
          .select('invoice_id')
          .eq('business_id', business.business_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (qRes.data?.quote_id) setSampleQuoteId(qRes.data.quote_id)
      if (iRes.data?.invoice_id) setSampleInvoiceId(iRes.data.invoice_id)
      setLoading(false)
    }
    load()
  }, [business.business_id])

  async function selectStyle(newStyle: TemplateStyle) {
    if (newStyle === style || saving) return
    setSaving(newStyle)
    const { error } = await supabase
      .from('business_config')
      .update({ quote_template_style: newStyle })
      .eq('business_id', business.business_id)

    if (!error) {
      setStyle(newStyle)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
    }
    setSaving(null)
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-5xl mx-auto">
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Inställningar
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center gap-2">
            <Palette className="w-6 h-6 text-primary-700" />
            Dokumentstil
          </h1>
          <p className="text-sm text-gray-500">
            Välj visuell stil för dina dokument. Stilen används för{' '}
            <strong className="text-gray-700">offerter, fakturor och påminnelser</strong> — så dina
            kunder ser konsekvent profil från första kontakten till slutbetalning.
          </p>
        </div>

        {savedFlash && (
          <div className="mb-4 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-2">
            <Check className="w-4 h-4" />
            Stil sparad — gäller alla nya dokument
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TEMPLATE_META.map(meta => {
            const isSelected = style === meta.id
            const isSaving = saving === meta.id
            const previewAccent = meta.id === 'premium' ? meta.previewAccentColor : accentColor
            return (
              <button
                key={meta.id}
                onClick={() => selectStyle(meta.id)}
                disabled={!!isSaving}
                className={`text-left bg-white rounded-xl border-2 transition-all overflow-hidden ${
                  isSelected
                    ? 'border-primary-600 ring-2 ring-primary-100'
                    : 'border-[#E2E8F0] hover:border-primary-300'
                }`}
              >
                <DualThumbnail style={meta.id} bg={meta.previewBgColor} accent={previewAccent} />

                <div className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-base font-semibold text-gray-900">{meta.name}</h3>
                    {isSelected && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" /> Vald
                      </span>
                    )}
                    {isSaving && (
                      <Loader2 className="w-4 h-4 text-primary-700 animate-spin" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 italic mb-2">{meta.tagline}</p>
                  <p className="text-xs text-gray-600 leading-snug">{meta.bestFor}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Preview-knappar */}
        {(sampleQuoteId || sampleInvoiceId) && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sampleQuoteId && (
              <a
                href={`/api/quotes/pdf?id=${sampleQuoteId}&style=${style}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 bg-white border border-[#E2E8F0] rounded-xl flex items-center justify-between hover:border-primary-300 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-primary-700" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">Förhandsgranska offert</p>
                    <p className="text-xs text-gray-500 truncate">Senaste offerten i vald stil</p>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
              </a>
            )}
            {sampleInvoiceId && (
              <a
                href={`/api/invoices/pdf?invoiceId=${sampleInvoiceId}&style=${style}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-4 bg-white border border-[#E2E8F0] rounded-xl flex items-center justify-between hover:border-primary-300 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <Receipt className="w-4 h-4 text-primary-700" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">Förhandsgranska faktura</p>
                    <p className="text-xs text-gray-500 truncate">Senaste fakturan i vald stil</p>
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
              </a>
            )}
          </div>
        )}

        {!sampleQuoteId && !sampleInvoiceId && (
          <p className="mt-6 text-xs text-gray-400 text-center">
            Skapa din första offert eller faktura för att kunna förhandsgranska stilen.
          </p>
        )}

        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs text-amber-900 leading-relaxed">
            <strong>Notering:</strong> Modern och Friendly använder ditt varumärkes accent-färg
            (sätts under Inställningar → Profil). Premium har en låst dark + amber-palett som bevarar
            mallens identitet.
          </p>
        </div>
      </div>
    </div>
  )
}
