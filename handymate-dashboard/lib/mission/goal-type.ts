/**
 * Delad uppdragstyp — Etapp F (kapacitetsmål, Goal-to-Plan V2,
 * tasks/jaunty-pondering-hummingbird.md, sql/v145_mission_capacity_goal.sql)
 * + Etapp I (kontaktmål, sql/v146_mission_contact_goal.sql).
 *
 * ═══ FAIL-SOFT-DEFAULTEN ═══
 *
 * sql/v145 (goal_type-kolumnen + goal_hours) och sql/v146 (goal_count) körs
 * manuellt av Andreas och är INTE körda i alla miljöer när den här koden
 * landar. En mission-rad som saknar kolumnen helt, eller bär null/ett okänt
 * värde, ska ALDRIG tolkas som något annat än 'money' — den gamla, redan
 * levande uppdragstypen. resolveGoalType() är den ENDA platsen den
 * defaulten uttrycks; alla läsare (mission-progress.ts, tool-router.ts,
 * matte/chat/route.ts, MatteHero.tsx) anropar den i stället för att upprepa
 * en egen jämförelsekedja.
 *
 * Noll imports, med flit: filen läses av både server-kod och en
 * 'use client'-komponent (MatteHero.tsx via mission-summary.ts) — den ska
 * aldrig kunna dra in serverberoenden i klientbunten.
 */

export type MissionGoalType = 'money' | 'capacity' | 'contact'

/** Kapacitetsmålets tak — en enskild veckas luckor kan aldrig rimligen
    överstiga det här antalet timmar. */
export const CAPACITY_GOAL_HOURS_MAX = 200

/** Kontaktmålets tak (Etapp I) — segmentet kommer ur portföljens
    plansteg/kundgrupper; ett enskilt uppdrag kan aldrig rimligen sikta på
    fler distinkta kunder än så här. */
export const CONTACT_GOAL_COUNT_MAX = 200

/** Defaultar allt som inte är exakt 'capacity'/'contact' till 'money' — se
    filhuvudet. */
export function resolveGoalType(value: unknown): MissionGoalType {
  if (value === 'capacity') return 'capacity'
  if (value === 'contact') return 'contact'
  return 'money'
}
