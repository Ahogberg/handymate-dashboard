'use client'

import { useCallback, useEffect, useState } from 'react'
import { Layers, Loader2, Lock, Plus, RefreshCw } from 'lucide-react'

/**
 * AtaCard (Etapp 4b steg 2, 2026-05-23).
 *
 * Self-contained ÄTA-lista. Fetchar från /api/projects/[id]/changes
 * (med server-side stripping för icke-see_financials).
 *
 * Visar:
 * - Mini-stack med rader (ata_number, status, titel, belopp)
 * - Status-härledning från signed_at/sent_at/declined_at-fälten
 * - Summary-grid (Signerade / Väntar svar / Utkast)
 *
 * Pris-stripping: respekterar prices_redacted-flaggan från servern.
 * Icke-OWA-med-see_financials ser titel + status, INTE belopp.
 */

interface AtaCardProps {
  projectId: string
  onNewAta?: () => void
}

interface AtaChange {
  change_id: string
  ata_number: number | null
  description: string | null
  amount: number | null
  total: number | null
  status: string | null
  signed_at: string | null
  sent_at: string | null
  declined_at: string | null
  signed_by_name: string | null
  created_at: string
}

type AtaStatus = 'signed' | 'sent' | 'declined' | 'draft'

function deriveStatus(c: AtaChange): AtaStatus {
  if (c.signed_at !== null || c.status === 'signed' || c.status === 'invoiced') return 'signed'
  if (c.declined_at !== null || c.status === 'declined') return 'declined'
  if (c.sent_at !== null) return 'sent'
  return 'draft'
}

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86400000)
  if (days === 0) return 'idag'
  if (days === 1) return '1 dag sen'
  if (days < 30) return `${days} dagar sen`
  return formatDate(iso)
}

export function AtaCard({ projectId, onNewAta }: AtaCardProps) {
  const [changes, setChanges] = useState<AtaChange[]>([])
  const [pricesRedacted, setPricesRedacted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/changes`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || `HTTP ${res.status}`)
      }
      const payload = await res.json()
      setChanges(Array.isArray(payload.changes) ? payload.changes : [])
      setPricesRedacted(payload.prices_redacted === true)
    } catch (err: any) {
      setError(err.message || 'Kunde inte hämta ÄTA')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading && changes.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 flex items-center justify-center">
        <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
      </div>
    )
  }

  // Tomt-tillstånd: visa header + add-button + tomt-meddelande
  if (changes.length === 0 && !error) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <div className="flex items-baseline justify-between mb-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <Layers className="w-3 h-3" />
            ÄTA
          </span>
          {onNewAta && (
            <button
              type="button"
              onClick={onNewAta}
              className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:text-primary-600"
            >
              <Plus className="w-3 h-3" />
              Nytt tilläggsarbete
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500 italic mt-3">
          Inga tilläggsarbeten registrerade. Tilläggsarbeten räknas till intäkten när de är signerade.
        </p>
      </div>
    )
  }

  // Beräkna summary (per status)
  const signed = changes.filter(c => deriveStatus(c) === 'signed')
  const sent = changes.filter(c => deriveStatus(c) === 'sent')
  const drafts = changes.filter(c => deriveStatus(c) === 'draft')

  const sumOf = (arr: AtaChange[]) =>
    arr.reduce((s, c) => s + (Number(c.total ?? c.amount ?? 0) || 0), 0)

  const signedSum = sumOf(signed)
  const sentSum = sumOf(sent)
  const draftSum = sumOf(drafts)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-baseline justify-between mb-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <Layers className="w-3 h-3" />
          ÄTA
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fetchData()}
            title="Uppdatera"
            className="text-slate-400 hover:text-slate-600"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          {onNewAta && (
            <button
              type="button"
              onClick={onNewAta}
              className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:text-primary-600"
            >
              <Plus className="w-3 h-3" />
              Nytt tilläggsarbete
            </button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-slate-500 mb-3">
        Tilläggsarbeten räknas till intäkten <strong>när de är signerade</strong>.
      </p>

      {/* Mini stack */}
      <div className="flex flex-col gap-1">
        {changes.map(c => (
          <AtaMiniRow key={c.change_id} change={c} pricesRedacted={pricesRedacted} />
        ))}
      </div>

      {/* Summary grid */}
      {!pricesRedacted && (
        <div className="mt-3 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-3 gap-2.5">
          <SummaryStat
            label="Signerade"
            value={signedSum}
            sub={`${signed.length} st · ingår i intäkt`}
            colorClass="text-emerald-700"
          />
          <SummaryStat
            label="Väntar svar"
            value={sentSum}
            sub={`${sent.length} st`}
            colorClass="text-amber-700"
          />
          <SummaryStat
            label="Utkast"
            value={draftSum}
            sub={`${drafts.length} st · inte skickade`}
            colorClass="text-slate-500"
          />
        </div>
      )}

      {pricesRedacted && (
        <div className="mt-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-2 text-xs text-slate-500">
          <Lock className="w-3.5 h-3.5" />
          Priser visas endast för dig med ekonomi-behörighet
        </div>
      )}
    </div>
  )
}

function AtaMiniRow({
  change,
  pricesRedacted,
}: {
  change: AtaChange
  pricesRedacted: boolean
}) {
  const status = deriveStatus(change)
  const cfg = {
    signed: {
      dotClass: 'bg-emerald-500',
      label: change.signed_at ? `Signerad ${formatDate(change.signed_at)}` : 'Signerad',
      colorClass: 'text-emerald-700',
    },
    sent: {
      dotClass: 'bg-amber-500',
      label: change.sent_at ? `Skickad · ${relativeTime(change.sent_at)}` : 'Skickad',
      colorClass: 'text-amber-700',
    },
    declined: {
      dotClass: 'bg-red-500',
      label: 'Avvisad',
      colorClass: 'text-red-700',
    },
    draft: {
      dotClass: 'bg-slate-400',
      label: 'Utkast',
      colorClass: 'text-slate-500',
    },
  }[status]

  const negative = (change.total ?? change.amount ?? 0) < 0
  const muted = status === 'draft' || status === 'declined'

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2.5 bg-white border border-slate-200 rounded-lg ${
        muted ? 'opacity-70' : ''
      }`}
    >
      <span className="text-[10px] font-bold text-slate-400 tracking-wider w-12 flex-shrink-0">
        ÄTA #{change.ata_number ?? '?'}
      </span>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass} flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-800 truncate">
          {change.description || '(utan beskrivning)'}
        </div>
        <div className={`text-[10px] mt-0.5 ${cfg.colorClass}`}>{cfg.label}</div>
      </div>
      {!pricesRedacted && (
        <div
          className={`text-sm font-bold tabular-nums ${
            muted
              ? 'text-slate-500'
              : negative
                ? 'text-red-700'
                : 'text-emerald-700'
          }`}
        >
          {(change.total ?? change.amount ?? 0) > 0 ? '+' : ''}
          {formatKr(change.total ?? change.amount)}
        </div>
      )}
    </div>
  )
}

function SummaryStat({
  label,
  value,
  sub,
  colorClass,
}: {
  label: string
  value: number
  sub: string
  colorClass: string
}) {
  return (
    <div>
      <div className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">{label}</div>
      <div className={`text-base font-bold tabular-nums mt-0.5 ${colorClass}`}>
        {value > 0 ? '+' : ''}
        {formatKr(value)}
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
    </div>
  )
}
