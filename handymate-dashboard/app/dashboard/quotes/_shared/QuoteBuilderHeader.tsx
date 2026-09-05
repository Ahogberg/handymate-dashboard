'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Bookmark, Check, Loader2, Send, Sparkles } from 'lucide-react'
import { QuoteCompletenessStrip } from './QuoteCompletenessStrip'
import type { QuoteSection, SectionSummary } from '@/lib/quotes/quote-completeness'

interface QuoteBuilderHeaderProps {
  /** 'create' (default om utelämnad) → "Ny offert", inga autosave-badges.
      'edit' (Fas 2, offert-omtaget 2026-08-31) → "Redigerar offert" +
      offertnummer + autosave-indikatorn (slår ihop gamla QuoteEditHeader
      hit). */
  mode?: 'create' | 'edit'
  /** Edit-läge: offertnumret bredvid titeln. */
  quoteNumber?: string
  /** Offertens egen titel (Titel-fältet). Visas i stället för den
      hårdkodade "Ny offert"/"Redigerar offert" så snart den är ifylld —
      se headerTitle nedan. Tom/odefinierad → oförändrat fallback-beteende. */
  title?: string
  /** Completeness-remsan (Fas 1, offert-omtaget 2026-08-31): renderas som
      header-RAD 2, inne i SAMMA sticky/backdrop-blur-wrapper som rad 1 —
      inte en egen sticky-yta, och inte längre en separat <div> som
      scrollar bort under headern (se QuoteBuilder.tsx/QuoteEditView.tsx).
      Utelämnad (t.ex. om ingen sammanfattning finns) → ingen rad 2 alls. */
  completenessSummaries?: Record<QuoteSection, SectionSummary>
  onSelectSection?: (section: QuoteSection) => void
  /** Edit-läge: autosparets status — samma badge som gamla QuoteEditHeader. */
  autoSaveStatus?: 'idle' | 'saving' | 'saved' | 'error'
  aiGenerated?: boolean
  aiConfidence?: number | null
  aiPriceWarning?: { message: string; link: string } | null
  aiPhotoCount?: number
  // Action-knappar (rendas i sticky top-bar; tidigare i högerkolumnen)
  saving: boolean
  canSend: boolean
  /** ETAPP 1f (offert-masterplan.md): synlig orsakstext när canSend är
      false — härledd av föräldern ur SAMMA villkor som canSend, istället
      för en tyst disabled-knapp utan förklaring. Create-läget använder
      detta; edit-läget hade aldrig denna förklaringstext. */
  sendDisabledReason?: string
  /** Beskrivningsvarningen (tidigare descriptionWarningShownRef — en
      osynlig "klicka Skicka igen"-vägg): visar en inline-bekräftelse
      vid knappen istället. Create-läge ENDAST — edit-sidan hade aldrig
      detta mellansteg (se useQuoteBuilderSave.ts). */
  sendConfirmPending?: boolean
  onConfirmSend?: () => void
  onCancelSend?: () => void
  hasItems: boolean
  onSendQuote: () => void
  onSaveDraft: () => void
  onSaveTemplate: () => void
}

/**
 * Sticky header, delad av offertskaparen och offertredigeraren (Fas 2,
 * offert-omtaget 2026-08-31 — slog ihop den gamla `QuoteEditHeader.tsx`
 * hit). Visar AI-status (genererad, säkerhet, foto-räknare, prisvarning) i
 * create-läge, autosave-indikator + offertnummer i edit-läge, och samma
 * action-knappar (Skicka, Spara utkast, Spara som mall) i båda. Backdrop-
 * blur säkerställer läsbarhet.
 *
 * ETAPP 3 (offert-masterplan.md), punkt 4: under `sm` visades de tre
 * AI-badgarna (aiGenerated/aiPriceWarning/aiPhotoCount) inline och kunde
 * tillsammans med Tillbaka-länken + titeln + Spara/Skicka-knapparna
 * wrappa headern till två rader (kartlagt vid uppstart av denna etapp).
 * De tre badgarna slås nu ihop till EN kompakt `MobileInfoChip` under
 * `sm` (samma information, bakom ett tryck) — vid `sm+` renderas de
 * exakt som innan (`hidden sm:...`-varianterna). Spara utkast/Skicka
 * offert kortas till korta etiketter under `sm` (samma knappar, samma
 * handlers) så de alltid får plats — kravet var att de ALLTID ska synas.
 */
export function QuoteBuilderHeader({
  mode = 'create',
  quoteNumber,
  title,
  completenessSummaries,
  onSelectSection,
  autoSaveStatus,
  aiGenerated,
  aiConfidence,
  aiPriceWarning,
  aiPhotoCount,
  saving,
  canSend,
  sendDisabledReason,
  sendConfirmPending,
  onConfirmSend,
  onCancelSend,
  hasItems,
  onSendQuote,
  onSaveDraft,
  onSaveTemplate,
}: QuoteBuilderHeaderProps) {
  // Fallback oförändrat om titeln saknas/är tom — bara vilken text som
  // vinner ändras, quoteNumber-badgen intill (edit-läge) rörs inte. Trimmad
  // både för sanningskollen och för visningen, så ett titelfält med bara
  // inledande/avslutande whitespace inte visas ordagrant.
  const trimmedTitle = title?.trim()
  const headerTitle = trimmedTitle
    ? trimmedTitle
    : mode === 'edit'
      ? 'Redigerar offert'
      : 'Ny offert'

  return (
    <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 mb-6 px-4 sm:px-6 py-3 bg-slate-50/95 backdrop-blur-md border-b border-slate-200">
      <div className="flex items-center gap-3 flex-nowrap sm:flex-wrap">
        <Link
          href="/dashboard/quotes"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors shrink-0"
          aria-label="Tillbaka till offertlistan"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Offerter</span>
        </Link>
        <div className="h-4 w-px bg-slate-300 shrink-0" aria-hidden />
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="font-heading text-lg sm:text-xl font-bold text-slate-900 tracking-tight truncate">
            {headerTitle}
          </h1>
          {mode === 'edit' && quoteNumber && (
            <span className="hidden sm:inline text-xs font-medium text-slate-500 font-mono">{quoteNumber}</span>
          )}
        </div>
        {mode === 'edit' && autoSaveStatus && <AutoSaveIndicator status={autoSaveStatus} />}
        {aiGenerated && (
          <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary-50 text-primary-700 border border-primary-100">
            <Sparkles className="w-3 h-3" />
            AI-genererad{aiConfidence ? ` · ${aiConfidence}%` : ''}
          </span>
        )}
        {aiPriceWarning && (
          <a
            href={aiPriceWarning.link}
            className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100 transition-colors"
          >
            {aiPriceWarning.message.length > 40
              ? 'Priser saknas — uppdatera prislista →'
              : aiPriceWarning.message}
          </a>
        )}
        {(aiPhotoCount ?? 0) > 1 && (
          <span className="hidden sm:inline text-[11px] text-slate-400">Baserad på {aiPhotoCount} foton</span>
        )}
        <MobileInfoChip
          aiGenerated={aiGenerated}
          aiConfidence={aiConfidence}
          aiPriceWarning={aiPriceWarning}
          aiPhotoCount={aiPhotoCount}
        />

        {/* Fas B (offertskaparen-design-polish, 2026-08-31): "Spara som
            mall" behåller sin EGNA `hidden sm:inline-flex` (synlig från
            640px, precis som innan granskningsfixen) — den lever OBEROENDE
            av lg-gaten nedan eftersom QuoteBuilderBottomBar (mobil) inte har
            någon motsvarighet, och att svepa in den i `lg:`-gaten hade gjort
            funktionen helt otillgänglig 640–1023px (fynd från kod-
            granskningen). Bara Spara utkast/Skicka offert-paret (som HAR en
            mobil motsvarighet i bottenfältet) blir `hidden lg:flex` — ALDRIG
            båda samtidigt synliga, det var precis den dubbla Skicka-knappen
            som fick tas bort 2026-08-06 (se kodkommentar i QuoteBuilder.tsx).
            De inre `sm:`-etikettklasserna på Spara/Skicka (korta etiketter
            under `sm`) triggas i praktiken aldrig längre eftersom det paret
            redan är dolt under `lg` (> `sm`) — lämnade orörda enligt
            uppdraget, ofarlig död kod. */}
        <div className="ml-auto flex items-center gap-2 flex-nowrap">
          {hasItems && (
            <button
              type="button"
              onClick={onSaveTemplate}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
            >
              <Bookmark className="w-3.5 h-3.5" />
              Spara som mall
            </button>
          )}
          <div className="hidden lg:flex items-center gap-2">
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={saving}
              className="px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <span className="hidden sm:inline">Spara utkast</span>
              <span className="sm:hidden">Spara</span>
            </button>
            <div className="relative flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={onSendQuote}
                disabled={saving || !canSend}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-700 hover:bg-primary-600 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-sm whitespace-nowrap"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{saving ? 'Sparar…' : 'Granska och skicka'}</span>
                <span className="sm:hidden">{saving ? 'Sparar…' : 'Granska'}</span>
              </button>
              {/* ETAPP 1f: disabled Skicka-knapp får alltid en synlig orsak
                  istället för ett tyst lås. */}
              {!canSend && sendDisabledReason && (
                <span className="text-[10px] text-slate-400 whitespace-nowrap">{sendDisabledReason}</span>
              )}
              {sendConfirmPending && (
                <div className="absolute right-0 top-full mt-2 z-40 w-64 bg-white border border-amber-200 rounded-xl shadow-lg p-3">
                  <p className="text-xs text-slate-700 mb-2.5 leading-relaxed">
                    Beskrivning saknas — skicka ändå?
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={onCancelSend}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                    >
                      Avbryt
                    </button>
                    <button
                      type="button"
                      onClick={onConfirmSend}
                      className="px-3 py-1.5 text-xs font-semibold bg-primary-700 hover:bg-primary-600 text-white rounded-lg transition-colors"
                    >
                      Skicka ändå
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Rad 2 — completeness-remsan (Fas 1, offert-omtaget 2026-08-31,
          flyttad hit ur en egen <div className="mb-4"> under headern så
          att den scrollar MED headern i stället för bort under den). Samma
          sticky/backdrop-blur-wrapper som rad 1 ovan — ingen egen sticky-
          yta. Utelämnad helt om anroparen inte skickar in en sammanfattning.
          Fas B-granskningsfix (2026-08-31): `hidden lg:block` — under `lg`
          visar QuoteBuilderBottomBar (mobilens fasta bottenfält) samma
          chip-data i sin egen horisontella rad. Utan denna gate visades
          remsan DUBBELT på mobil (en gång här, en gång i bottenfältet) —
          samma princip som knappgruppen ovan, exakt en yta synlig per bredd. */}
      {completenessSummaries && onSelectSection && (
        <div className="hidden lg:block mt-2">
          <QuoteCompletenessStrip summaries={completenessSummaries} onSelect={onSelectSection} />
        </div>
      )}
    </div>
  )
}

/**
 * ETAPP 3 (offert-masterplan.md), punkt 4: samlar aiGenerated/aiPriceWarning/
 * aiPhotoCount till EN liten tryckbar chip under `sm` (de tre fälten är
 * `hidden sm:...` ovan — vid `sm+` renderas de precis som innan, den här
 * komponenten är själv `sm:hidden` och tar aldrig plats där). Amber om det
 * finns en prisvarning (viktigast), annars primary för ren AI-status.
 */
function MobileInfoChip({
  aiGenerated,
  aiConfidence,
  aiPriceWarning,
  aiPhotoCount,
}: {
  aiGenerated?: boolean
  aiConfidence?: number | null
  aiPriceWarning?: { message: string; link: string } | null
  aiPhotoCount?: number
}) {
  const [open, setOpen] = useState(false)
  const hasInfo = !!aiGenerated || !!aiPriceWarning || (aiPhotoCount ?? 0) > 1
  if (!hasInfo) return null

  return (
    <div className="relative sm:hidden shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label="AI-information om offerten"
        className={`inline-flex items-center justify-center min-w-[32px] min-h-[32px] rounded-full border transition-colors ${
          aiPriceWarning
            ? 'bg-amber-50 text-amber-700 border-amber-100'
            : 'bg-primary-50 text-primary-700 border-primary-100'
        }`}
      >
        <Sparkles className="w-3.5 h-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 z-40 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-3 space-y-2">
            {aiGenerated && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                <Sparkles className="w-3 h-3" />
                AI-genererad{aiConfidence ? ` · ${aiConfidence}%` : ''}
              </p>
            )}
            {aiPriceWarning && (
              <a href={aiPriceWarning.link} className="block text-xs font-semibold text-amber-700">
                {aiPriceWarning.message}
              </a>
            )}
            {(aiPhotoCount ?? 0) > 1 && (
              <p className="text-xs text-slate-500">Baserad på {aiPhotoCount} foton</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Edit-lägets autosave-badge — flyttad hit oförändrad från gamla
 * `[id]/edit/components/QuoteEditHeader.tsx` (Fas 2, offert-omtaget
 * 2026-08-31). Create-läget skickar aldrig `autoSaveStatus` och ser
 * därför aldrig detta (se `mode === 'edit' && autoSaveStatus`-villkoret
 * ovan).
 */
function AutoSaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (status === 'idle') return null

  const cfg = {
    saving: {
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
      label: 'Sparar…',
      cls: 'bg-slate-100 text-slate-600 border-slate-200',
    },
    saved: {
      icon: <Check className="w-3 h-3" />,
      label: 'Sparad',
      cls: 'bg-green-50 text-green-700 border-green-200',
    },
    error: {
      icon: null,
      label: 'Kunde inte spara',
      cls: 'bg-red-50 text-red-700 border-red-200',
    },
  }[status]

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.cls}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  )
}
