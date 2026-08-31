'use client'

import Link from 'next/link'
import { Check, X } from 'lucide-react'

interface AgentReadinessCardProps {
  /** true om ett timpris finns satt — pricing_settings.hourly_rate ELLER
      default_hourly_rate (samma fallback-kedja som AI:n läser, se
      app/api/quotes/ai-generate/route.ts). */
  hourlyRateSet: boolean
  /**
   * UX2b (Prisslingan V2): antal aktiva PRISSATTA artiklar. Tidigare räknades
   * alla aktiva — sant direkt efter seedningen (95+ rader), så nudgen slocknade
   * innan hantverkaren satt ett enda eget pris.
   */
  pricedCount: number
  /** Antal aktiva prislösa artiklar ("Sätt pris"-långsvansen). Bara text —
      kräv ALDRIG 0 för grönt; långsvansen är designen, inte ett fel. */
  unpricedCount?: number
  /** Antal kunder. null = ännu inte hämtat — raden döljs tills dess. */
  customersCount: number | null
}

interface ReadinessRow {
  id: string
  ok: boolean
  okText: string
  gapText: string
  link: string
}

/**
 * "Teamets beredskap" (P3, UX-revision 2026-08-03). Produktbanken är det
 * som gör AI-agenternas offerter bra, men det är osynligt för hantverkaren
 * tills något går fel i en offert. Det här kortet gör förutsättningarna
 * synliga INNAN dess — en rad per agent-förutsättning, med konkret
 * konsekvens (inte bara "saknas").
 *
 * Minsta möjliga yta: helt osynligt så fort allt är grönt (ingen permanent
 * "allt ser bra ut"-ruta) — bara en tillfällig nudge tills hantverkaren
 * konfigurerat grunderna. Data återanvänds från dashboardens redan gjorda
 * hämtningar (business_config + /api/dashboard/stats) — inga nya anrop.
 */
export function AgentReadinessCard({ hourlyRateSet, pricedCount, unpricedCount = 0, customersCount }: AgentReadinessCardProps) {
  const rows: ReadinessRow[] = [
    {
      id: 'hourly_rate',
      ok: hourlyRateSet,
      okText: 'Daniel räknar arbete med ditt pris',
      gapText: 'Daniel använder 650 kr/h standard tills du sätter ditt eget',
      link: '/dashboard/settings?tab=economics',
    },
    {
      id: 'products',
      ok: pricedCount > 0,
      okText: `Daniel prissätter med dina priser (${pricedCount} prissatta${unpricedCount > 0 ? ` · ${unpricedCount} väntar på pris` : ''})`,
      gapText: 'Materialrader blir "Sätt pris" i offerter tills du prissatt dina vanligaste artiklar',
      link: '/dashboard/settings/products?filter=saknar-pris',
    },
    ...(customersCount === null
      ? []
      : [
          {
            id: 'customers',
            ok: customersCount > 0,
            okText: 'Lisa och Karin känner igen dina kunder',
            gapText: 'Lisa och Karin känner inte igen kunden vid samtal än',
            link: '/dashboard/customers',
          },
        ]),
  ]

  const gaps = rows.filter(r => !r.ok)
  // Försvinner helt när allt är grönt — ingen permanent yta.
  if (gaps.length === 0) return null

  return (
    <div className="mb-6 bg-white border border-[#E2E8F0] rounded-xl p-5">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Teamets beredskap</h2>
      <div className="space-y-2">
        {rows.map(row => (
          <Link
            key={row.id}
            href={row.link}
            className={`flex items-start gap-2.5 p-2.5 rounded-lg transition-colors ${
              row.ok ? '' : 'hover:bg-amber-50'
            }`}
          >
            {row.ok ? (
              <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              </div>
            ) : (
              <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <X className="w-3.5 h-3.5 text-amber-600" />
              </div>
            )}
            <span className={`text-sm ${row.ok ? 'text-gray-500' : 'text-gray-900 font-medium'}`}>
              {row.ok ? row.okText : row.gapText}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
