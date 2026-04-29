'use client'

import { ArrowLeft, Bookmark, Check, Loader2, Send } from 'lucide-react'
import Link from 'next/link'

interface QuoteEditHeaderProps {
  quoteNumber: string
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error'
  // Action-knappar (rendas i sticky top-bar; tidigare i högerkolumnen)
  saving: boolean
  canSend: boolean
  hasItems: boolean
  onSendQuote: () => void
  onSaveDraft: () => void
  onSaveTemplate: () => void
}

export function QuoteEditHeader({
  quoteNumber,
  autoSaveStatus,
  saving,
  canSend,
  hasItems,
  onSendQuote,
  onSaveDraft,
  onSaveTemplate,
}: QuoteEditHeaderProps) {
  return (
    <header className="sticky top-0 z-30 -mx-4 sm:-mx-6 mb-6 px-4 sm:px-6 py-3 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/dashboard/quotes"
          className="p-2 -ml-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Tillbaka till offertlistan"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="font-heading text-lg sm:text-xl font-bold text-slate-900 tracking-tight truncate">
            Redigerar offert
          </h1>
          {quoteNumber && (
            <span className="text-xs font-medium text-slate-500 font-mono">{quoteNumber}</span>
          )}
        </div>

        {/* Auto-save indicator */}
        <AutoSaveIndicator status={autoSaveStatus} />

        {/* Action buttons — sticky CTAs i headern */}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
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
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={saving}
            className="px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            Spara utkast
          </button>
          <button
            type="button"
            onClick={onSendQuote}
            disabled={saving || !canSend}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-700 hover:bg-primary-600 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-sm"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {saving ? 'Sparar…' : 'Skicka offert'}
          </button>
        </div>
      </div>
    </header>
  )
}

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
