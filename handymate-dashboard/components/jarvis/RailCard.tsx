'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

/**
 * Gräv-ingången i högerspalten.
 *
 * Låg oexporterad i JarvisHome och kopierades av KarinCalendarWidget, som
 * byggde samma kort en gång till med egen styling. Två kopior av samma kort
 * glider isär — det var precis så agentfärgerna en gång hann bli olika i
 * fyra filer (se agentPersonas.ts).
 *
 * Rubriken ÄR ingången till sidan; hela raden är träffyta. `leading` tar en
 * avatar för de kort som hör till en namngiven agent, så widgeten känns som
 * hennes och inte som en anonym ruta.
 */
export function RailCard({
  title,
  href,
  leading,
  children,
}: {
  title: string
  href: string
  leading?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      {/* 44px träffyta, uttagen med negativ marginal så kortet inte växer. */}
      <Link
        href={href}
        className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-2 min-h-[44px] -mt-2 -mx-1 px-1"
      >
        {leading}
        <span className="flex-1 min-w-0 truncate">{title}</span>
        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
      </Link>
      {children}
    </div>
  )
}

export default RailCard
