'use client'

import {
  ArrowLeft,
  Bookmark,
  Copy,
  Download,
  Edit,
  Eye,
  FolderKanban,
  GitBranch,
  Link2,
  Loader2,
  Receipt,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CopyId } from '@/components/CopyId'
import { formatDate, getStatusStyle, getStatusText } from '../helpers'
import type { Quote, QuoteVersion } from '../types'

interface QuoteHeaderProps {
  quote: Quote
  quoteId: string
  versions: QuoteVersion[]
  portalUrl: string | null
  generatingPdf: boolean
  generatingSignLink: boolean
  duplicating: boolean
  creatingVersion: boolean
  creatingProject: boolean
  creatingInvoice: boolean
  onOpenSendModal: () => void
  onGeneratePDF: () => void
  onGenerateSignLink: () => void
  onCreateProject: () => void
  onCreateInvoice: () => void
  onDuplicate: () => void
  onCreateNewVersion: () => void
  onSaveTemplate: () => void
  onDelete: () => void
}

// Knapp-mönster enligt designsystemet:
//   primary  = teal-700 fyllt, för CTAs (Skicka, Skapa projekt, Skapa faktura)
//   ghost    = vit + slate-200 border, för sekundära actions
//   danger   = vit + red text + red hover-tint
const PRIMARY_BTN =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50'

const GHOST_BTN =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-medium rounded-xl transition-colors disabled:opacity-50'

const DANGER_BTN =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 text-red-600 text-sm font-medium rounded-xl transition-colors'

export function QuoteHeader({
  quote,
  quoteId,
  versions,
  portalUrl,
  generatingPdf,
  generatingSignLink,
  duplicating,
  creatingVersion,
  creatingProject,
  creatingInvoice,
  onOpenSendModal,
  onGeneratePDF,
  onGenerateSignLink,
  onCreateProject,
  onCreateInvoice,
  onDuplicate,
  onCreateNewVersion,
  onSaveTemplate,
  onDelete,
}: QuoteHeaderProps) {
  const router = useRouter()

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
        <div className="flex items-center gap-3 mb-4 bg-white border border-slate-200 rounded-xl px-4 py-2.5">
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
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        {quote.status === 'draft' && (
          <button onClick={onOpenSendModal} className={PRIMARY_BTN}>
            <Send className="w-4 h-4" />
            Skicka offert
          </button>
        )}
        {quote.sign_token && (
          <a
            href={portalUrl || `/quote/${quote.sign_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className={GHOST_BTN}
          >
            <Eye className="w-4 h-4" />
            Visa kundvy
          </a>
        )}
        {['draft', 'sent', 'opened'].includes(quote.status) && (
          <button onClick={onGenerateSignLink} disabled={generatingSignLink} className={GHOST_BTN}>
            {generatingSignLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Signeringslänk
          </button>
        )}
        {['sent', 'opened'].includes(quote.status) && (
          <button onClick={onOpenSendModal} className={PRIMARY_BTN}>
            <RefreshCw className="w-4 h-4" />
            Skicka påminnelse
          </button>
        )}
        {quote.status === 'accepted' && (
          <>
            <button onClick={onCreateProject} disabled={creatingProject} className={PRIMARY_BTN}>
              {creatingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderKanban className="w-4 h-4" />}
              Skapa projekt
            </button>
            <button onClick={onCreateInvoice} disabled={creatingInvoice} className={PRIMARY_BTN}>
              {creatingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
              Skapa faktura
            </button>
          </>
        )}
        <Link href={`/dashboard/quotes/${quote.quote_id}/edit`} className={GHOST_BTN}>
          <Edit className="w-4 h-4" />
          Redigera
        </Link>
        <button onClick={onDuplicate} disabled={duplicating} className={GHOST_BTN}>
          {duplicating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
          Duplicera
        </button>
        <button onClick={onCreateNewVersion} disabled={creatingVersion} className={GHOST_BTN}>
          {creatingVersion ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
          Ny version
        </button>
        <button onClick={onGeneratePDF} disabled={generatingPdf} className={GHOST_BTN}>
          {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Ladda ner PDF
        </button>
        <button onClick={onSaveTemplate} className={GHOST_BTN}>
          <Bookmark className="w-4 h-4" />
          Spara mall
        </button>
        {quote.status === 'draft' && (
          <button onClick={onDelete} className={DANGER_BTN}>
            <Trash2 className="w-4 h-4" />
            Ta bort
          </button>
        )}
      </div>
    </>
  )
}
