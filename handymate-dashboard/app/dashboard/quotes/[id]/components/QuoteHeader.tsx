'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  Bookmark,
  ChevronDown,
  Copy,
  Download,
  Edit,
  Eye,
  FileText,
  FolderKanban,
  GitBranch,
  MoreVertical,
  Receipt,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CopyId } from '@/components/CopyId'
import { computeVersionDiff, formatDate, getStatusStyle, getStatusText } from '../helpers'
import type { Quote, QuoteVersion } from '../types'

interface QuoteHeaderProps {
  quote: Quote
  quoteId: string
  versions: QuoteVersion[]
  portalUrl: string | null
  generatingPdf: boolean
  duplicating: boolean
  creatingVersion: boolean
  creatingProject: boolean
  creatingInvoice: boolean
  onOpenSendModal: () => void
  onGeneratePDF: () => void
  onCreateProject: () => void
  onCreateInvoice: () => void
  onDuplicate: () => void
  onSaveTemplate: () => void
  /** Öppnar page.tsx:s namn-modal — ETAPP 4, punkt 4: ingen window.prompt(). */
  onRequestNewVersion: () => void
  /** Öppnar page.tsx:s bekräftelsemodal — ETAPP 4, punkt 4: ingen window.confirm(). */
  onRequestDelete: () => void
}

// Knapp-mönster enligt designsystemet:
//   primary  = teal-700 fyllt, för CTAs (Skicka, Skapa projekt)
//   ghost    = vit + slate-200 border, för sekundära actions
//   danger   = vit + red text + red hover-tint
const PRIMARY_BTN =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50'

const GHOST_BTN =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-medium rounded-xl transition-colors disabled:opacity-50'

const MENU_ITEM =
  'w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:hover:bg-transparent'

const MENU_ITEM_DANGER =
  'w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors'

/**
 * ETAPP 4 (offert-masterplan.md), punkt 2 — åtgärdshierarki istället för
 * 10+ likvärdiga ghost-knappar:
 *  - PRIMÄR (en per status): draft→Skicka offert, sent/opened→Skicka
 *    påminnelse, accepted→Skapa projekt. declined/expired saknar ett
 *    naturligt "nästa steg" och får ingen primärknapp.
 *  - SEKUNDÄR: Redigera + en "Dokument"-dropdown (Visa i ny flik/Visa
 *    kundvy/Ladda ner PDF — tre knappar med samma Eye/Download-ikoner slås
 *    ihop till en meny).
 *  - "…"-OVERFLOW: Duplicera, Ny version, Spara mall, Skapa faktura (bara
 *    accepted — flyttad hit eftersom planen bara namnger EN primärknapp för
 *    accepted-status), Ta bort (bara draft).
 *  - Signeringslänken finns INTE här längre (punkt 6): QuoteSignatureCard
 *    är nu den enda platsen den genereras/kopieras.
 * Dropdown/overflow byggs med lokal useState + en fixed click-outside-
 * overlay — samma mönster som app/dashboard/projects/[id]/page.tsx
 * (renderMoreActionsMenu), inte ett nytt uppfunnet mönster.
 */
export function QuoteHeader({
  quote,
  quoteId,
  versions,
  portalUrl,
  generatingPdf,
  duplicating,
  creatingVersion,
  creatingProject,
  creatingInvoice,
  onOpenSendModal,
  onGeneratePDF,
  onCreateProject,
  onCreateInvoice,
  onDuplicate,
  onSaveTemplate,
  onRequestNewVersion,
  onRequestDelete,
}: QuoteHeaderProps) {
  const router = useRouter()
  const [docMenuOpen, setDocMenuOpen] = useState(false)
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)

  const closeMenus = () => {
    setDocMenuOpen(false)
    setMoreMenuOpen(false)
  }

  // Versionsdiff (punkt 5): jämför vald version mot närmast föregående
  // (version_number - 1 i samma familj). item_count kommer bara med i
  // API-svaret när >1 version finns (se app/api/quotes/route.ts).
  const currentVersion = versions.find(v => v.quote_id === quoteId)
  const previousVersion = currentVersion
    ? versions
        .filter(v => v.version_number < currentVersion.version_number)
        .sort((a, b) => b.version_number - a.version_number)[0] || null
    : null
  const versionDiff = currentVersion
    ? computeVersionDiff(
        { total: currentVersion.total, item_count: currentVersion.item_count ?? 0 },
        previousVersion ? { total: previousVersion.total, item_count: previousVersion.item_count ?? 0 } : null,
      )
    : null

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/quotes"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Tillbaka till offertlistan"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-heading text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2 flex-wrap">
              <span>{quote.title || 'Offert'}</span>
              {quote.quote_number && <CopyId value={quote.quote_number} />}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Skapad {formatDate(quote.created_at)}</p>
          </div>
        </div>
        <div>
          <span className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full ${getStatusStyle(quote.status)}`}>
            {getStatusText(quote.status)}
          </span>
        </div>
      </div>

      {/* Version selector */}
      {versions.length > 1 && (
        <div className="flex flex-col gap-1.5 mb-4 bg-white border border-slate-200 rounded-xl px-4 py-2.5">
          <div className="flex items-center gap-3">
            <GitBranch className="w-4 h-4 text-primary-700 flex-shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Version</span>
            <select
              value={quoteId}
              onChange={e => router.push(`/dashboard/quotes/${e.target.value}`)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-700"
            >
              {versions.map(v => (
                <option key={v.quote_id} value={v.quote_id}>
                  {v.version_label || `Version ${v.version_number}`}
                  {v.status === 'accepted' ? ' ✓' : v.status === 'sent' ? ' (skickad)' : v.status === 'draft' ? ' (utkast)' : ''}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-400">{versions.length} versioner</span>
          </div>
          {versionDiff && (
            <p className="text-xs text-slate-500 pl-7">{versionDiff}</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {/* Primär — en per status */}
        {quote.status === 'draft' && (
          <button onClick={onOpenSendModal} className={PRIMARY_BTN}>
            <Send className="w-4 h-4" />
            Skicka offert
          </button>
        )}
        {['sent', 'opened'].includes(quote.status) && (
          <button onClick={onOpenSendModal} className={PRIMARY_BTN}>
            <RefreshCw className="w-4 h-4" />
            Skicka påminnelse
          </button>
        )}
        {quote.status === 'accepted' && (
          <button onClick={onCreateProject} disabled={creatingProject} className={PRIMARY_BTN}>
            <FolderKanban className="w-4 h-4" />
            {creatingProject ? 'Skapar projekt…' : 'Skapa projekt'}
          </button>
        )}

        {/* Sekundär */}
        <Link href={`/dashboard/quotes/${quote.quote_id}/edit`} className={GHOST_BTN}>
          <Edit className="w-4 h-4" />
          Redigera
        </Link>

        <div className="relative">
          <button
            type="button"
            onClick={() => setDocMenuOpen(o => !o)}
            className={GHOST_BTN}
          >
            <FileText className="w-4 h-4" />
            Dokument
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${docMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          {docMenuOpen && (
            <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-60 overflow-hidden">
              <a
                href={`/api/quotes/pdf?id=${quote.quote_id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setDocMenuOpen(false)}
                className={MENU_ITEM}
              >
                <Eye className="w-4 h-4 text-slate-400" />
                Visa i ny flik
              </a>
              {quote.sign_token && (
                <a
                  href={portalUrl || `/quote/${quote.sign_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setDocMenuOpen(false)}
                  className={MENU_ITEM}
                >
                  <Eye className="w-4 h-4 text-slate-400" />
                  Visa kundvy
                </a>
              )}
              <button
                onClick={() => { setDocMenuOpen(false); onGeneratePDF() }}
                disabled={generatingPdf}
                className={MENU_ITEM}
              >
                <Download className="w-4 h-4 text-slate-400" />
                {generatingPdf ? 'Laddar ner…' : 'Ladda ner PDF'}
              </button>
            </div>
          )}
        </div>

        {/* Overflow */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMoreMenuOpen(o => !o)}
            className={GHOST_BTN}
            aria-label="Fler åtgärder"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {moreMenuOpen && (
            <div className="absolute top-full right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-20 w-56 overflow-hidden">
              <button onClick={() => { setMoreMenuOpen(false); onDuplicate() }} disabled={duplicating} className={MENU_ITEM}>
                <Copy className="w-4 h-4 text-slate-400" />
                {duplicating ? 'Duplicerar…' : 'Duplicera'}
              </button>
              <button onClick={() => { setMoreMenuOpen(false); onRequestNewVersion() }} disabled={creatingVersion} className={MENU_ITEM}>
                <GitBranch className="w-4 h-4 text-slate-400" />
                Ny version
              </button>
              <button onClick={() => { setMoreMenuOpen(false); onSaveTemplate() }} className={MENU_ITEM}>
                <Bookmark className="w-4 h-4 text-slate-400" />
                Spara mall
              </button>
              {quote.status === 'accepted' && (
                <button onClick={() => { setMoreMenuOpen(false); onCreateInvoice() }} disabled={creatingInvoice} className={MENU_ITEM}>
                  <Receipt className="w-4 h-4 text-slate-400" />
                  {creatingInvoice ? 'Skapar faktura…' : 'Skapa faktura'}
                </button>
              )}
              {quote.status === 'draft' && (
                <div className="border-t border-slate-100 mt-1 pt-1">
                  <button onClick={() => { setMoreMenuOpen(false); onRequestDelete() }} className={MENU_ITEM_DANGER}>
                    <Trash2 className="w-4 h-4" />
                    Ta bort
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Close dropdowns when clicking outside */}
      {(docMenuOpen || moreMenuOpen) && (
        <div className="fixed inset-0 z-10" onClick={closeMenus} />
      )}
    </>
  )
}
