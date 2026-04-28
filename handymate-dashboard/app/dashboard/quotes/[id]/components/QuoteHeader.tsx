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
  onPreviewPDF: () => void
  onGeneratePDF: () => void
  onGenerateSignLink: () => void
  onCreateProject: () => void
  onCreateInvoice: () => void
  onDuplicate: () => void
  onCreateNewVersion: () => void
  onSaveTemplate: () => void
  onDelete: () => void
}

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
  onPreviewPDF,
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
        <div className="flex items-center gap-4">
          <Link href="/dashboard/quotes" className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              {quote.title || 'Offert'}
              {quote.quote_number && (
                <span className="ml-2"><CopyId value={quote.quote_number} /></span>
              )}
            </h1>
            <p className="text-sm text-gray-500">Skapad {formatDate(quote.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1.5 text-sm rounded-full border ${getStatusStyle(quote.status)}`}>
            {getStatusText(quote.status)}
          </span>
        </div>
      </div>

      {/* Version selector */}
      {versions.length > 1 && (
        <div className="flex items-center gap-3 mb-4 bg-white border border-[#E2E8F0] rounded-xl p-3">
          <GitBranch className="w-4 h-4 text-primary-700 flex-shrink-0" />
          <span className="text-sm text-gray-500">Version:</span>
          <select
            value={quoteId}
            onChange={e => router.push(`/dashboard/quotes/${e.target.value}`)}
            className="text-sm border border-[#E2E8F0] rounded-lg px-3 py-1.5 bg-white text-gray-900 font-medium focus:ring-1 focus:ring-primary-600 focus:border-primary-600"
          >
            {versions.map(v => (
              <option key={v.quote_id} value={v.quote_id}>
                {v.version_label || `Version ${v.version_number}`}
                {v.status === 'accepted' ? ' ✓' : v.status === 'sent' ? ' (skickad)' : v.status === 'draft' ? ' (utkast)' : ''}
              </option>
            ))}
          </select>
          <span className="text-xs text-gray-400">{versions.length} versioner</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        {quote.status === 'draft' && (
          <button
            onClick={onOpenSendModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90"
          >
            <Send className="w-4 h-4" />
            Skicka offert
          </button>
        )}
        {quote.sign_token && (
          <a
            href={portalUrl || `/quote/${quote.sign_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200"
          >
            <Eye className="w-4 h-4" />
            Förhandsgranska
          </a>
        )}
        {['draft', 'sent', 'opened'].includes(quote.status) && (
          <button
            onClick={onGenerateSignLink}
            disabled={generatingSignLink}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200 disabled:opacity-50"
          >
            {generatingSignLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Signeringslänk
          </button>
        )}
        {['sent', 'opened'].includes(quote.status) && (
          <button
            onClick={onOpenSendModal}
            className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90"
          >
            <RefreshCw className="w-4 h-4" />
            Skicka påminnelse
          </button>
        )}
        {quote.status === 'accepted' && (
          <>
            <button
              onClick={onCreateProject}
              disabled={creatingProject}
              className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
            >
              {creatingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderKanban className="w-4 h-4" />}
              Skapa projekt
            </button>
            <button
              onClick={onCreateInvoice}
              disabled={creatingInvoice}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-primary-600 rounded-xl text-gray-900 font-medium hover:opacity-90 disabled:opacity-50"
            >
              {creatingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
              Skapa faktura
            </button>
          </>
        )}
        <Link
          href={`/dashboard/quotes/${quote.quote_id}/edit`}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200"
        >
          <Edit className="w-4 h-4" />
          Redigera
        </Link>
        <button
          onClick={onDuplicate}
          disabled={duplicating}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200 disabled:opacity-50"
        >
          {duplicating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
          Duplicera
        </button>
        <button
          onClick={onCreateNewVersion}
          disabled={creatingVersion}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200 disabled:opacity-50"
        >
          {creatingVersion ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
          Ny version
        </button>
        <button
          onClick={onPreviewPDF}
          disabled={generatingPdf}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200 disabled:opacity-50"
        >
          {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          Förhandsgranska
        </button>
        <button
          onClick={onGeneratePDF}
          disabled={generatingPdf}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200 disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          Ladda ner PDF
        </button>
        <button
          onClick={onSaveTemplate}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200"
        >
          <Bookmark className="w-4 h-4" />
          Spara mall
        </button>
        {quote.status === 'draft' && (
          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-red-600 hover:bg-red-500/10 hover:border-red-500/30"
          >
            <Trash2 className="w-4 h-4" />
            Ta bort
          </button>
        )}
      </div>
    </>
  )
}
