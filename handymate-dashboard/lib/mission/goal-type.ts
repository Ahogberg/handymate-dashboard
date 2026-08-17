/**
 * Delad uppdragstyp — Etapp F (kapacitetsmål, Goal-to-Plan V2,
 * tasks/jaunty-pondering-hummingbird.md, sql/v145_mission_capacity_goal.sql).
 *
 * ═══ FAIL-SOFT-DEFAULTEN ═══
 *
 * sql/v145 (goal_type-kolumnen + goal_hours) körs manuellt av Andreas och är
 * INTE körd i alla miljöer när den här koden landar. En mission-rad som
 * saknar kolumnen helt, eller bär null/ett okänt värde, ska ALDRIG tolkas
 * som något annat än 'money' — den gamla, redan levande uppdragstypen.
 * resolveGoalType() är den ENDA platsen den defaulten uttrycks; alla läsare
 * (mission-progress.ts, tool-router.ts, matte/chat/route.ts, MatteHero.tsx)
 * anropar den i stället för att upprepa `=== 'capacity' ? ... : 'money'`.
 *
 * Noll imports, med flit: filen läses av både server-kod och en
 * 'use client'-komponent (MatteHero.tsx via mission-summary.ts) — den ska
 * aldrig kunna dra in serverberoenden i klientbunten.
 */

export type MissionGoalType = 'money' | 'capacity'

/** Kapacitetsmålets tak — en enskild veckas luckor kan aldrig rimligen
    överstiga det här antalet timmar. */
export const CAPACITY_GOAL_HOURS_MAX = 200

/** Defaultar allt som inte är exakt 'capacity' till 'money' — se filhuvudet. */
export function resolveGoalType(value: unknown): MissionGoalType {
  return value === 'capacity' ? 'capacity' : 'money'
}
