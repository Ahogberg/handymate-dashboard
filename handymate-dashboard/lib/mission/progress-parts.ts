/**
 * progressParts — EN sträng per klass-fakta, aldrig en klassöverskridande
 * siffra (Goal-to-Plan V1, Etapp C → Etapp E: Hero-integrationen,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * Extraherad ur components/jarvis/home/Uppdragsrad.tsx (Etapp E, 2026-08-17)
 * när MatteHero.tsx tog över det aktiva uppdragets huvudbudskap (rubrik +
 * statistik + sub-rad) — samma rena funktion behövs nu av heron. Anroparen
 * radar upp delarna med ' · ' — den här filen lägger dem ALDRIG ihop till en
 * gemensam siffra (klassbeloppen summeras aldrig till ett tal).
 *
 * Etapp F (kapacitetsmål): gap_kr och gap_hours är ömsesidigt uteslutande
 * (se MissionProgress-kommentaren i mission-progress.ts) — den här filen
 * väljer gap-delen på VILKET av de två fälten som är satt, aldrig på
 * uppdragets goal_type direkt, så en framtida tredje målstyp inte kräver en
 * ny gren här.
 *
 * Facit: tests/progress-parts.spec.ts
 */
import type { MissionProgress } from './mission-progress'
import type { TruthClass } from './opportunity-portfolio'

/** Bara de två kr-klasserna bär "verifierat betalt"/"fakturerat" — pipeline,
 *  återaktivering och marginalskydd mäter rörelse/antal, inte den här
 *  radens penningspråk. */
export const KR_CLASS_ORDER: TruthClass[] = ['indrivningsbart', 'faktureringsklart']

export function progressParts(progress: MissionProgress): string[] {
  const parts: string[] = []
  let verifieratBetaltKr = 0
  for (const cls of KR_CLASS_ORDER) {
    const entry = progress.per_class[cls]
    if (!entry) continue
    if (entry.verified_paid_kr > 0) {
      parts.push(`${entry.verified_paid_kr.toLocaleString('sv-SE')} kr verifierat betalt`)
    }
    if (entry.invoiced_kr > entry.verified_paid_kr) {
      parts.push(`${entry.invoiced_kr.toLocaleString('sv-SE')} kr fakturerat`)
    }
    verifieratBetaltKr += entry.verified_paid_kr
  }
  // Målgapet — ETT av tre ömsesidigt uteslutande utfall (Etapp D för
  // pengamål, Etapp F för kapacitetsmål): gap_hours satt → kapacitetsmål,
  // timmar (ALDRIG en kr-del här); annars capacity_unconfigured → ärlig
  // "—"-text i stället för ett gissat gap; annars gap_kr (Etapp D-facit,
  // DET enda facit för hur nära ett pengamål är). En egen del, aldrig en
  // addition med de andra delarna ovan.
  if (progress.gap_hours != null) {
    parts.push(
      progress.gap_hours > 0
        ? `${progress.gap_hours.toLocaleString('sv-SE')} timmar kvar att boka`
        : 'veckan fylld',
    )
  } else if (progress.capacity_unconfigured) {
    parts.push('kapacitet ej konfigurerad')
  } else if (progress.gap_kr != null) {
    if (progress.gap_kr > 0) {
      parts.push(`${progress.gap_kr.toLocaleString('sv-SE')} kr kvar till målet`)
    } else if (verifieratBetaltKr > 0) {
      parts.push('målet nått')
    }
  }
  parts.push(
    progress.decisions_outstanding > 0
      ? `${progress.decisions_outstanding} beslut återstår`
      : 'inget väntar på dig just nu',
  )
  return parts
}
