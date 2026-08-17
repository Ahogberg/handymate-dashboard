'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Check, Loader2, Paperclip, Send } from 'lucide-react'
import {
  SECTION_ORDER,
  SECTION_LABELS,
  sectionReviewState,
  unreviewedCount,
  type QuoteSection,
  type SectionSummary,
} from '@/lib/quotes/section-handlers'
import type { DetailLevel } from '@/lib/types/quote'
import type { TemplateStyle } from '@/lib/quote-templates/meta'
import { QuoteNewAttachmentsCard } from '../QuoteNewAttachmentsCard'
import { QuoteStylePicker } from '@/components/quotes/QuoteStylePicker'
import { QuoteEditDisplaySettingsSection } from '../../../[id]/edit/components/QuoteEditDisplaySettingsSection'

/**
 * Kvittot ovanför helhetsvyn (etapp C4, 2026-08-06).
 *
 * ═══ VAD DET SVARAR PÅ ═══
 *
 * "Har jag fått med allt?" — Christoffers faktiska oro, ordagrant. En bock per
 * sektion visar vad som är genomgånget; ett amber-chip visar vad som inte är
 * det. Varje chip är en INGÅNG tillbaka till sin sektion, inte bara en
 * varning: att peka på ett problem utan att erbjuda vägen dit gör bara
 * hantverkaren stressad.
 *
 * ═══ VARFÖR SKICKA INTE ÄR SPÄRRAT ═══
 *
 * Amber betyder "titta på det här", inte "du får inte". Hantverkaren kan ha
 * fullgoda skäl att skicka utan personnummer — kunden kanske mejlar det sedan.
 * Produkten föreslår, hantverkaren beslutar. Att spärra Skicka hade gjort oss
 * till en grind i stället för en kollega.
 *
 * ═══ DEL 4 (jaunty-pondering-hummingbird.md, 2026-08-17) ═══
 *
 * De tre sista flikarna som bara levde i gamla helhetseditorn: Bilagor kan
 * redan tyst ackumuleras via AI-fotoanalys innan den här skärmen någonsin
 * synts — därför en ALLTID synlig rad, inte gömd bakom en utfällning, precis
 * som sektionslistan ovanför. Stil och Visning är genuint valfria
 * presentationsval med rimliga defaultvärden — de bor i en gemensam
 * "Fler inställningar"-utfällning längst ned, stängd som default.
 */

type Attachment = { name: string; url: string; size?: number }

interface QuickReceiptProps {
  summaries: Record<QuoteSection, SectionSummary>
  approved: QuoteSection[]
  amountToPay: string
  customerName: string | null
  onGoToSection: (section: QuoteSection) => void
  onSend: () => void
  onOpenFullEditor: () => void
  sending: boolean

  // Bilagor
  attachments: Attachment[]
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>
  uploadingFile: boolean
  onFileUpload: (file: File) => Promise<void>

  // Stil
  templateStyle: TemplateStyle | null
  setTemplateStyle: (s: TemplateStyle | null) => void
  businessDefaultStyle: TemplateStyle
  accentColor?: string | null

  // Visning
  detailLevel: DetailLevel
  setDetailLevel: (d: DetailLevel) => void
  showUnitPrices: boolean
  setShowUnitPrices: (b: boolean) => void
  showQuantities: boolean
  setShowQuantities: (b: boolean) => void
}

export function QuickReceipt({
  summaries,
  approved,
  amountToPay,
  customerName,
  onGoToSection,
  onSend,
  onOpenFullEditor,
  sending,
  attachments,
  setAttachments,
  uploadingFile,
  onFileUpload,
  templateStyle,
  setTemplateStyle,
  businessDefaultStyle,
  accentColor,
  detailLevel,
  setDetailLevel,
  showUnitPrices,
  setShowUnitPrices,
  showQuantities,
  setShowQuantities,
}: QuickReceiptProps) {
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)

  const attentions = SECTION_ORDER
    .map(s => ({ section: s, attention: summaries[s].attention }))
    .filter((a): a is { section: QuoteSection; attention: string } => !!a.attention)
  const unreviewed = unreviewedCount(summaries, approved)

  return (
    // Kortet monteras samtidigt som dokumentet tänds (sektion → översikt delar
    // DOM-träd), så entrén säger "nytt element" medan dokumentets dimning
    // släpper via sin egen transition.
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm anim-rise">
      <div className="flex items-baseline justify-between mb-1">
        <p className="font-heading text-lg font-bold text-slate-900 tracking-tight">Offerten är klar</p>
        <p className="font-heading text-lg font-bold text-primary-700 tabular-nums">{amountToPay}</p>
      </div>
      {/* Samma räknare som granskningsbaren (designpasset 2026-08-10) —
          svaret på Christoffers fråga i en siffra, före listan. */}
      <p className="text-xs text-slate-400 mb-4 tabular-nums">
        {SECTION_ORDER.filter(s => sectionReviewState(summaries[s], approved.includes(s)) === 'granskad').length} av {SECTION_ORDER.length} delar genomgångna
      </p>

      <div className="space-y-2 mb-4">
        {SECTION_ORDER.map((section, i) => {
          const summary = summaries[section]
          const state = sectionReviewState(summary, approved.includes(section))
          return (
            <button
              key={section}
              type="button"
              onClick={() => onGoToSection(section)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-left transition-colors"
            >
              {/* Prickas av i läsordning — svaret på "har jag fått med allt?".
                  Ingen konfetti: att skicka en offert är vardag, inte en bragd.

                  TRE tillstånd, inte två (spår A, 2026-08-06). En sektion
                  hantverkaren aldrig öppnat visade tidigare en grå BOCK —
                  samma symbol som en granskad, bara blekare. Att den var
                  dämpad gjorde bara lögnen tystare. Nu en TOM RING: den
                  säger "här finns inget svar än", vilket är sant. */}
              <span
                style={{ animationDelay: `${i * 60 + 150}ms` }}
                className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 anim-pop transition-colors duration-base ease-standard ${
                  state === 'behover-ogon'
                    ? 'bg-amber-100 text-amber-700'
                    : state === 'granskad'
                      ? 'bg-primary-100 text-primary-700'
                      : 'border-2 border-slate-300'
                }`}
              >
                {state === 'behover-ogon' && <AlertTriangle className="w-3 h-3" />}
                {state === 'granskad' && <Check className="w-3 h-3" />}
                {/* 'ogranskad' bär medvetet ingen ikon alls. */}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{SECTION_LABELS[section]}</span>
                <span className={`block text-xs truncate ${state === 'ogranskad' ? 'text-slate-400' : 'text-slate-500'}`}>
                  {state === 'ogranskad' ? 'Inte granskad' : (summary.attention || summary.text)}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Bilagor — INTE gömd bakom en utfällning. Bilagor kan redan tyst
          ackumuleras via AI-fotoanalys innan den här skärmen någonsin synts,
          så antalet ska synas utan att man behöver leta efter det — samma
          kategori fråga som sektionslistan ovan: "har jag fått med allt?" */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setAttachmentsOpen(o => !o)}
          className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Paperclip className="w-4 h-4 text-slate-400" />
            Bilagor
          </span>
          <span className="flex items-center gap-1.5 text-xs text-slate-500 tabular-nums">
            {attachments.length > 0 ? `${attachments.length} st` : 'Inga bifogade'}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${attachmentsOpen ? 'rotate-180' : ''}`} />
          </span>
        </button>
        {attachmentsOpen && (
          <div className="mt-2">
            <QuoteNewAttachmentsCard
              attachments={attachments}
              setAttachments={setAttachments}
              uploadingFile={uploadingFile}
              onFileUpload={onFileUpload}
            />
          </div>
        )}
      </div>

      {attentions.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-4">
          {attentions.length === 1
            ? 'En sak är värd en extra titt innan du skickar — tryck på den för att gå dit.'
            : `${attentions.length} saker är värda en extra titt innan du skickar — tryck på dem för att gå dit.`}
        </p>
      )}

      {/* Det som INTE granskats sägs rakt ut. Neutral ton, inte varnande:
          att hoppa över en del kan vara ett helt medvetet val — men då ska
          det vara ett val, inte något som passerade obemärkt.

          Spärrar INTE Skicka. Amber betyder "titta här", inte "du får inte",
          och det gäller även här. */}
      {unreviewed > 0 && (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 mb-4">
          {unreviewed === 1
            ? 'Du har inte tittat på en av delarna. Tryck på den om du vill gå igenom den först.'
            : `Du har inte tittat på ${unreviewed} av delarna. Tryck på dem om du vill gå igenom dem först.`}
        </p>
      )}

      <button
        type="button"
        onClick={onSend}
        disabled={sending || !customerName}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 shadow-sm"
      >
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {sending ? 'Skickar…' : customerName ? `Skicka till ${customerName}` : 'Välj kund för att skicka'}
      </button>

      <button
        type="button"
        onClick={onOpenFullEditor}
        className="w-full mt-2.5 py-2.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
      >
        Öppna i fullständiga editorn
      </button>

      {/* "Fler inställningar" — Stil + Visning, Del 4. Genuint valfria
          presentationsval med rimliga defaultvärden, buntade ihop i en enda
          utfällning stängd som default (samma idiom som "Mer om projektet"
          i den delade headern). Monterar QuoteStylePicker och
          QuoteEditDisplaySettingsSection oförändrade — open/setOpen på den
          senare hårdkodas alltid-uppfälld eftersom utfällningen här redan
          är öppna/stängda-ytan (samma mönster som PaymentPlanSheet). */}
      <details className="mt-4 pt-4 border-t border-slate-100 group">
        <summary className="cursor-pointer list-none flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-primary-700 transition-colors select-none [&::-webkit-details-marker]:hidden">
          <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
          Fler inställningar
        </summary>
        <div className="mt-3 space-y-3">
          <QuoteStylePicker
            value={templateStyle}
            onChange={setTemplateStyle}
            businessDefaultStyle={businessDefaultStyle}
            accentColor={accentColor}
          />
          <QuoteEditDisplaySettingsSection
            open={true}
            setOpen={() => {}}
            detailLevel={detailLevel}
            setDetailLevel={setDetailLevel}
            showUnitPrices={showUnitPrices}
            setShowUnitPrices={setShowUnitPrices}
            showQuantities={showQuantities}
            setShowQuantities={setShowQuantities}
          />
        </div>
      </details>
    </div>
  )
}
