'use client'

import { AgentAvatar } from '@/components/agents/AgentAvatar'
import type { NextBestActionRecommendation } from '@/components/jarvis/GorDettaForst'

/**
 * MatteHero — Command Centers mörka dagsbesked (Etapp C1, 2026-08-17).
 *
 * Ersätter hälsningsradens visuella roll överst i JarvisHome: mockupens
 * grad-dark-hero-mönster (docs/HANDYMATE_DESIGN_SYSTEM.md §4.0 — max EN
 * mörk hero per sida; det här är sidans enda). Hälsningen bor kvar HÄR,
 * som en varm rad ovanför rubriken — det är en hantverkares morgonskärm,
 * inte en KPI-vägg.
 *
 * ═══ ÄRLIGHETSREGLERNA ═══
 *
 * - N = samma `beslut`-räknare som sektionsbadgen ("N saker behöver ditt
 *   beslut") — EN sanning om hur mycket som väntar, aldrig två räknare
 *   som glider isär.
 * - Underraden summerar NBA-kandidaternas belopp BARA när minst ett
 *   verkligt belopp finns, och märks med ~ så fort någon del är
 *   UPPSKATTAT (samma KÄNT/UPPSKATTAT-konvention som GorDettaForst).
 *   Utan NBA-rad faller den tillbaka på dygnsdigestens bevisrad
 *   (halsningsBevis) — ärlig degradering, aldrig en påhittad summa.
 * - "skötta sedan i går" (inte mockupens "i natt"): digestens fönster är
 *   ett RULLANDE dygn (lib/jarvis/dygnsdigest.ts) och rubriken ska heta
 *   vad den mäter — samma regel som fällde "Klart idag".
 * - Innan kön laddats påstår rubriken ingenting — en skelettrad, aldrig
 *   ett "Inget behöver dig" som sekunden senare blir "3 saker".
 */
export function MatteHero({
  greetingName,
  queueLoaded,
  beslut,
  nbaKandidater,
  bevis,
  autoCount,
}: {
  greetingName: string
  queueLoaded: boolean
  /** Antal beslut som väntar — samma räknare som sektionsbadgen. */
  beslut: number
  /** De SYNLIGA rankade kandidaterna (samma lista som GorDettaForst får). */
  nbaKandidater: NextBestActionRecommendation[]
  /** halsningsBevis-raden — fallback när ingen NBA-rad finns. */
  bevis: string | null
  /** Dygnsdigestens automatiska rader (auto-flaggan). */
  autoCount: number
}) {
  const datum = new Date()
    .toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase()

  const headline = beslut === 0
    ? 'Inget behöver dig just nu. Allt är hanterat.'
    : `${beslut} ${beslut === 1 ? 'sak' : 'saker'} behöver dig i dag. Resten är hanterat.`

  // Beloppssumman: bara verkliga belopp räknas, och en enda UPPSKATTAT-del
  // gör hela summan ungefärlig (~) — en blandad summa som ser exakt ut
  // vore en lögn med decimaler.
  const medBelopp = nbaKandidater.filter(r => r.financialImpactKr != null)
  const summaKr = medBelopp.reduce((s, r) => s + (r.financialImpactKr as number), 0)
  const summaOsaker = medBelopp.some(r => r.financialImpactKind === 'UPPSKATTAT')
  const visaSumma = queueLoaded && medBelopp.length > 0 && summaKr > 0

  return (
    <section className="bg-grad-dark-hero rounded-hero px-5 py-5 sm:px-7 sm:py-6 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-7">
      <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 flex-1 min-w-0">
        <AgentAvatar agentKey="matte" size="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] tracking-[0.14em] uppercase text-primary-300 font-semibold">
            Matte · {datum}
          </div>
          <p className="m-0 mt-1 text-sm text-white/70">
            {greetingName ? `God morgon, ${greetingName}.` : 'God morgon.'}
          </p>
          {queueLoaded ? (
            <h1 className="m-0 mt-0.5 font-heading text-[20px] sm:text-[24px] font-bold tracking-[-0.02em] leading-tight text-white">
              {headline}
            </h1>
          ) : (
            <div className="mt-1.5 h-6 sm:h-7 w-56 sm:w-80 max-w-full bg-white/10 rounded animate-pulse" aria-hidden />
          )}
          {visaSumma ? (
            <p className="m-0 mt-1.5 text-sm text-white/60">
              Tillsammans avgör de{' '}
              <b className="font-semibold text-white tabular-nums">
                {summaOsaker ? '~' : ''}
                {summaKr.toLocaleString('sv-SE')} kr
              </b>
              .
            </p>
          ) : bevis ? (
            <p className="m-0 mt-1.5 text-sm text-white/60">{bevis}</p>
          ) : null}
        </div>
      </div>

      {queueLoaded && (autoCount > 0 || beslut > 0) && (
        <div className="flex gap-7 shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 pt-3.5 lg:pt-0 lg:pl-7">
          {autoCount > 0 && (
            <div>
              <div className="font-heading tabular-nums text-[26px] sm:text-3xl font-bold leading-none text-white">
                {autoCount}
              </div>
              <div className="text-xs text-white/55 mt-1">skötta sedan i går</div>
            </div>
          )}
          <div>
            <div className="font-heading tabular-nums text-[26px] sm:text-3xl font-bold leading-none text-primary-300">
              {beslut}
            </div>
            <div className="text-xs text-white/55 mt-1">kräver dig</div>
          </div>
        </div>
      )}
    </section>
  )
}
