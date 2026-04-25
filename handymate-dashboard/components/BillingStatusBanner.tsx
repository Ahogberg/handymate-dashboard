'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CreditCard, Clock } from 'lucide-react'

interface BillingStatus {
  subscription_status: string | null
  trial_ends_at: string | null
}

/**
 * Visar en varningsbanner högst upp på dashboarden om:
 * - Trial går ut snart (≤ 7 dagar kvar)
 * - Trial har gått ut
 * - Betalning misslyckades (past_due)
 *
 * Tyst och osynlig för aktiva prenumerationer.
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
            subscription_status: data.subscription_status || null,
            trial_ends_at: data.trial_ends_at || null,
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

  // Trial-status
  if (sub === 'trialing' && status.trial_ends_at) {
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
                <strong>Din provperiod har gått ut.</strong> Uppgradera för att fortsätta använda Handymate.
              </p>
            </div>
            <Link
              href="/dashboard/settings/billing"
              className="flex-shrink-0 px-3 py-1 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700"
            >
              Uppgradera nu
            </Link>
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
                Lägg till betalkort för att fortsätta utan avbrott.
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
