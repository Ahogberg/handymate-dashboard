'use client'

import { useAuth } from '@/lib/useAuth'

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { business, loading } = useAuth(true)

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

  // Already completed onboarding? Let dashboard handle it
  return <>{children}</>
}
