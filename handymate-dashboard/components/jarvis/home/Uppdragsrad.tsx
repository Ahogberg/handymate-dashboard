'use client'

import { useMission } from '@/lib/mission/MissionProvider'
import { useJobbuddy } from '@/lib/JobbuddyContext'
import type { MissionSuggestion } from '@/lib/mission/suggestions'

/**
 * Uppdragsrad — MatteHero:s uppdragsband (Goal-to-Plan V1, Etapp C; flyttad
 * in i heron som ett band i Etapp E: Hero-integrationen, 2026-08-17,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * Fram till Etapp E var det här en egen rad, syskon UNDER MatteHero. Etapp E
 * flyttade den in som ett band i herons nederkant ("heron frågar, bandet
 * svarar") och lät heron SJÄLV ta över det aktiva uppdragets huvudbudskap
 * (rubrik + statistik + progressdelar — se MatteHero.tsx, som läser
 * lib/mission/progress-parts.ts). Den här filen äger bara bandets fyra
 * lägen, restylade för den mörka bandkontexten (en ljus yta INUTI heron,
 * inte längre en egen vit kortsyta på sidbakgrunden):
 *
 *  1. Uppdraget laddar ELLER förslagen laddar (suggestions === null) →
 *     skelettrad.
 *  2. Aktivt uppdrag → EN kompakt "Öppna →"-yta. Heron visar redan
 *     rubrik+progress ovanför — bandet ska inte upprepa dem. Öppnar
 *     expansionspanelen (Etapp G, components/mission/MissionPanel.tsx),
 *     INTE chatten — panelen ÄR den större arbetsytan för uppdraget.
 *  3. Inget uppdrag, minst ett förslag → chip-rad, klick förifyller chatten.
 *  4. Inget uppdrag, inga förslag → en smal pill som öppnar chatten tom.
 *
 * SkrivRad längst ner i JarvisHome rörs inte (en merge är V2).
 */
export function Uppdragsrad({ suggestions }: { suggestions: MissionSuggestion[] | null }) {
  const { mission, loading: missionLoading, setPanelOpen } = useMission()
  const { setPendingPrompt, setActiveTab, setIsOpen } = useJobbuddy()

  const oppnaMatte = (prefill?: string) => {
    if (prefill) setPendingPrompt(prefill)
    setActiveTab('chat')
    setIsOpen(true)
  }

  // Stabil ankarpunkt för framtida DOM-baserade turer (t.ex. HemTur,
  // components/tour/HemTur.tsx, som spotlightar via data-tour-target) —
  // bandet hade ingen förut. Onboardingens Step6LiveTour speglar däremot
  // Uppdragsrad i en helt egen mockad förhandsvisning (ingen DOM-koppling
  // hit), se app/onboarding/components/Step6LiveTour.tsx. Satt på alla fyra
  // lägens rotelement så attributet alltid finns oavsett tillstånd.
  const TOUR_ANCHOR = 'uppdragsband'

  // ── Läge 1: laddar ──────────────────────────────────────────────────────
  if (missionLoading || suggestions === null) {
    return <div data-tour={TOUR_ANCHOR} className="h-10 rounded-xl bg-white/10 animate-pulse" aria-hidden />
  }

  // ── Läge 2: aktivt uppdrag — heron visar redan rubrik+progress ovanför ──
  // Öppnar expansionspanelen (Etapp G), inte chatten — "Fråga Matte" i
  // panelens footer är vägen dit om hantverkaren ändå vill prata.
  if (mission && mission.status === 'active') {
    return (
      <button
        type="button"
        data-tour={TOUR_ANCHOR}
        onClick={() => setPanelOpen(true)}
        className="min-h-[40px] w-full flex items-center justify-between px-3.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sm text-white/70"
      >
        <span>Uppdraget pågår</span>
        <span className="text-primary-300 font-medium">Öppna →</span>
      </button>
    )
  }

  // ── Läge 3: förslagschips ────────────────────────────────────────────────
  if (suggestions.length > 0) {
    return (
      <div data-tour={TOUR_ANCHOR}>
        <h2 className="m-0 mb-2 font-heading text-[13px] font-semibold text-white/80">
          Vad vill du att vi får gjort?
        </h2>
        <div className="flex flex-wrap gap-2">
          {suggestions.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => oppnaMatte(s.prefillText)}
              className="min-h-[40px] px-4 rounded-xl border border-white/15 bg-white/10 text-sm font-medium text-white active:bg-white/20"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Läge 4: inga signaler — öppen inbjudan, ingen förifylld text ────────
  return (
    <div data-tour={TOUR_ANCHOR}>
      <h2 className="m-0 mb-2 font-heading text-[13px] font-semibold text-white/80">
        Vad vill du att vi får gjort?
      </h2>
      <button
        type="button"
        onClick={() => oppnaMatte()}
        className="min-h-[40px] px-4 rounded-xl border border-dashed border-white/25 text-sm text-white/60"
      >
        Skriv vad du vill uppnå …
      </button>
    </div>
  )
}
