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
import BillingStatusBanner from '@/components/BillingStatusBanner'
import ErrorBoundary from '@/components/ErrorBoundary'
import { ToastProvider } from '@/components/Toast'
import { MomentsProvider } from '@/components/moments/MomentsProvider'
import { FuelProvider } from '@/components/fuel/FuelProvider'
import { MissionProvider } from '@/lib/mission/MissionProvider'
import { MissionPanel } from '@/components/mission/MissionPanel'
import { useAuth } from '@/lib/useAuth'
import { checkSubscriptionStatus } from '@/lib/auth'
import { useSessionKeepalive } from '@/lib/hooks/useSessionKeepalive'
import { BusinessContext } from '@/lib/BusinessContext'
import { CurrentUserProvider } from '@/lib/CurrentUserContext'
import { JobbuddyProvider } from '@/lib/JobbuddyContext'
import PresenterBar from '@/components/demo/PresenterBar'
import FirstMissionHandoff from '@/components/jarvis/FirstMissionHandoff'
import { FilePreviewProvider } from '@/components/documents/FilePreviewProvider'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { business, loading, logout } = useAuth(true)
  // Refresha JWT i bakgrunden var 45 min så save-actions inte failar pga
  // expirad session efter idle. Se lib/hooks/useSessionKeepalive.ts.
  useSessionKeepalive()
  const router = useRouter()
  const pathname = usePathname()

  // Redirect to onboarding if not completed.
  // Finalize (POST /api/onboarding) skriver onboarding_step 10 + completed_at.
  // Grinden var `>= 7` från 6-stegsflödet; sedan TOTAL_STEPS blev 8
  // (produktregistret, 2026-08-16) skriver steg 6 → 7 vid "Fortsätt", så
  // `>= 7` släppte in konton mitt i LiveTouren utan seedade defaults och
  // utan startkort (hittat 2026-08-27). 8 nås aldrig av saveProgress —
  // bara finalize passerar.
  const onboardingDone = !!(business?.onboarding_completed_at || (business && business.onboarding_step >= 8))

  // Trial-spärr: utgången trial eller past_due skickas till billing-sidan.
  // Pilots och aktiva prenumerationer släpps förbi. Billing-sidan själv är alltid öppen.
  const billingAllowlist = ['/dashboard/settings/billing', '/dashboard/billing']
  const isOnBillingPage = billingAllowlist.some(p => pathname?.startsWith(p))
  // EN sanningskälla: checkSubscriptionStatus (samma som API-feature-gaten
  // använder). Hanterar 'trial' OCH 'trialing' vs trial_ends_at, samt
  // 'comp'/'active' (släpps förbi). Pilot-flaggan exemperar fortfarande.
  const subscriptionLocked = (() => {
    if (!business || business.is_pilot) return false
    return !checkSubscriptionStatus(business).active
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
              <FilePreviewProvider>
              {/* MomentsProvider ovanför Jobbkompisen: bubblan konsumerar
                  useMoments() för badge och beloppsläge. Providern renderar
                  själv det enda globala fynd-kortet (z-100, under Toast). */}
              <MomentsProvider>
                <FuelProvider>
                  {/* MissionProvider bredvid FuelProvider: samma delad-hämtning-
                      mönster, både Jobbkompisens bubbelpillar och sidinnehållet
                      (Uppdragsrad i JarvisHome) konsumerar useMission(). */}
                  <MissionProvider>
                    <div className="flex min-h-screen bg-[#F8FAFC]">
                      <Sidebar businessName={business.business_name} businessId={business.business_id} onLogout={logout} />
                      <main className="flex-1 md:ml-64">
                        <ImpersonationBanner />
                        <PresenterBar />
                        <BillingStatusBanner />
                        {children}
                      </main>
                      <Jobbkompisen />
                      {/* Onboardingens Första-uppdraget-beat (Etapp R) — konsumerar
                          en väntande handoff från Step6LiveTour, se
                          components/jarvis/FirstMissionHandoff.tsx. Renderar inget. */}
                      <FirstMissionHandoff />
                      {/* Expansionspanelen (Etapp G, Goal-to-Plan V2): mission-
                          bandets "Öppna →" och bubblans "Uppdrag pågår"-pill
                          öppnar den här i stället för chatten. Läser
                          panelOpen ur useMission() själv — renderar inget
                          när panelen är stängd eller inget uppdrag är aktivt. */}
                      <MissionPanel />
                      <WelcomeModal />
                      <FeedbackWidget />
                      <PWAInstallBanner />
                    </div>
                  </MissionProvider>
                </FuelProvider>
              </MomentsProvider>
              </FilePreviewProvider>
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
      <span>
        👁️ READ-only — du visar <strong>{businessName}</strong>s dashboard
      </span>
      <button onClick={endImpersonation} className="px-3 py-1 bg-white text-red-600 rounded-lg font-medium text-xs hover:bg-red-50">
        Avsluta
      </button>
    </div>
  )
}
