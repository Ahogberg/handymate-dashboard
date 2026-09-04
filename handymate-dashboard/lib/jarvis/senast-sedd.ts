/**
 * "Sedan du var här senast" — dygnsdigestens fönster utökat bortom det
 * rullande dygnet (Pass C, del 2 —
 * docs/audits/AUTOPILOT_REVISION_2026-09-04.md, avsnitt 7). En hantverkare
 * som varit på bygget i tre dagar ska se tre dagars arbete i "Skött utan
 * dig", inte ett fönster som bara täcker det sista dygnet.
 *
 * ═══ VARFÖR localStorage OCH INTE business_users.last_login_at ═══
 *
 * Planen bad oss leta upp var "senaste inloggning" redan sparas.
 * business_users.last_login_at FINNS i schemat (sql/business_users.sql,
 * kolumn redan där) men skrivs ALDRIG någonstans i kodbasen — verifierat:
 * bara LÄST (app/api/team/route.ts, app/dashboard/profile/page.tsx), aldrig
 * satt av något login-flöde. Att lita på en kolumn ingen skriver till hade
 * gett exakt samma "tomt fönster"-bugg den här ändringen ska fixa (alltid
 * null → alltid 24h-fallback). Planens egen reservlösning gäller alltså:
 * en localStorage-nyckel JarvisHome sätter vid varje laddning. Ingen
 * migration.
 *
 * byggDygnsdigest (lib/jarvis/dygnsdigest.ts) tar redan ett valfritt
 * `from`-fält (Owner Absence V1) som ERSÄTTER dess normala 24h-bakåträkning
 * — den mekaniken behöver inget tillägg, bara en klient som räknar ut rätt
 * `from` och skickar in den. Det är det den här filen gör.
 */

export const SENAST_SEDD_KEY = 'handymate_senast_sedd'

/** Golv: fönstret är ALDRIG kortare än ett dygn — nattens cronarbete ska
    alltid synas, samma skäl som DIGEST_TIMMAR i dygnsdigest.ts. */
export const DIGEST_GOLV_TIMMAR = 24

/** Tak: fönstret är ALDRIG längre än en vecka — ett halvår gammalt besök
    ska inte öppna ett halvårs digest. */
export const DIGEST_TAK_DAGAR = 7

/**
 * Ren funktion: fönstrets startpunkt i epoch-ms.
 *
 * gap = clamp(nu − senastSedd, 24h, 7 dagar); fönster = nu − gap.
 *
 * Saknas `senastSeddMs` (första besöket, eller localStorage otillgängligt/
 * trasigt) eller ligger den i framtiden (klockskev) faller fönstret tillbaka
 * till exakt 24 h — dagens beteende, oförändrat.
 */
export function digestFonsterStartMs(nuMs: number, senastSeddMs: number | null): number {
  const golv = DIGEST_GOLV_TIMMAR * 3600_000
  if (senastSeddMs === null || !Number.isFinite(senastSeddMs) || senastSeddMs >= nuMs) {
    return nuMs - golv
  }
  const tak = DIGEST_TAK_DAGAR * 24 * 3600_000
  const gap = Math.min(tak, Math.max(golv, nuMs - senastSeddMs))
  return nuMs - gap
}

const VECKODAG_GENITIV = ['söndags', 'måndags', 'tisdags', 'onsdags', 'torsdags', 'fredags', 'lördags']

/**
 * Rubriken i SkottUtanDig — filens egen regel (se dess filhuvud): den ska
 * ALDRIG ljuga om fönstret.
 *
 *  - 0–1 dygn: "Skött utan dig sedan i går" (dagens ordalydelse, oförändrad).
 *  - 2–6 dygn: "Skött utan dig sedan i <veckodag>".
 *  - 7 dygn (taket): "Skött utan dig sedan du var här senast (N dagar)" —
 *    ingen veckodag kan ärligt uttrycka "en vecka eller mer sedan" utan att
 *    bli en gissning, så taket får sin egen, exakta formulering.
 */
export function skottUtanDigRubrik(nuMs: number, fonsterStartMs: number): string {
  const gapDygn = Math.round((nuMs - fonsterStartMs) / (24 * 3600_000))
  if (gapDygn <= 1) return 'Skött utan dig sedan i går'
  if (gapDygn < DIGEST_TAK_DAGAR) {
    const veckodag = VECKODAG_GENITIV[new Date(fonsterStartMs).getDay()]
    return `Skött utan dig sedan i ${veckodag}`
  }
  return `Skött utan dig sedan du var här senast (${gapDygn} dagar)`
}
