'use client'

import { RailCard } from '@/components/jarvis/RailCard'
import type { AttHamtaVy } from '@/lib/jarvis/att-hamta'

/**
 * "Att hämta" — ersätter Fakturor-kortet och Pengar på bordet i högerspalten
 * (Tur 4 etapp 5). Vyn kommer färdig ur lib/jarvis/att-hamta.ts; komponenten
 * ritar bara. Ingen vy (anställd/fel) → anroparen renderar ingenting.
 *
 * "väntar ovan" är en KNAPP, inte en länk: beslutet ligger redan på skärmen,
 * så raden scrollar upp till kortet i stället för att öppna en sida till.
 */
export function AttHamtaRailCard({ vy, onVantarOvan }: { vy: AttHamtaVy; onVantarOvan?: () => void }) {
  return (
    <RailCard title="Att hämta" href="/dashboard/pengar">
      {vy.lugn ? (
        <>
          <span className="block text-sm font-medium text-slate-900">Inget att hämta</span>
          <span className="block text-xs text-slate-500 mt-0.5">Karin bevakar fakturor och offerter</span>
        </>
      ) : (
        <>
          <span className="block font-heading text-2xl font-bold text-slate-900">
            {new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(vy.totalKr)} kr
          </span>
          <div className="mt-1.5 flex flex-col gap-1">
            {vy.rader.map(r => (
              <span key={r.key} className="text-xs text-slate-500">
                {r.text}
                {r.vantarOvan && (
                  <button
                    type="button"
                    onClick={onVantarOvan}
                    className="ml-1 text-primary-700 font-semibold hover:underline"
                  >
                    — väntar ovan
                  </button>
                )}
              </span>
            ))}
          </div>
        </>
      )}
    </RailCard>
  )
}

export default AttHamtaRailCard
