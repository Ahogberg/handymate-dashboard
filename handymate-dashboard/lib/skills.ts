/**
 * resolveMemberSkills — extraherad ur lib/dispatch.ts (R3, tasks/
 * resurs-masterplan.md) till en egen fil UTAN server-only imports, så den
 * kan importeras tryggt från klientkomponenter (Team-kortgridens
 * specialitets-chips, app/dashboard/team/components/MemberCard.tsx) utan
 * att dra in lib/dispatch.ts:s getServerSupabase-beroende i klientbundeln
 * (samma försiktighet som schema/page.tsx redan visar genom att bara
 * type-importera lib/schedule/dispatch-assessment.ts).
 *
 * lib/dispatch.ts re-exporterar denna funktion oförändrat — befintliga
 * imports (tests/dispatch-matching.spec.ts, lib/schedule/dispatch-
 * assessment.ts) fortsätter fungera identiskt, ingen beteendeförändring.
 */

/**
 * skills↔specialties (R1, tasks/resurs-masterplan.md): `specialties[]`
 * (business_users.specialties TEXT[], sql/v_job_types.sql) har en riktig
 * skriv-UI (team/page.tsx, kopplad till job_types) — `skills` (JSONB,
 * sql/v17_dispatch.sql) saknar UI helt och är i praktiken död data.
 * specialties[] är nu sanningskällan; skills är fallback tills
 * sql/v83_retire_skills_jsonb.sql är körd (Andreas, manuellt), då har
 * befintliga skills-värden redan kopierats in i specialties för de
 * medlemmar som saknade dem. Efter det körs specialties alltid.
 */
export function resolveMemberSkills(m: { skills?: unknown; specialties?: unknown }): string[] {
  const specialties = Array.isArray(m.specialties) ? (m.specialties as string[]) : []
  if (specialties.length > 0) return specialties
  const skills = Array.isArray(m.skills) ? (m.skills as string[]) : []
  if (skills.length > 0) {
    console.warn('[dispatch] specialties[] tom — faller tillbaka på skills-JSONB (kör sql/v83_retire_skills_jsonb.sql för att migrera)')
  }
  return skills
}
