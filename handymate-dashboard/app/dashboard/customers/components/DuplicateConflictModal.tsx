'use client'

import Link from 'next/link'
import { AlertTriangle, X } from 'lucide-react'

export interface DuplicateMatch {
  customer_id: string
  name: string
  phone_number: string | null
  email: string | null
  address_line: string | null
  created_at: string
  match_type: 'phone' | 'email' | 'name_address'
}

interface DuplicateConflictModalProps {
  duplicates: DuplicateMatch[]
  saving: boolean
  onClose: () => void
  onForceCreate: () => void
}

const MATCH_LABELS: Record<DuplicateMatch['match_type'], string> = {
  phone: 'Samma telefon',
  email: 'Samma e-post',
  name_address: 'Samma namn + adress',
}

const MATCH_TONES: Record<DuplicateMatch['match_type'], string> = {
  phone: 'bg-amber-50 text-amber-700 border border-amber-200',
  email: 'bg-blue-50 text-blue-700 border border-blue-200',
  name_address: 'bg-slate-100 text-slate-700 border border-slate-200',
}

/**
 * Visas när backend hittat matchande kunder vid create. Användaren kan:
 *   1. Klicka en befintlig kund-rad → öppnar kundvy (avbryter create)
 *   2. "Skapa ändå" → POST igen med force_create: true
 *   3. "Avbryt" → stäng modal, gå tillbaka till create-formuläret
 */
export function DuplicateConflictModal({
  duplicates,
  saving,
  onClose,
  onForceCreate,
}: DuplicateConflictModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-heading text-lg font-bold text-slate-900 tracking-tight">
                Möjlig dubblett
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">
                {duplicates.length === 1
                  ? 'En kund med samma kontaktuppgifter finns redan.'
                  : `${duplicates.length} kunder med samma kontaktuppgifter finns redan.`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Stäng"
            className="p-1.5 -m-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2 mb-5 max-h-72 overflow-y-auto">
          {duplicates.map(dup => (
            <Link
              key={dup.customer_id}
              href={`/dashboard/customers/${dup.customer_id}`}
              className="block p-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="font-medium text-sm text-slate-900 truncate">{dup.name}</p>
                <span
                  className={`flex-shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full ${MATCH_TONES[dup.match_type]}`}
                >
                  {MATCH_LABELS[dup.match_type]}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">
                {dup.phone_number || '—'}
                {dup.email && <> · {dup.email}</>}
              </p>
              {dup.address_line && (
                <p className="text-[11px] text-slate-400 truncate mt-0.5">{dup.address_line}</p>
              )}
            </Link>
          ))}
        </div>

        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          Klicka en kund ovan för att öppna den befintliga, eller skapa en ny kund ändå om det
          verkligen är en separat person/företag.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={onForceCreate}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {saving ? 'Skapar…' : 'Skapa ändå'}
          </button>
        </div>
      </div>
    </div>
  )
}
