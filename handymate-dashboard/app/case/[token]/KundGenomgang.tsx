'use client'
import dynamic from 'next/dynamic'

/**
 * Vyn för kundens genomgång, skild från sidan för att sidan ska kunna vara
 * en serverkomponent med grind och metadata (se page.tsx).
 *
 * ssr: false — logiken läser `location` i componentDidMount och hämtar sitt
 * eget case ur sökvägen /case/<token>.
 *
 * showSalesSession={false}: säljarens egna ytor (spara case, skicka länk,
 * interna noteringar) ska inte finnas hos kunden.
 *
 * CTA:n "Kom igång" använder serverns `onboardingUrl`, aldrig en egen
 * hopbyggd länk — den bär partnerns ?ref= och därmed provisionen.
 */
const SalesExperience = dynamic(
  () => import('@/components/sales/sales-experience.generated'),
  { ssr: false, loading: () => <p className="p-6 text-slate-500">Öppnar din genomgång…</p> },
)

export default function KundGenomgang() {
  return <SalesExperience showSalesSession={false} />
}
