'use client'

import { useMission } from '@/lib/mission/MissionProvider'
import { useJobbuddy } from '@/lib/JobbuddyContext'
import { buildMissionHeadline } from '@/lib/mission/mission-summary'
import type { MissionSuggestion } from '@/lib/mission/suggestions'
import type { TruthClass } from '@/lib/mission/opportunity-portfolio'
import type { MissionProgress } from '@/lib/mission/mission-progress'

/**
 * Uppdragsrad — startsidans andra fråga (Goal-to-Plan V1, Etapp C,
 * tasks/jaunty-pondering-hummingbird.md). Syskon DIREKT UNDER MatteHero i
 * JarvisHome.tsx — heron sammanfattar dagen, den här raden frågar "vad vill
 * du att vi får gjort?" eller redovisar det aktiva uppdraget. SkrivRad
 * längst ner rörs inte (en merge är V2).
 *
 * ═══ FYRA LÄGEN, ALDRIG ETT BLINK TOM→INNEHÅLL ═══
 *
 *  1. Uppdraget laddar ELLER förslagen laddar (suggestions === null) →
 *     skelettrad.
 *  2. Aktivt uppdrag → rubrik + progress PER KLASS, punktseparerad,
 *     ALDRIG en klassöverskridande figur (se progressParts nedan — ingen
 *     addition över klassernas belopp, bara en lista av delar).
 *  3. Inget uppdrag, minst ett förslag → chip-rad, klick förifyller chatten.
 *  4. Inget uppdrag, inga förslag → en smal pill som öppnar chatten tom.
 */

/** Bara de två kr-klasserna bär "verifierat betalt"/"fakturerat" — pipeline,
 *  återaktivering och marginalskydd mäter rörelse/antal, inte den här
 *  radens penningspråk. */
const KR_CLASS_ORDER: TruthClass[] = ['indrivningsbart', 'faktureringsklart']

/**
 * Progressradens delar — EN sträng per klass-fakta, aldrig en klass-
 * överskridande siffra. Delarna radas sedan upp med ' · ', de läggs
 * aldrig ihop.
 */
function progressParts(progress: MissionProgress): string[] {
  const parts: string[] = []
  for (const cls of KR_CLASS_ORDER) {
    const entry = progress.per_class[cls]
    if (!entry) continue
    if (entry.verified_paid_kr > 0) {
      parts.push(`${entry.verified_paid_kr.toLocaleString('sv-SE')} kr verifierat betalt`)
    }
    if (entry.invoiced_kr > entry.verified_paid_kr) {
      parts.push(`${entry.invoiced_kr.toLocaleString('sv-SE')} kr fakturerat`)
    }
  }
  parts.push(
    progress.decisions_outstanding > 0
      ? `${progress.decisions_outstanding} beslut återstår`
      : 'inget väntar på dig just nu',
  )
  return parts
}

export function Uppdragsrad({ suggestions }: { suggestions: MissionSuggestion[] | null }) {
  const { mission, progress, loading: missionLoading } = useMission()
  const { setPendingPrompt, setActiveTab, setIsOpen } = useJobbuddy()

  const oppnaMatte = (prefill?: string) => {
    if (prefill) setPendingPrompt(prefill)
    setActiveTab('chat')
    setIsOpen(true)
  }

  // ── Läge 1: laddar ──────────────────────────────────────────────────────
  if (missionLoading || suggestions === null) {
    return <div className="mt-2.5 h-14 rounded-2xl bg-white/60 animate-pulse" aria-hidden />
  }

  // ── Läge 2: aktivt uppdrag ───────────────────────────────────────────────
  if (mission && mission.status === 'active') {
    const headline = buildMissionHeadline(mission.goal_kr, mission.deadline.slice(0, 10))
    const parts = progress ? progressParts(progress) : []
    return (
      <button
        type="button"
        onClick={() => oppnaMatte()}
        className="mt-2.5 w-full text-left bg-white rounded-2xl border border-slate-200 px-4 py-3 hover:border-primary-300 transition-colors"
      >
        <p className="m-0 text-sm font-semibold text-slate-900">Uppdrag: {headline}</p>
        <p className="m-0 mt-0.5 text-xs text-slate-600 tabular-nums">
          {parts.join(' · ')}
          <span className="ml-1.5 text-primary-700 font-medium">Öppna →</span>
        </p>
      </button>
    )
  }

  // ── Läge 3: förslagschips ────────────────────────────────────────────────
  if (suggestions.length > 0) {
    return (
      <div className="mt-2.5">
        <h2 className="m-0 mb-2 font-heading text-[15px] font-semibold text-slate-900">
          Vad vill du att vi får gjort?
        </h2>
        <div className="flex flex-wrap gap-2">
          {suggestions.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => oppnaMatte(s.prefillText)}
              className="min-h-[40px] px-4 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 active:bg-primary-50"
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
    <div className="mt-2.5">
      <h2 className="m-0 mb-2 font-heading text-[15px] font-semibold text-slate-900">
        Vad vill du att vi får gjort?
      </h2>
      <button
        type="button"
        onClick={() => oppnaMatte()}
        className="min-h-[40px] px-4 rounded-xl border border-dashed border-slate-300 text-sm text-slate-500"
      >
        Skriv vad du vill uppnå …
      </button>
    </div>
  )
}
