'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle, Loader2 } from 'lucide-react'
import SignatureCanvas, {
  ClearSignatureButton,
  type SignatureCanvasHandle,
} from './SignatureCanvas'

interface QuoteSigningModalProps {
  signToken: string
  initialSignerName: string
  onSigned: (quoteId: string) => void
  onCancel: () => void
  quoteId: string
}

/**
 * Inline signering av offert (rendered conditionally inom QuotesList per offert).
 * Trots filnamnet "Modal" är detta INTE en overlay — det är en expanderbar
 * sektion under offert-kortet, exakt som i originalet.
 *
 * Extraherat från page.tsx vid komponent-splitten — INGEN visuell ändring.
 * Behåller exakt state-pattern (signerName, signatureDrawn, termsAccepted, saving).
 */
export default function QuoteSigningModal({
  signToken,
  initialSignerName,
  onSigned,
  onCancel,
  quoteId,
}: QuoteSigningModalProps) {
  const [signerName, setSignerName] = useState(initialSignerName)
  const [signatureDrawn, setSignatureDrawn] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef<SignatureCanvasHandle>(null)

  useEffect(() => {
    setTimeout(() => canvasRef.current?.init(), 100)
  }, [])

  async function sign() {
    if (!signerName.trim() || !signatureDrawn || !termsAccepted) return
    setSaving(true)
    try {
      const signatureData = canvasRef.current?.toDataURL()
      if (!signatureData) {
        setSaving(false)
        return
      }
      const res = await fetch(`/api/quotes/public/${signToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sign',
          name: signerName.trim(),
          signature_data: signatureData,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Kunde inte signera offerten')
      } else {
        onSigned(quoteId)
      }
    } catch {
      alert('Kunde inte signera offerten')
    }
    setSaving(false)
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
      <h4 className="font-semibold text-gray-900 text-sm">Signera offerten</h4>

      <div>
        <label className="text-xs text-gray-500 block mb-1">Ditt namn</label>
        <input
          type="text"
          value={signerName}
          onChange={e => setSignerName(e.target.value)}
          placeholder="Förnamn Efternamn"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/50"
        />
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-1">Din signatur</label>
        <SignatureCanvas
          ref={canvasRef}
          mode="quote"
          className="w-full h-28 cursor-crosshair touch-none"
          placeholder="Rita din signatur här"
          onChange={setSignatureDrawn}
        />
        {signatureDrawn && (
          <ClearSignatureButton
            variant="inline"
            onClick={() => {
              canvasRef.current?.clear()
              setSignatureDrawn(false)
            }}
          />
        )}
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-600 cursor-pointer">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={e => setTermsAccepted(e.target.checked)}
          className="mt-0.5 rounded border-gray-300"
        />
        Jag godkänner offerten och dess villkor
      </label>

      <div className="flex gap-2">
        <button
          onClick={sign}
          disabled={!signerName.trim() || !signatureDrawn || !termsAccepted || saving}
          className="flex-1 py-2.5 bg-primary-700 text-white rounded-lg text-sm font-semibold hover:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          {saving ? 'Signerar...' : 'Godkänn offert'}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-500 hover:bg-gray-50"
        >
          Avbryt
        </button>
      </div>
    </div>
  )
}
