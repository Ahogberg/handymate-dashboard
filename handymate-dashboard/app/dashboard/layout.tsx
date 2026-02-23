'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import AICopilot from '@/components/AICopilot'
import WelcomeModal from '@/components/WelcomeModal'
import FeedbackWidget from '@/components/FeedbackWidget'
import ErrorBoundary from '@/components/ErrorBoundary'
import { ToastProvider } from '@/components/Toast'
import { useAuth } from '@/lib/useAuth'
import { BusinessContext } from '@/lib/BusinessContext'
import { CurrentUserProvider } from '@/lib/CurrentUserContext'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { business, loading, logout } = useAuth(true)
  const router = useRouter()

  // Redirect to onboarding if not completed
  useEffect(() => {
    if (!loading && business && business.onboarding_step < 7) {
      router.push('/onboarding')
    }
  }, [loading, business, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  if (!business) {
    return null
  }

  // Don't render dashboard while redirecting to onboarding
  if (business.onboarding_step < 7) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  return (
    <BusinessContext.Provider value={business}>
      <CurrentUserProvider>
        <ErrorBoundary>
          <ToastProvider>
            <div className="flex min-h-screen bg-slate-50">
              <Sidebar businessName={business.business_name} businessId={business.business_id} onLogout={logout} />
              <main className="flex-1 md:ml-64">
                {children}
              </main>
              <AICopilot />
              <WelcomeModal businessName={business.business_name} />
              <FeedbackWidget />
            </div>
          </ToastProvider>
        </ErrorBoundary>
      </CurrentUserProvider>
    </BusinessContext.Provider>
  )
}
