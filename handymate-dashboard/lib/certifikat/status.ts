/**
 * Certifikat-status — ren, facit-testbar klassningskärna (R3,
 * tasks/resurs-masterplan.md, punkt 3). Ingen I/O — konsumeras av
 * app/dashboard/team/components/MemberCard.tsx (badge-färg) och
 * app/api/cron/cert-expiry-check/route.ts (påminnelse-urval).
 *
 * Datumjämförelse sker på YYYY-MM-DD-strängar (lexikografisk ordning
 * fungerar för ISO-datum) mot svensk lokaldag (lib/dates.ts svDateStr) —
 * samma mönster som lib/schedule/person-day.ts använder för att undvika
 * UTC/Europe-Stockholm-glapp mellan cron (körs på Vercel/UTC) och
 * dashboard-klienten.
 */
import { svDateStr, svDateStrPlusDays } from '@/lib/dates'

/** Tröskeln för "går ut snart"-badgen (amber) på kortet. */
export const CERT_EXPIRING_SOON_DAYS = 60

/** Fönstret cron-påminnelsen (cert_expiry_reminder) letar inom. */
export const CERT_REMINDER_WINDOW_DAYS = 30

export type CertStatus = 'no_expiry' | 'valid' | 'expiring_soon' | 'expired'

/**
 * Klassar ett certifikat utifrån dess valid_until (YYYY-MM-DD eller null).
 *   - null                              → 'no_expiry' (visas grönt, inget datum att varna för)
 *   - förfallet redan                   → 'expired'   (rött)
 *   - inom CERT_EXPIRING_SOON_DAYS dagar → 'expiring_soon' (amber)
 *   - annars                            → 'valid'     (grönt)
 */
export function classifyCertStatus(
  validUntil: string | null | undefined,
  todayStr: string = svDateStr(),
): CertStatus {
  if (!validUntil) return 'no_expiry'
  if (validUntil < todayStr) return 'expired'
  const soonThreshold = svDateStrPlusDays(CERT_EXPIRING_SOON_DAYS, new Date(`${todayStr}T12:00:00Z`))
  if (validUntil <= soonThreshold) return 'expiring_soon'
  return 'valid'
}

export interface CertLike {
  id: string
  valid_until: string | null
}

/**
 * Väljer ut certifikat som ska trigga en agentpåminnelse: valid_until satt
 * OCH inom CERT_REMINDER_WINDOW_DAYS dagar.
 *
 * MEDVETEN TOLKNING av "inom 30 dagar" (planfilen): INKLUSIVE redan
 * utgångna certifikat (valid_until <= idag+30), inte bara framåtblickande
 * datum. Ett certifikat som redan gått ut utan förnyelse är MER akut än
 * ett som går ut om två veckor — att bara larma innan utgång och sedan gå
 * tyst i samma sekund det faktiskt löper ut vore en sämre produkt, inte en
 * strikare tolkning av ordalydelsen. Dedupe mot en redan öppen
 * pending_approval sker i cron-routen (kräver DB-åtkomst) — inte här,
 * denna funktion är ren urvalslogik på redan hämtade rader.
 */
export function selectCertsNeedingReminder<T extends CertLike>(
  certs: T[],
  todayStr: string = svDateStr(),
): T[] {
  const windowEnd = svDateStrPlusDays(CERT_REMINDER_WINDOW_DAYS, new Date(`${todayStr}T12:00:00Z`))
  return certs.filter((c) => !!c.valid_until && c.valid_until <= windowEnd)
}
