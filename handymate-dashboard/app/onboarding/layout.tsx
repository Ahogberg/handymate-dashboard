'use client'

import './onboarding.css'

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // No auth check here — onboarding page handles both
  // new users (unauthenticated) and existing users (authenticated)
  return (
    <div className="ob-layout">
      <nav className="ob-exit-nav" aria-label="Lämna onboarding">
        <a href="/" className="ob-exit-link">← Lämna guiden</a>
      </nav>
      {children}
    </div>
  )
}
