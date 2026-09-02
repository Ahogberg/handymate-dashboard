'use client'

import { useEffect, useState } from 'react'
import { Copy, Loader2, Send, X } from 'lucide-react'

/**
 * "Skicka ÄTA" — bekräftelsedialog före SMS:et.
 *
 * ═══ VARFÖR ═══
 *
 * Tidigare skickades ÄTA:n direkt vid klick, utan att hantverkaren såg
 * vare sig mottagare eller text. GET /api/ata/[id]/send ger exakt den text
 * POST kommer att skicka (samma `losUtskick`), så det som visas här är det
 * kunden får — inte en approximation.
 */

interface Forhandsvisning {
  to: string | null
  customer_name: string | null
  message: string
  signUrl: string
}

export default function SendAtaDialog({ changeId, ataNumber, onClose, onSent, onError }: {
  changeId: string
  ataNumber?: number | null
  onClose: () => void
  onSent: () => void
  onError: (msg: string) => void
}) {
  const [preview, setPreview] = useState<Forhandsvisning | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [to, setTo] = useState('')
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let aktiv = true
    fetch(`/api/ata/${changeId}/send`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Kunde inte förbereda utskicket')
        return data as Forhandsvisning
      })
      .then(data => {
        if (!aktiv) return
        setPreview(data)
        setTo(data.to || '')
      })
      .catch(err => {
        if (aktiv) setLoadError(err.message)
      })
    return () => { aktiv = false }
  }, [changeId])

  const skicka = async () => {
    if (!to.trim()) {
      onError('Ange ett mobilnummer att skicka till')
      return
    }
    setSending(true)
    try {
      const res = await fetch(`/api/ata/${changeId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'sms', to: to.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunde inte skicka ÄTA')
      onSent()
    } catch (err: any) {
      onError(err.message || 'Kunde inte skicka ÄTA')
      setSending(false)
    }
  }

  const kopieraLank = async () => {
    if (!preview?.signUrl) return
    try {
      await navigator.clipboard.writeText(preview.signUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      onError('Kunde inte kopiera länken')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white sm:rounded-xl rounded-t-2xl border border-[#E2E8F0] w-full max-w-lg p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Skicka ÄTA{ataNumber ? `-${ataNumber}` : ''} till kund
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900" aria-label="Stäng">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loadError ? (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {loadError}
          </div>
        ) : !preview ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Förbereder utskicket…
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-500 mb-1.5 block">
                Mobilnummer{preview.customer_name ? ` · ${preview.customer_name}` : ''}
              </label>
              <input
                type="tel"
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="07x-xxx xx xx"
                inputMode="tel"
                className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
              />
              {!preview.to && (
                <p className="text-xs text-amber-600 mt-1">Kunden saknar telefonnummer — fyll i ett här.</p>
              )}
            </div>

            <div>
              <label className="text-sm text-gray-500 mb-1.5 block">SMS-text som skickas</label>
              <div className="p-3 rounded-lg bg-gray-50 border border-[#E2E8F0] text-sm text-gray-700 whitespace-pre-wrap break-words">
                {preview.message}
              </div>
            </div>

            <button
              type="button"
              onClick={kopieraLank}
              className="flex items-center gap-1.5 text-sm text-primary-700 font-medium hover:underline"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? 'Länk kopierad' : 'Kopiera signeringslänken i stället'}
            </button>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-100"
          >
            Avbryt
          </button>
          <button
            onClick={skicka}
            disabled={!preview || sending || !to.trim()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Skicka SMS
          </button>
        </div>
      </div>
    </div>
  )
}
