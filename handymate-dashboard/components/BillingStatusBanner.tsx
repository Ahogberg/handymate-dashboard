'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CreditCard, Clock, Sparkles } from 'lucide-react'

interface BillingStatus {
  subscription_status: string | null
  stripe_subscription_id: string | null
  trial_ends_at: string | null
  first_receipt: { text: string; link: string | null; at: string } | null
}

/**
 * Visar en banner högst upp på dashboarden om:
 * - Betalning misslyckades (past_due)
 * - Provperioden har gått ut
 * - Teamet har bevisat sitt första resultat och kontot saknar betalning
 *   ("Aktivera senare", 2026-09-02) — betalfrågan ställs när den är förtjänt
 * - Provperioden går ut snart (≤ 7 dagar kvar)
 *
 * Tyst och osynlig för aktiva prenumerationer och comp-konton.
 *
 * Läser GET /api/billing (svarsformen subscription.status / trial.ends_at /
 * first_receipt). Tidigare lästes data.subscription_status, som rutten
 * aldrig returnerat — bannern var alltså osynlig för alla, alltid.
 */
export default function BillingStatusBanner() {
  const [status, setStatus] = useState<BillingStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    fetch('/api/billing')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setStatus({
            subscription_status: data.subscription?.status || null,
            stripe_subscription_id: data.subscription?.stripe_subscription_id || null,
            trial_ends_at: data.trial?.ends_at || null,
            first_receipt: data.first_receipt || null,
          })
        }
      })
      .catch(() => { /* silent */ })
  }, [])

  if (!status || dismissed) return null

  const sub = String(status.subscription_status || '').toLowerCase()

  // Past due — kritisk
  if (sub === 'past_due') {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <CreditCard className="w-4 h-4 text-red-700 flex-shrink-0" />
            <p className="text-sm text-red-900 truncate">
              <strong>Betalning misslyckades.</strong> Uppdatera kortet för att fortsätta använda Handymate.
            </p>
          </div>
          <Link
            href="/dashboard/settings/billing"
            className="flex-shrink-0 px-3 py-1 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700"
          >
            Uppdatera betalning
          </Link>
        </div>
      </div>
    )
  }

  // Provperiod — 'trial' (nyregistrerad utan kort) och 'trialing' (Stripe-trial)
  const iProvperiod = sub === 'trial' || sub === 'trialing'
  if (iProvperiod && status.trial_ends_at) {
    const trialEnd = new Date(status.trial_ends_at)
    const daysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000)

    // Trial gått ut
    if (daysLeft <= 0) {
      return (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-red-700 flex-shrink-0" />
              <p className="text-sm text-red-900 truncate">
                <strong>Din provperiod har gått ut.</strong> Aktivera Handymate för att fortsätta.
              </p>
            </div>
            <Link
              href="/dashboard/settings/billing"
              className="flex-shrink-0 px-3 py-1 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700"
            >
              Aktivera nu
            </Link>
          </div>
        </div>
      )
    }

    // Första bevisade resultatet utan betalning — den förtjänta betalfrågan
    if (!status.stripe_subscription_id && status.first_receipt) {
      return (
        <div className="bg-teal-50 border-b border-teal-200 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="w-4 h-4 text-teal-700 flex-shrink-0" />
              <p className="text-sm text-teal-900 truncate">
                <strong>Teamet har levererat sitt första resultat:</strong> {status.first_receipt.text}.{' '}
                Aktivera Handymate så fortsätter det efter provperioden ({daysLeft} dag{daysLeft === 1 ? '' : 'ar'} kvar).
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href="/dashboard/settings/billing"
                className="px-3 py-1 bg-teal-700 text-white text-xs font-medium rounded-lg hover:bg-teal-800"
              >
                Aktivera Handymate
              </Link>
              <button
                onClick={() => setDismissed(true)}
                className="text-teal-700 hover:text-teal-900 text-xs font-medium"
                title="Dölj"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )
    }

    // Mindre än 7 dagar kvar på trial
    if (daysLeft <= 7) {
      return (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-4 h-4 text-amber-700 flex-shrink-0" />
              <p className="text-sm text-amber-900 truncate">
                <strong>{daysLeft} dag{daysLeft === 1 ? '' : 'ar'} kvar på provperioden.</strong>{' '}
                Aktivera Handymate för att fortsätta utan avbrott.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href="/dashboard/settings/billing"
                className="px-3 py-1 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700"
              >
                Välj plan
              </Link>
              <button
                onClick={() => setDismissed(true)}
                className="text-amber-700 hover:text-amber-900 text-xs font-medium"
                title="Dölj"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )
    }
  }

  return null
}
