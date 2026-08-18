'use client'

import { AgentAvatar } from '@/components/agents/AgentAvatar'
import type { NextBestActionRecommendation } from '@/components/jarvis/GorDettaForst'
import { useMission } from '@/lib/mission/MissionProvider'
import { buildMissionHeadline } from '@/lib/mission/mission-summary'
import { progressParts } from '@/lib/mission/progress-parts'
import { resolveGoalType } from '@/lib/mission/goal-type'

/**
 * MatteHero — Command Centers mörka dagsbesked (Etapp C1, 2026-08-17;
 * Etapp E: Hero-integrationen, 2026-08-17, tasks/jaunty-pondering-
 * hummingbird.md).
 *
 * Ersätter hälsningsradens visuella roll överst i JarvisHome: mockupens
 * grad-dark-hero-mönster (docs/HANDYMATE_DESIGN_SYSTEM.md §4.0 — max EN
 * mörk hero per sida; det här är sidans enda). Hälsningen bor kvar HÄR,
 * som en varm rad ovanför rubriken — det är en hantverkares morgonskärm,
 * inte en KPI-vägg.
 *
 * ═══ ETAPP E: EN YTA, TVÅ LÄGEN ═══
 *
 * Tidigare stod MatteHero och Uppdragsrad som två staplade Matte-röster.
 * Nu är Uppdragsrad ett BAND i herons nederkant (uppdragBand-sloten nedan),
 * och när ett uppdrag är aktivt tar heron över hela sitt eget huvudbudskap:
 * rubriken blir "Uppdrag: {headline}", statistikytan byter från
 * auto/beslut till gap/deadline/beslut, och sub-raden visar
 * progressParts() punktseparerad — ALDRIG en klassöverskridande summa (se
 * lib/mission/progress-parts.ts, samma facit Uppdragsrad byggde lokalt
 * innan flytten).
 *
 * Heron läser useMission() DIREKT i stället för att ta emot mission/
 * progress som props: Uppdragsrad.tsx (nu bandets innehåll) gjorde redan
 * exakt detta, MissionProvider cachar i sin context så två konsumenter
 * inte ger två nätverksanrop, och JarvisHome självt läser aldrig
 * mission-datat — att tråda det som props hade bara varit onödig
 * propagering av tillstånd en mellanhand inte behöver.
 *
 * ═══ ÄRLIGHETSREGLERNA ═══
 *
 * - N = samma `beslut`-räknare som sektionsbadgen ("N saker behöver ditt
 *   beslut") — EN sanning om hur mycket som väntar, aldrig två räknare
 *   som glider isär. (Gäller läget UTAN aktivt uppdrag.)
 * - Underraden summerar NBA-kandidaternas belopp BARA när minst ett
 *   verkligt belopp finns, och märks med ~ så fort någon del är
 *   UPPSKATTAT (samma KÄNT/UPPSKATTAT-konvention som GorDettaForst).
 *   Utan NBA-rad faller den tillbaka på dygnsdigestens bevisrad
 *   (halsningsBevis) — ärlig degradering, aldrig en påhittad summa.
 * - "skötta sedan i går" (inte mockupens "i natt"): digestens fönster är
 *   ett RULLANDE dygn (lib/jarvis/dygnsdigest.ts) och rubriken ska heta
 *   vad den mäter — samma regel som fällde "Klart idag".
 * - Innan kön OCH uppdraget laddats påstår rubriken ingenting — en
 *   skelettrad, aldrig ett "Inget behöver dig" som sekunden senare byts ut
 *   mot "Uppdrag: …" (samma blink-regel som fällde "Klart idag", nu
 *   utvidgad till mission-laddningen).
 * - Etapp F (kapacitetsmål): statistikytans FÖRSTA ruta grenar på
 *   uppdragets goal_type — gap_hours/"timmar kvar att boka" för
 *   kapacitetsmål, gap_kr/"kr kvar till målet" för pengamål, ALDRIG båda.
 *   capacity_unconfigured (kapaciteten saknar en verklig inställning) visar
 *   "—", aldrig ett gissat gap.
 */
export function MatteHero({
  greetingName,
  queueLoaded,
  beslut,
  nbaKandidater,
  bevis,
  autoCount,
  uppdragBand,
  absenceBand,
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
  /**
   * Uppdragsradens band (Etapp E) — förslagschipsen/fritextpillen när inget
   * uppdrag är aktivt, eller en kompakt "Öppna →"-yta när ett är det.
   * `null`/`undefined` döljer bandet helt (t.ex. missionSurfaceAllowed===
   * false i JarvisHome för anställda utan ägare/admin-behörighet).
   */
  uppdragBand?: React.ReactNode
  /**
   * Owner Absence V1 (Etapp Å) — samma slot-mönster som uppdragBand: en
   * snabbknapp/statusrad för frånvaroläget. Komponenten (AbsenceBand) sköter
   * sin egen hämtning/behörighetsdegradering, heron vet bara att rendera
   * det den får. `null`/`undefined` döljer bandet helt.
   */
  absenceBand?: React.ReactNode
}) {
  const { mission, progress, loading: missionLoading } = useMission()
  const missionActive = mission != null && mission.status === 'active'
  // Väntar in BÅDA källorna innan rubriken påstår något — se
  // ärlighetsreglerna ovan.
  const heroLoaded = queueLoaded && !missionLoading

  const datum = new Date()
    .toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase()

  // Etapp F (kapacitetsmål), Etapp I (kontaktmål): rubriken och stat-ytan
  // grenar på uppdragets goal_type. resolveGoalType defaultar fail-soft
  // till 'money' — se lib/mission/goal-type.ts.
  const missionGoalType = missionActive ? resolveGoalType(mission!.goal_type) : 'money'

  const headline = missionActive
    ? `Uppdrag: ${buildMissionHeadline(
        mission!.goal_kr ?? 0,
        mission!.deadline.slice(0, 10),
        missionGoalType === 'capacity'
          ? { goalType: missionGoalType, goalHours: mission!.goal_hours ?? undefined }
          : missionGoalType === 'contact'
            ? { goalType: missionGoalType, goalCount: mission!.goal_count ?? undefined }
            : undefined,
      )}`
    : beslut === 0
      ? 'Inget behöver dig just nu. Allt är hanterat.'
      : `${beslut} ${beslut === 1 ? 'sak' : 'saker'} behöver dig i dag. Resten är hanterat.`

  // Beloppssumman: bara verkliga belopp räknas, och en enda UPPSKATTAT-del
  // gör hela summan ungefärlig (~) — en blandad summa som ser exakt ut
  // vore en lögn med decimaler. (Bara relevant utan aktivt uppdrag.)
  const medBelopp = nbaKandidater.filter(r => r.financialImpactKr != null)
  const summaKr = medBelopp.reduce((s, r) => s + (r.financialImpactKr as number), 0)
  const summaOsaker = medBelopp.some(r => r.financialImpactKind === 'UPPSKATTAT')
  const visaSumma = !missionActive && queueLoaded && medBelopp.length > 0 && summaKr > 0

  // Sub-raden i mission-läget: progressParts() bygger en LISTA av delar per
  // sanningsklass (aldrig en klassöverskridande siffra) — anropet joinar
  // dem punktseparerat, exakt som Uppdragsrad gjorde innan flytten.
  const missionParts = missionActive && progress ? progressParts(progress) : []

  const deadlineLabel = missionActive
    ? new Date(mission!.deadline).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
    : ''

  return (
    <section className="bg-grad-dark-hero rounded-hero px-5 py-5 sm:px-7 sm:py-6 flex flex-col gap-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-7">
        <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 flex-1 min-w-0">
          <AgentAvatar agentKey="matte" size="lg" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] tracking-[0.14em] uppercase text-primary-300 font-semibold">
              Matte · {datum}
            </div>
            <p className="m-0 mt-1 text-sm text-white/70">
              {greetingName ? `God morgon, ${greetingName}.` : 'God morgon.'}
            </p>
            {heroLoaded ? (
              <h1 className="m-0 mt-0.5 font-heading text-[20px] sm:text-[24px] font-bold tracking-[-0.02em] leading-tight text-white">
                {headline}
              </h1>
            ) : (
              <div className="mt-1.5 h-6 sm:h-7 w-56 sm:w-80 max-w-full bg-white/10 rounded animate-pulse" aria-hidden />
            )}
            {heroLoaded && missionActive ? (
              <p className="m-0 mt-1.5 text-sm text-white/60 tabular-nums">
                {missionParts.join(' · ')}
              </p>
            ) : visaSumma ? (
              <p className="m-0 mt-1.5 text-sm text-white/60">
                Tillsammans avgör de{' '}
                <b className="font-semibold text-white tabular-nums">
                  {summaOsaker ? '~' : ''}
                  {summaKr.toLocaleString('sv-SE')} kr
                </b>
                .
              </p>
            ) : bevis && !missionActive ? (
              <p className="m-0 mt-1.5 text-sm text-white/60">{bevis}</p>
            ) : null}
          </div>
        </div>

        {heroLoaded && missionActive && progress ? (
          <div className="flex gap-5 sm:gap-7 shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 pt-3.5 lg:pt-0 lg:pl-7">
            <div>
              <div className="font-heading tabular-nums text-[26px] sm:text-3xl font-bold leading-none text-primary-300">
                {missionGoalType === 'capacity'
                  ? progress.capacity_unconfigured
                    ? '—'
                    : progress.gap_hours != null && progress.gap_hours > 0
                      ? progress.gap_hours.toLocaleString('sv-SE')
                      : '✓'
                  : missionGoalType === 'contact'
                    ? progress.gap_count != null && progress.gap_count > 0
                      ? progress.gap_count.toLocaleString('sv-SE')
                      : '✓'
                    : progress.gap_kr != null && progress.gap_kr > 0
                      ? progress.gap_kr.toLocaleString('sv-SE')
                      : '✓'}
              </div>
              <div className="text-xs text-white/55 mt-1">
                {missionGoalType === 'capacity'
                  ? progress.capacity_unconfigured
                    ? 'kapacitet ej konfigurerad'
                    : progress.gap_hours != null && progress.gap_hours > 0
                      ? 'timmar kvar att boka'
                      : 'veckan fylld'
                  : missionGoalType === 'contact'
                    ? progress.gap_count != null && progress.gap_count > 0
                      ? 'kunder kvar till målet'
                      : 'målet nått'
                    : progress.gap_kr != null && progress.gap_kr > 0
                      ? 'kr kvar till målet'
                      : 'målet nått'}
              </div>
            </div>
            <div>
              <div className="font-heading tabular-nums text-[26px] sm:text-3xl font-bold leading-none text-white">
                {deadlineLabel}
              </div>
              <div className="text-xs text-white/55 mt-1">deadline</div>
            </div>
            <div>
              <div className="font-heading tabular-nums text-[26px] sm:text-3xl font-bold leading-none text-white">
                {progress.decisions_outstanding}
              </div>
              <div className="text-xs text-white/55 mt-1">beslut väntar</div>
            </div>
          </div>
        ) : (
          heroLoaded && !missionActive && (autoCount > 0 || beslut > 0) && (
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
          )
        )}
      </div>

      {uppdragBand && (
        <div className="border-t border-white/10 pt-4">
          {uppdragBand}
        </div>
      )}

      {absenceBand && (
        <div className="border-t border-white/10 pt-4">
          {absenceBand}
        </div>
      )}
    </section>
  )
}
