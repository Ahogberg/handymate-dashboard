'use client'

// Uppföljning 1/2/3-pills per kund (partnerprogram v2, 2026-08-11).
// Tap på tom pill → loggas direkt (optimistiskt) med möjlighet till
// anteckning; tap på ifylld pill → visa/redigera/ångra.

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { formatDate, type Followup } from './types'

interface Props {
  businessId: string
  followups: Followup[]
  onChanged: () => void
}

export default function FollowupPills({ businessId, followups, onChanged }: Props) {
  const [openNr, setOpenNr] = useState<1 | 2 | 3 | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const byNr = new Map(followups.map(f => [f.nr, f]))

  async function spara(nr: 1 | 2 | 3) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/partners/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, followup_nr: nr, note: note || null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error || 'Kunde inte spara')
        return
      }
      setOpenNr(null)
      setNote('')
      onChanged()
    } catch {
      setError('Nätverksfel')
    } finally {
      setBusy(false)
    }
  }

  async function angra(nr: 1 | 2 | 3) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/partners/followups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, followup_nr: nr }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error || 'Kunde inte ångra')
        return
      }
      setOpenNr(null)
      setNote('')
      onChanged()
    } catch {
      setError('Nätverksfel')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Uppföljning:</span>
        {([1, 2, 3] as const).map(nr => {
          const gjord = byNr.get(nr)
          return (
            <button
              key={nr}
              onClick={e => {
                e.stopPropagation()
                setNote(gjord?.note || '')
                setOpenNr(openNr === nr ? null : nr)
                setError(null)
              }}
              className={`min-w-[44px] min-h-[32px] px-2.5 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 ${
                gjord
                  ? 'bg-primary-50 border-primary-300 text-primary-800'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-primary-300 hover:text-primary-700'
              }`}
              title={gjord ? `Gjord ${formatDate(gjord.done_at)}${gjord.note ? ` — ${gjord.note}` : ''}` : `Markera uppföljning ${nr}`}
            >
              {gjord && <Check className="w-3 h-3" />}
              {nr}
            </button>
          )
        })}
      </div>

      {openNr !== null && (
        <div
          className="mt-2 p-3 bg-slate-50 border border-gray-200 rounded-lg space-y-2"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-700">
              Uppföljning {openNr}
              {byNr.get(openNr) && (
                <span className="text-gray-400 font-normal"> · gjord {formatDate(byNr.get(openNr)!.done_at)}</span>
              )}
            </p>
            <button onClick={() => setOpenNr(null)} className="p-1 text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Anteckning (valfritt) — t.ex. ringde, mejlade, bokade möte"
            maxLength={500}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => spara(openNr)}
              disabled={busy}
              className="px-3 py-1.5 bg-primary-800 text-white text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {byNr.get(openNr) ? 'Uppdatera' : 'Markera gjord'}
            </button>
            {byNr.get(openNr) && (
              <button
                onClick={() => angra(openNr)}
                disabled={busy}
                className="px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Ångra
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
