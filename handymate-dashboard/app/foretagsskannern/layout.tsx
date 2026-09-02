import type { Metadata } from 'next'
import '../onboarding/onboarding.css'

// Publik sida (ingen inloggning) — återanvänder onboardingens ob-* visuella
// grund (ljust tema, teal #0F766E, mobilanpassad) utan att dra in
// dashboard-layouten. Se tasks/plan-foretagsskannern.md, Del 2.
export const metadata: Metadata = {
  title: 'Företagsskannern — se vad Handymate hittar i din firma',
  description: 'Ladda upp din kundlista så visar vi på tio sekunder vad Handymate hittar i din firma. Filen läses i din webbläsare och skickas ingenstans.',
}

export default function ForetagsskannernLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
