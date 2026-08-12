/**
 * Momenten som permanenta rader i "Värt att veta" (2026-08-12).
 *
 * ═══ VARFÖR EN EGEN FUNKTION OCH INTE INLINE I YTAN ═══
 *
 * MomentsProvider äger det FLYKTIGA globala kortet (ett per sidladdning,
 * lib/moments/interruption). Den här ytan är en annan sak: en permanent rad
 * i hemskärmens nyhetsflöde, byggd på exakt samma härledning
 * (lib/moments/derive.ts) men med sin egen regel för vad som får plats.
 *
 * ═══ VARFÖR INSIKTER UTELÄMNAS ═══
 *
 * deriveFromObservations (valueKind 'insikt') härleds ur samma
 * business_knowledge-rader som "Värt att veta" redan visar via
 * grindaNyheter — bara med en annan filtrering (!related_approval_id mot
 * grindarnas tre villkor). Att ta med dem här hade gett samma observation
 * som två rader med olika formulering, exakt den dubblering
 * news-gates.ts finns för att förhindra. Den här ytan är till för
 * penga-fynden (potential/risk) — insikter utan belopp har redan sin plats.
 *
 * ═══ DEDUPLICERINGEN MOT BESLUTSKORTEN ═══
 *
 * Ett moment härlett ur ett pending_approval har id:t "appr:<approval_id>"
 * (derive.ts). Beslutskorten i "Det här behöver dig idag" visar samma
 * approval-rad rakt av. Är den approval-raden redan synlig där ska den
 * inte upprepas här — samma regel som observationerna redan följer mot
 * beslutskorten (JarvisHome: `!o.related_approval_id && !o.had_approval`).
 *
 * Ren funktion — facit i tests/moments.spec.ts.
 */
import type { AgentMoment } from '@/lib/moments/derive'

/** "appr:<id>" → "<id>". Observationsmoment ("obs:<id>") ger null. */
export function approvalIdFromMoment(moment: AgentMoment): string | null {
  return moment.id.startsWith('appr:') ? moment.id.slice('appr:'.length) : null
}

/**
 * Penga-fynden för "Värt att veta": potential/risk, inte redan ett synligt
 * beslutskort, som mest `max` stycken. Listan kommer redan sorterad
 * störst-belopp-först ur deriveMoments — ordningen bevaras.
 */
export function pengaFynd(
  moments: AgentMoment[],
  beslutskortIds: Set<string>,
  max = 3,
): AgentMoment[] {
  return moments
    .filter(m => m.valueKind !== 'insikt')
    .filter(m => {
      const approvalId = approvalIdFromMoment(m)
      return !approvalId || !beslutskortIds.has(approvalId)
    })
    .slice(0, max)
}
