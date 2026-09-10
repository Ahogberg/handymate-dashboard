'use client'

import './onboarding.css'
import { DemoTillbakaKnapp } from '@/components/demo/DemoTillbakaKnapp'

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // No auth check here — onboarding page handles both
  // new users (unauthenticated) and existing users (authenticated)
  return (
    <div className="ob-layout">
      {/*
        Två utgångar, med olika betydelse:

        "Lämna guiden" (#25) tar en riktig kund till den publika startsidan.
        Den finalize:ar ingenting, så dashboardgrinden skickar tillbaka hit
        nästa gång — det är avsiktligt, guiden är inte klar.

        "Tillbaka till demon" (2026-09-10) finns BARA på demokontot och bara
        för ägare/admin — servern avgör, se
        app/api/admin/demo-onboarding-exit/route.ts. Den behövs eftersom
        "Visa onboardingen" i PresenterBar nollställer onboardingen, och
        PresenterBar bara renderas i dashboardens layout: när replayen landat
        här var knappen som tog dig hit borta, och enda vägen tillbaka var att
        klicka igenom hela guiden.
      */}
      <nav className="ob-exit-nav" aria-label="Lämna onboarding">
        <DemoTillbakaKnapp />
        <a href="/" className="ob-exit-link">← Lämna guiden</a>
      </nav>
      {children}
    </div>
  )
}
