'use client'

import { useState } from 'react'
import { ChevronDown, Eye, Loader2, Maximize2, X } from 'lucide-react'
import TemplatePreviewFrame, { type TemplatePreviewPayload } from '@/components/quotes/TemplatePreviewFrame'
import QuoteDocument, { type QuoteDocumentHandlers } from '@/components/quotes/document/QuoteDocument'
import { DocumentScaler } from '@/components/quotes/document/DocumentScaler'
import { useIsMobileViewport } from '@/components/quotes/document/useIsMobileViewport'
import type { QuoteTemplateData } from '@/lib/quote-templates/types'
import type { QuoteSection } from '@/lib/quotes/section-handlers'

type PreviewMode = 'live' | 'design'

interface QuotePreviewPanelProps {
  open: boolean
  setOpen: (b: boolean) => void
  previewMode: PreviewMode
  setPreviewMode: (m: PreviewMode) => void
  /** ETAPP 2c (offert-masterplan.md): styr om Live-fliken (redigerbar
      dokumentcanvas) erbjuds. new-sidan hade tidigare live-läget, edit
      inte — motorn (QuoteDocument) är stil-agnostisk för valet av data,
      så det fanns ingen teknisk anledning att neka edit-sidan samma
      funktion. `liveTemplateData`/`liveHandlers` krävs bara när true. */
  liveEnabled: boolean
  liveTemplateData?: QuoteTemplateData
  liveHandlers?: QuoteDocumentHandlers
  /** ETAPP 3 (offert-masterplan.md): tryck på en rad i canvasen UNDER lg
      (sheetMode sätts automatiskt här utifrån viewport-bredden, se
      useIsMobileViewport) — sidan (new/edit) öppnar sin RowEditSheet med
      raden. Krävs bara för Live-fliken; utelämnad → sheetMode blir aldrig
      aktivt (QuoteDocument faller tillbaka till vanlig inline-redigering). */
  onRowTap?: (itemId: string) => void
  /** Mobilens "+ Lägg till rad". Sidan öppnar sin AddRowSheet (sök i
      artikelbanken) i stället för att lägga en tom rad — den tomma raden var
      ~9 interaktioner från färdig, sökningen är 2-3. Utelämnad → knappen
      faller tillbaka på liveHandlers.onItemAdd. */
  onAddRowTap?: () => void
  templatePreviewPayload: TemplatePreviewPayload
  /** ETAPP C3 (Snabbofferten): sektionen som granskas — dimmar de andra.
      Ren visning; vilka fält som går att redigera styrs av liveHandlers. */
  focusSection?: QuoteSection | null
}

/**
 * QuotePreviewPanel — ETAPP 2c (offert-masterplan.md): förenar
 * QuoteNewPreviewPanel och QuoteEditPreviewPanel till EN komponent.
 * Skillnaden var bara Live-fliken (fanns i new, saknades i edit) — nu
 * styrd av `liveEnabled` istället för att vara två separata filer som
 * kunde divergera.
 */
export function QuotePreviewPanel({
  open,
  setOpen,
  previewMode,
  setPreviewMode,
  liveEnabled,
  liveTemplateData,
  liveHandlers,
  onRowTap,
  onAddRowTap,
  templatePreviewPayload,
  focusSection,
}: QuotePreviewPanelProps) {
  const [fullscreen, setFullscreen] = useState(false)
  const [previewPending, setPreviewPending] = useState(false)
  // ETAPP 3: samma brytpunkt som DocumentScaler — under lg stängs radernas
  // inline-fält av till förmån för RowEditSheet (30px-fält klarar inte
  // 44px-kravet i A4-skala, se offert-masterplan.md).
  const isMobile = useIsMobileViewport()

  function renderPreviewBody(flexFill: boolean) {
    const sizeCls = flexFill ? 'flex-1 min-h-0' : 'h-full'
    if (previewMode === 'live' && liveEnabled && liveTemplateData && liveHandlers) {
      return (
        <div className={`bg-slate-50 rounded-xl overflow-auto border border-slate-200 ${sizeCls} p-4`}>
          <DocumentScaler>
            {/* ETAPP 6a: se PublicQuoteDocument.tsx-kommentaren — docType
                sätts inline, liveTemplateData förblir typad QuoteTemplateData
                (new/edit-sidornas live-state rörs inte). */}
            <QuoteDocument
              data={{ ...liveTemplateData, docType: 'quote' }}
              mode="edit"
              handlers={liveHandlers}
              sheetMode={isMobile}
              onRowTap={onRowTap}
              focusSection={focusSection}
            />
          </DocumentScaler>

          {/* Mobilens "+ Lägg till rad" ligger UTANFÖR DocumentScaler och är
              därmed oskalad — inuti A4:an blev träffytan ~15px vid 375px
              skärm. QuoteDocument döljer sin egen knapp i sheetMode.
              ETAPP C3: göms när en ANNAN sektion än Inkluderat granskas —
              knappen ligger utanför dokumentet och nås därför inte av
              dimningen, så utan detta hade man kunnat lägga till en rad
              mitt i prisgranskningen. */}
          {isMobile && (!focusSection || focusSection === 'inkluderat') && (
            <button
              type="button"
              onClick={onAddRowTap || liveHandlers.onItemAdd}
              className="mt-3 w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-dashed border-slate-300 text-primary-700 text-[15px] font-semibold rounded-xl hover:bg-primary-50/50 active:bg-primary-50 transition-colors"
            >
              + Lägg till rad
            </button>
          )}
        </div>
      )
    }
    return (
      <TemplatePreviewFrame
        payload={templatePreviewPayload}
        className={sizeCls}
        onPendingChange={setPreviewPending}
      />
    )
  }

  return (
    <>
      {/* ETAPP 3 (offert-masterplan.md): panelen var tidigare `hidden lg:flex`
          — dokumentet syntes ALDRIG i huvudytan under lg (bara FAB:ens
          statiska, oredigerbara modal). "Dokumentet ÄR gränssnittet" gäller
          mobilen lika mycket som desktop — panelen är nu synlig i alla
          brytpunkter, oförändrad vid lg+. */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col h-full">
        <div className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50/50 transition-colors">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
          >
            <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
              <Eye className="w-4.5 h-4.5" />
            </div>
            <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight flex-1">
              Förhandsgranska
            </h2>
            {previewMode === 'design' && previewPending && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                Uppdaterar
              </span>
            )}
          </button>
          {open && (
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Maximera"
              title="Visa i fullskärm"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-label={open ? 'Dölj' : 'Visa'}
            className="p-1 text-slate-400"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {open && (
          <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => liveEnabled && setPreviewMode('live')}
                disabled={!liveEnabled}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  previewMode === 'live'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                } ${!liveEnabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                title={liveEnabled ? 'Inline-redigera direkt i mallen' : 'Live-redigering för Premium/Friendly kommer i nästa steg'}
              >
                Live ✏️
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('design')}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  previewMode === 'design'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Slutdesign
              </button>
            </div>
            {renderPreviewBody(true)}
          </div>
        )}
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
          <div className="bg-white rounded-2xl w-full h-full max-w-5xl flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center">
                  <Eye className="w-4.5 h-4.5" />
                </div>
                <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight">
                  Förhandsgranska — fullskärm
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFullscreen(false)}
                aria-label="Stäng"
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-3 flex flex-col">{renderPreviewBody(false)}</div>
          </div>
        </div>
      )}
    </>
  )
}
