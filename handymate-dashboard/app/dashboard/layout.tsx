'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import Sidebar from '@/components/Sidebar'

const Jobbkompisen = dynamic(() => import('@/components/Jobbkompisen'), {
  ssr: false,
  loading: () => <div className="fixed bottom-6 right-6 w-14 h-14 bg-primary-100 rounded-xl animate-pulse z-40" />,
})
import WelcomeModal from '@/components/WelcomeModal'
import FeedbackWidget from '@/components/FeedbackWidget'
import PWAInstallBanner from '@/components/PWAInstallBanner'
import ErrorBoundary from '@/components/ErrorBoundary'
import { ToastProvider } from '@/components/Toast'
import { useAuth } from '@/lib/useAuth'
import { BusinessContext } from '@/lib/BusinessContext'
import { CurrentUserProvider } from '@/lib/CurrentUserContext'
import { JobbuddyProvider } from '@/lib/JobbuddyContext'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { business, loading, logout } = useAuth(true)
  const router = useRouter()
  const pathname = usePathname()

  // Redirect to onboarding if not completed
  // step >= 7 also counts as done (old 6-step flow finalized at step 7)
  const onboardingDone = !!(business?.onboarding_completed_at || (business && business.onboarding_step >= 7))

  // Trial-spärr: utgången trial eller past_due skickas till billing-sidan.
  // Pilots och aktiva prenumerationer släpps förbi. Billing-sidan själv är alltid öppen.
  const billingAllowlist = ['/dashboard/settings/billing', '/dashboard/billing']
  const isOnBillingPage = billingAllowlist.some(p => pathname?.startsWith(p))
  const subscriptionLocked = (() => {
    if (!business || business.is_pilot) return false
    const status = business.subscription_status
    if (status === 'past_due' || status === 'cancelled' || status === 'unpaid') return true
    if (status === 'trialing' && business.trial_ends_at) {
      return new Date(business.trial_ends_at).getTime() < Date.now()
    }
    return false
  })()

  useEffect(() => {
    if (!loading && business && !onboardingDone) {
      router.push('/onboarding')
    }
  }, [loading, business, onboardingDone, router])

  useEffect(() => {
    if (!loading && subscriptionLocked && !isOnBillingPage) {
      router.push('/dashboard/settings/billing?trial=expired')
    }
  }, [loading, subscriptionLocked, isOnBillingPage, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  if (!business) {
    return null
  }

  // Don't render while redirecting — useEffect hanterar redirect
  // Visa inte onboarding-flash medan data laddas

  return (
    <BusinessContext.Provider value={business}>
      <CurrentUserProvider>
        <JobbuddyProvider>
          <ErrorBoundary>
            <ToastProvider>
              <div className="flex min-h-screen bg-[#F8FAFC]">
                <Sidebar businessName={business.business_name} businessId={business.business_id} onLogout={logout} />
                <main className="flex-1 md:ml-64">
                  <ImpersonationBanner />
                  {children}
                </main>
                <Jobbkompisen />
                <WelcomeModal businessName={business.business_name} />
                <FeedbackWidget />
                <PWAInstallBanner />
              </div>
            </ToastProvider>
          </ErrorBoundary>
        </JobbuddyProvider>
      </CurrentUserProvider>
    </BusinessContext.Provider>
  )
}

function ImpersonationBanner() {
  const [businessName, setBusinessName] = useState<string | null>(null)

  useEffect(() => {
    const name = document.cookie.match(/impersonate_business_name=([^;]+)/)
    if (name) {
      setBusinessName(decodeURIComponent(name[1]))
    }
  }, [])

  if (!businessName) return null

  const endImpersonation = async () => {
    await fetch('/api/admin/impersonate', { method: 'DELETE' })
    window.location.href = '/admin'
  }

  return (
    <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-between text-sm z-50 sticky top-0">
      <span>Du impersonerar <strong>{businessName}</strong></span>
      <button onClick={endImpersonation} className="px-3 py-1 bg-white text-red-600 rounded-lg font-medium text-xs hover:bg-red-50">
        Avsluta impersonering
      </button>
    </div>
  )
}
