'use client'

import { useState } from 'react'
import { Eye, FileText, Loader2, Maximize2, X } from 'lucide-react'
import TemplatePreviewFrame, { type TemplatePreviewPayload } from '@/components/quotes/TemplatePreviewFrame'
import QuoteDocument, { type QuoteDocumentHandlers } from '@/components/quotes/document/QuoteDocument'
import { DocumentScaler } from '@/components/quotes/document/DocumentScaler'
import { useIsMobileViewport } from '@/components/quotes/document/useIsMobileViewport'
import type { QuoteTemplateData } from '@/lib/quote-templates/types'
import type { QuoteSection } from '@/lib/quotes/quote-completeness'
import type { ReservationSuggestion } from '@/lib/reservations/match'

interface QuoteDocumentSurfaceProps {
  /** ETAPP 2c (offert-masterplan.md): styr om den redigerbara
      dokumentcanvasen erbjuds. new-sidan hade tidigare canvasen, edit
      inte — motorn (QuoteDocument) är stil-agnostisk för valet av data,
      så det fanns ingen teknisk anledning att neka edit-sidan samma
      funktion. `liveTemplateData`/`liveHandlers` krävs bara när true. */
  liveEnabled: boolean
  liveTemplateData?: QuoteTemplateData
  liveHandlers?: QuoteDocumentHandlers
  /** ETAPP 3 (offert-masterplan.md): tryck på en rad i canvasen UNDER lg
      (sheetMode sätts automatiskt här utifrån viewport-bredden, se
      useIsMobileViewport) — sidan (new/edit) öppnar sin RowEditSheet med
      raden. Krävs bara för canvasgrenen; utelämnad → sheetMode blir aldrig
      aktivt (QuoteDocument faller tillbaka till vanlig inline-redigering). */
  onRowTap?: (itemId: string) => void
  /** Mobilens "+ Lägg till rad". Sidan öppnar sin AddRowSheet (sök i
      artikelbanken) i stället för att lägga en tom rad — den tomma raden var
      ~9 interaktioner från färdig, sökningen är 2-3. Utelämnad → knappen
      faller tillbaka på liveHandlers.onItemAdd. */
  onAddRowTap?: () => void
  /**
   * FAS E (offertskaparen-design-polish, 2026-09-01): tomt-läges-rutans
   * "beskriv jobbet"/"Fota eller beskriv jobbet"-affordans (desktop resp.
   * mobil), vidarebefordrad rakt till QuoteDocument (se dess `onOpenAiHelp`-
   * docblock) och använd direkt här för mobilens oskalade tomruta. Samma
   * genuina asymmetri som där: create-sidan (QuoteBuilder.tsx) skickar
   * `() => setShowAiHelper(true)`, redigeringsvyn (QuoteEditView.tsx)
   * skickar ingenting alls. Utelämnad → ingen sekundärknapp/länk, bara
   * "+ Lägg till rad".
   */
  onOpenAiHelp?: () => void
  templatePreviewPayload: TemplatePreviewPayload
  /** ETAPP C3 (Snabbofferten): sektionen som granskas — dimmar de andra.
      Ren visning; vilka fält som går att redigera styrs av liveHandlers. */
  focusSection?: QuoteSection | null
  /**
   * ETAPP C2 (Snabbofferten): spela reveal-animationen när dokumentet monteras.
   *
   * Opt-in med default av, så redigeringssidan och det vanliga new-flödet —
   * som delar den här komponenten — aldrig får den. Anroparen ska sätta den på
   * "är vi i snabbofferten över huvud taget", INTE på "är vi i
   * granskningssteget": en CSS-animation startar om när animation-name
   * introduceras på ett redan monterat element, så en propp som slår av och på
   * vid översikt → sektion hade spelat om revealen varje gång.
   */
  quickReveal?: boolean
  /**
   * FAS D (offertskaparen-design-polish, 2026-09-01): reservationsmotorns
   * matchade-men-ej-tillagda förslag, vidarebefordrade rakt till
   * QuoteDocument (se dess docblock för `reservationSuggestions`/
   * `onReviewReservationSuggestions`) — den fristående bannern som satt
   * bredvid dokumentet är borttagen, förslagen renderas nu inuti
   * dokumentets egen Reservationer-sektion.
   */
  reservationSuggestions?: ReservationSuggestion[]
  onReviewReservationSuggestions?: () => void
}

/**
 * QuoteDocumentSurface — offerten ÄR ytan (Claude Design-handoffen,
 * offert-omtaget): inga flikar, ingen kollapsbar "Förhandsgranska"-panel.
 * Dokumentet renderas alltid, direkt i huvudytan, i både create- och
 * edit-läget: redigerbar dokumentcanvas (QuoteDocument) när Modern-stilen
 * är vald, annars server-renderad iframe (TemplatePreviewFrame) — samma
 * mönster som app/dashboard/invoices/_shared/InvoiceEditor.tsx (ingen flik,
 * canvas om Modern, iframe annars). TemplatePreviewFrame behålls eftersom
 * /api/quotes/preview-html är den enda renderaren för Premium/Friendly —
 * och den rutten fungerar även för osparade utkast (se dess egen
 * kommentar), så iframen är en fungerande yta direkt, ingen
 * "spara först"-tomruta behövs.
 *
 * (Historik: komponenten förenade i ETAPP 2c, offert-masterplan.md,
 * new/edit-sidornas två separata paneler till EN fil — `liveEnabled` är
 * kvar därifrån.)
 */
export function QuoteDocumentSurface({
  liveEnabled,
  liveTemplateData,
  liveHandlers,
  onRowTap,
  onAddRowTap,
  onOpenAiHelp,
  templatePreviewPayload,
  focusSection,
  quickReveal,
  reservationSuggestions,
  onReviewReservationSuggestions,
}: QuoteDocumentSurfaceProps) {
  const [fullscreen, setFullscreen] = useState(false)
  const [previewPending, setPreviewPending] = useState(false)
  // Fångat vid montering och därefter oföränderligt. Två skäl: proppen får
  // aldrig kunna starta om animationen mitt i granskningen, och
  // renderDocument anropas på TVÅ ställen (inline och fullskärm) — utan
  // den här låsningen hade revealen spelats om när fullskärmsläget öppnas.
  const [revealOnMount] = useState(() => !!quickReveal)
  // ETAPP 3: samma brytpunkt som DocumentScaler — under lg stängs radernas
  // inline-fält av till förmån för RowEditSheet (30px-fält klarar inte
  // 44px-kravet i A4-skala, se offert-masterplan.md).
  const isMobile = useIsMobileViewport()

  const showLive = liveEnabled && !!liveTemplateData && !!liveHandlers

  function renderDocument(flexFill: boolean) {
    const sizeCls = flexFill ? 'flex-1 min-h-0' : 'h-full'
    if (showLive && liveTemplateData && liveHandlers) {
      // Reveal-klassen ligger på den BEFINTLIGA diven nedan, inte på en ny
      // wrapper: ett extra element hade ändrat trädformen, fått React att
      // montera om DocumentScaler + QuoteDocument, och ett pågående inline-fält
      // hade tappat fokus och markör mitt i redigeringen.
      return (
        <div className={`bg-slate-50 rounded-xl overflow-auto border border-slate-200 ${sizeCls} p-4${revealOnMount ? ' quick-reveal' : ''}`}>
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
              // SPÅR B1: desktopens knapp inuti dokumentet gick tidigare till
              // onItemAdd och gav en tom rad — artikelbanken nåddes inte alls
              // från standardvyn. Nu samma väg som mobilens knapp nedan.
              onAddRow={onAddRowTap}
              onOpenAiHelp={onOpenAiHelp}
              reservationSuggestions={reservationSuggestions}
              onReviewReservationSuggestions={onReviewReservationSuggestions}
            />
          </DocumentScaler>

          {/* Mobilens "+ Lägg till rad" ligger UTANFÖR DocumentScaler och är
              därmed oskalad — inuti A4:an blev träffytan ~15px vid 375px
              skärm. QuoteDocument döljer sin egen knapp i sheetMode.
              ETAPP C3: göms när en ANNAN sektion än Inkluderat granskas —
              knappen ligger utanför dokumentet och nås därför inte av
              dimningen, så utan detta hade man kunnat lägga till en rad
              mitt i prisgranskningen.
              FAS E (offertskaparen-design-polish, 2026-09-01): tomt-läge —
              samma `liveTemplateData` som redan används för att bygga
              dokumentet, ingen ny prop krävs för själva checken. */}
          {isMobile && (!focusSection || focusSection === 'inkluderat') && (
            liveTemplateData.quote.items.length === 0 ? (
              <div className="mt-3 flex flex-col items-center gap-3 py-6 text-center">
                <div className="w-[52px] h-[52px] rounded-2xl bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <p className="text-[15px] font-bold text-slate-900">Offerten är tom än</p>
                <button
                  type="button"
                  onClick={onAddRowTap || liveHandlers.onItemAdd}
                  className="w-full min-h-[52px] flex items-center justify-center gap-2 px-4 bg-primary-700 hover:bg-primary-600 text-white text-[15px] font-semibold rounded-xl transition-colors"
                >
                  + Lägg till rad
                </button>
                {/* Se onOpenAiHelp:s docblock ovan — utelämnad i
                    redigeringsvyn, så knappen uteblir där. */}
                {onOpenAiHelp && (
                  <button
                    type="button"
                    onClick={onOpenAiHelp}
                    className="w-full min-h-[52px] flex items-center justify-center gap-2 px-4 bg-white border border-primary-700 text-primary-700 text-[15px] font-semibold rounded-xl hover:bg-primary-50/50 transition-colors"
                  >
                    Fota eller beskriv jobbet
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onAddRowTap || liveHandlers.onItemAdd}
                className="mt-3 w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-dashed border-slate-300 text-primary-700 text-[15px] font-semibold rounded-xl hover:bg-primary-50/50 active:bg-primary-50 transition-colors"
              >
                + Lägg till rad
              </button>
            )
          )}
        </div>
      )
    }
    // Iframe = dokumentytan för Premium/Friendly (InvoiceEditor-precedenten).
    // max-lg:aspect-[210/297] ger riktig höjd under lg där sticky-wrapperns
    // h-[calc(100vh-7rem)] inte gäller (fixar 0-höjdskollapsen: flex-1 i en
    // kolumn vars höjd själv är auto löses till 0). max-lg:flex-none hindrar
    // flex-1 från att nolla aspect-ration — i en flex-kolumn styr flex
    // huvudaxeln (höjden) och vinner annars över aspect-ratio.
    return (
      <TemplatePreviewFrame
        payload={templatePreviewPayload}
        className={`${sizeCls} max-lg:flex-none max-lg:aspect-[210/297]`}
        onPendingChange={setPreviewPending}
        // Ramens egen hörn-spinner (top-2 right-2) av: "Uppdaterar"-pillen
        // ovan är enda indikatorn här, och hörnet upptas av fullskärmsknappen.
        showSpinner={false}
      />
    )
  }

  return (
    <>
      <div className="relative h-full flex flex-col">
        {renderDocument(true)}
        {/* Diskret fullskärmsknapp — desktop only (på mobil skulle den
            överlappa den skalade A4:an). */}
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          aria-label="Maximera"
          title="Visa i fullskärm"
          className="hidden lg:inline-flex absolute top-3 right-3 z-10 p-2 rounded-lg bg-white/90 shadow-sm border border-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        {/* Minimal överlevnad av "Uppdaterar"-badgen (signalen för
            600ms-debouncens server-rundresa) — endast iframe-grenen. */}
        {!showLive && previewPending && (
          <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/90 text-slate-600 border border-slate-200 shadow-sm">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            Uppdaterar
          </span>
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
            <div className="flex-1 overflow-hidden p-3 flex flex-col">{renderDocument(false)}</div>
          </div>
        </div>
      )}
    </>
  )
}
