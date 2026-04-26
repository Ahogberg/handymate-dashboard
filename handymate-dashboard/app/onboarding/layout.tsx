'use client'

import './onboarding.css'

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // No auth check here — onboarding page handles both
  // new users (unauthenticated) and existing users (authenticated)
  return <>{children}</>
}
