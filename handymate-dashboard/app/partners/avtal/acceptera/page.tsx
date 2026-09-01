'use client'

// Engångslänk för avtalsacceptans (P0-9, 2026-09-01):
// /partners/avtal/acceptera?partner=<id>&token=<hmac>
// Skickas av admin till partners som inte kan logga in än (väntar på
// godkännande) — godkännandet är spärrat tills acceptansen är loggad.

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, CheckCircle2, Zap } from 'lucide-react'
import AgreementGate from '../../components/AgreementGate'

interface LinkStatus {
  name: string
  company: string | null
  status: string
  agreement_version: string
  already_accepted: boolean
}

function Shell({ children }: { children: React.ReactNode }) {
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
      <div className="flex-1 flex items-center justify-center px-4 py-12">{children}</div>
    </div>
  )
}

function AcceptAgreementInner() {
  const params = useSearchParams()
  const partnerId = params.get('partner') || ''
  const token = params.get('token') || ''

  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState(false)
  const [info, setInfo] = useState<LinkStatus | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!partnerId || !token) {
      setInvalid(true)
      setLoading(false)
      return
    }
    fetch(`/api/partners/agreement?partner=${encodeURIComponent(partnerId)}&token=${encodeURIComponent(token)}`)
      .then(async res => {
        if (!res.ok) {
          setInvalid(true)
          return
        }
        setInfo(await res.json())
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false))
  }, [partnerId, token])

  if (loading) {
    return (
      <Shell>
        <Loader2 className="w-8 h-8 text-primary-700 animate-spin" />
      </Shell>
    )
  }

  if (invalid || !info) {
    return (
      <Shell>
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <h1 className="text-lg font-bold text-gray-900 mb-2">Länken är ogiltig</h1>
          <p className="text-sm text-gray-600">
            Kontakta oss på hej@handymate.se så skickar vi en ny länk.
          </p>
        </div>
      </Shell>
    )
  }

  if (done || info.already_accepted) {
    const pending = info.status === 'pending_approval'
    return (
      <Shell>
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Avtalet är godkänt</h1>
          <p className="text-sm text-gray-600 mb-6">
            {pending
              ? 'Tack! Din ansökan granskas nu, och du får ett mejl så snart ditt partnerkonto är aktiverat.'
              : 'Tack! Du kan fortsätta till partnerportalen.'}
          </p>
          {!pending && (
            <Link href="/partners/login" className="inline-block px-5 py-2.5 bg-primary-800 text-white text-sm font-medium rounded-lg hover:bg-primary-900 transition-colors">
              Till portalen
            </Link>
          )}
        </div>
      </Shell>
    )
  }

  return (
    <AgreementGate
      partnerName={info.name}
      agreementVersion={info.agreement_version}
      capability={{ partnerId, token }}
      onAccepted={() => setDone(true)}
    />
  )
}

export default function AcceptAgreementPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <Loader2 className="w-8 h-8 text-primary-700 animate-spin" />
        </Shell>
      }
    >
      <AcceptAgreementInner />
    </Suspense>
  )
}
