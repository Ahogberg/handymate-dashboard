'use client'

import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface QuoteEditHeaderProps {
  quoteNumber: string
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error'
}

export function QuoteEditHeader({ quoteNumber, autoSaveStatus }: QuoteEditHeaderProps) {
  return (
    <header className="sticky top-0 z-30 -mx-4 sm:-mx-6 mb-6 px-4 sm:px-6 py-3 bg-slate-50/95 backdrop-blur-sm border-b border-slate-200">
      <div className="flex items-center gap-3">
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
      cls: 'text-slate-500',
    },
    saved: {
      icon: <Check className="w-3 h-3" />,
      label: 'Sparad',
      cls: 'text-green-700',
    },
    error: {
      icon: null,
      label: 'Kunde inte spara',
      cls: 'text-red-600',
    },
  }[status]

  return (
    <span className={`ml-auto text-xs font-medium flex items-center gap-1 ${cfg.cls}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  )
}
