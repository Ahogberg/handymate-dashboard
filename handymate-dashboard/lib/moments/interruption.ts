/**
 * Vilka fynd får avbryta hantverkaren — och vilka får vänta.
 *
 * ═══ INTE CLIPPY ═══
 *
 * Poppuppen är den dyraste ytan i produkten: varje gång den visar något
 * halvviktigt sjunker värdet på nästa gång den visas. Regeln är därför
 * omvänd mot vad man frestas till i en säljdemo — det mesta ska INTE
 * avbryta.
 *
 *   global — glid-in-kort. Bara stora, färska pengar.
 *   badge  — siffra på Matte-bubblan. Värt att se i dag.
 *   panel  — syns när man själv öppnar Matte. Allt annat.
 *
 * Sedd-markeringen ligger hos klienten (localStorage, hm_moment_seen:<id>).
 * Momentens id är härledda ur källradens id och därför stabila — samma
 * fynd kan aldrig avbryta två gånger, inte ens efter omladdning.
 *
 * Rena funktioner — facit i tests/moments.spec.ts.
 */
import type { AgentMoment } from './derive'

export type MomentTier = 'global' | 'badge' | 'panel'

/** Under det här är ett belopp inte skäl nog att avbryta någon. */
const GLOBAL_MIN_KR = 10_000
/** Ett gammalt fynd har redan haft sina chanser i kön och panelen. */
const GLOBAL_MAX_AGE_DAYS = 3

export function tierFor(moment: AgentMoment, now: Date): MomentTier {
  const alderDagar = (now.getTime() - new Date(moment.createdAt).getTime()) / 86_400_000

  if (
    moment.urgency === 'high' &&
    (moment.amountKr ?? 0) >= GLOBAL_MIN_KR &&
    alderDagar >= 0 &&
    alderDagar <= GLOBAL_MAX_AGE_DAYS
  ) {
    return 'global'
  }

  if (moment.urgency !== 'low') return 'badge'
  return 'panel'
}

/**
 * Dela upp dagens moments i nivåer, med sedda bortfiltrerade från de två
 * avbrytande nivåerna. Panelen behåller allt — att själv öppna Matte är
 * att be om hela listan, sedd eller ej.
 *
 * HÖGST ETT globalt kort returneras. Två kort som glider in efter varandra
 * är exakt det Clippy-läge som gör att folk stänger av alltihop.
 */
export function splitByTier(
  moments: AgentMoment[],
  seenIds: Set<string>,
  now: Date,
): { global: AgentMoment | null; badge: AgentMoment[]; panel: AgentMoment[] } {
  let global: AgentMoment | null = null
  const badge: AgentMoment[] = []
  const panel: AgentMoment[] = []

  for (const m of moments) {
    const tier = tierFor(m, now)
    if (tier === 'global' && !seenIds.has(m.id)) {
      // Första kvalificerade vinner — listan är redan sorterad störst först.
      if (!global) global = m
      else badge.push(m)
    } else if (tier === 'badge' && !seenIds.has(m.id)) {
      badge.push(m)
    } else {
      panel.push(m)
    }
  }

  return { global, badge, panel }
}

/**
 * Summan som får stå på bubblan ("47 000 kr hittat").
 *
 * Räknar BARA osedda moments med verkliga belopp — insikter utan siffra
 * bidrar med noll i stället för att hittas på. Blir summan noll visas
 * antal i stället för kronor; det avgör ytan, inte motorn.
 */
export function unseenValueKr(moments: AgentMoment[], seenIds: Set<string>): number {
  return moments
    .filter(m => !seenIds.has(m.id))
    .reduce((sum, m) => sum + (m.amountKr ?? 0), 0)
}
