'use client'

// Avtalsgrind (P0-9, 2026-09-01). Visas för partners som saknar loggad
// acceptans av gällande Partneravtal — antingen i portalen (cookie) eller via
// den signerade engångslänken som admin mejlar till en partner som inte kan
// logga in än (capability). Samma bevis loggas i båda fallen.

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, FileText, Zap } from 'lucide-react'

interface Props {
  partnerName: string
  agreementVersion: string
  /** Sätts bara på engångslänk-sidan — då bär POST:en partnerId + token istället för cookie. */
  capability?: { partnerId: string; token: string }
  onAccepted: () => void
}

export default function AgreementGate({ partnerName, agreementVersion, capability, onAccepted }: Props) {
  const [accepted, setAccepted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/partners/agreement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreementAccepted: accepted, ...(capability || {}) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Acceptansen kunde inte sparas')
        return
      }
      onAccepted()
    } catch {
      setError('Nätverksfel — försök igen')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="border-b border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-800 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">Handymate</span>
          <span className="text-sm text-primary-700 font-medium ml-1">Partner</span>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 p-6 sm:p-8">
          <div className="w-12 h-12 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center mb-5">
            <FileText className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Hej {partnerName} — ett avtal att godkänna</h1>
          <p className="text-sm text-gray-600 mb-4">
            Vi har fastställt partnerprogrammets villkor i ett skriftligt partneravtal (version {agreementVersion}).
            Standardprovisionen är <strong>20 % av nettoabonnemangsintäkten i 36 kalendermånader</strong> per hänvisad
            kund, 0 % därefter. Inga befintliga hänvisningar eller provisionsbelopp har påverkats.
          </p>
          <p className="text-sm text-gray-600 mb-6">
            Innan du kan använda portalen eller lämna nya hänvisningar behöver du läsa och godkänna avtalet.
          </p>

          <Link
            href="/partners/avtal"
            target="_blank"
            className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-900 hover:border-primary-300 hover:bg-primary-50/40 transition-colors mb-5"
          >
            <span>Läs partneravtalet (öppnas i ny flik)</span>
            <FileText className="w-4 h-4 text-primary-700" />
          </Link>

          <label className="flex items-start gap-2.5 text-sm text-gray-600 mb-5">
            <input
              type="checkbox"
              checked={accepted}
              onChange={e => setAccepted(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-primary-700 focus:ring-primary-600"
            />
            <span>Jag har läst och godkänner Handymates partneravtal, version {agreementVersion}.</span>
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
          )}

          <button
            onClick={submit}
            disabled={!accepted || saving}
            className="w-full py-3 bg-primary-800 text-white font-medium rounded-lg hover:bg-primary-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sparar...
              </>
            ) : (
              'Godkänn avtalet'
            )}
          </button>

          <p className="text-xs text-gray-400 mt-4">
            Vi loggar version, tidpunkt och IP-adress som bevis på din acceptans.
          </p>
        </div>
      </div>
    </div>
  )
}
