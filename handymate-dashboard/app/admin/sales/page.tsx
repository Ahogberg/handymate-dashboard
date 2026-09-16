'use client'
import dynamic from 'next/dynamic'

/**
 * Handymate Sales Experience — vår egen säljyta.
 *
 * Genomgången vi gör TILLSAMMANS med kunden i mötet: org.nr-uppslag,
 * deras siffror, deras smärtpunkt, business caset och rekommendationen.
 * "Skicka mitt case" sparar den som en rad i `sales_case` och ger den
 * personliga länken kunden får (POST /api/sales-case).
 *
 * VARFÖR DEN MÅSTE BO HÄR OCH INTE I DESIGNKANVASEN: kanvasens iframe har
 * ingen nätutgång bortom sin egen origin, så CTA:n kunde aldrig nå vårt
 * API därifrån — den föll tillbaka på localStorage, som inte följer med
 * till kundens webbläsare. Porteringen ÄR kopplingen.
 *
 * Designen ägs fortfarande av .dc.html-källan; den här filen monterar
 * bara det skriptet genererar (design-sales-experience/, scripts/
 * dc_till_react.py).
 *
 * ssr: false — logikklassen läser window/location/localStorage i
 * componentDidMount och sidan har ingen serverrenderad nytta.
 */
const SalesExperience = dynamic(
  () => import('@/components/sales/sales-experience.generated'),
  { ssr: false, loading: () => <p className="p-6 text-slate-500">Öppnar genomgången…</p> },
)

export default function AdminSalesPage() {
  // showSalesSession: säljarvyn — fälten där vi fyller i kundens uppgifter
  // under mötet. På kundens egen sida (app/case/[token]) är den av.
  return <SalesExperience showSalesSession={true} />
}
