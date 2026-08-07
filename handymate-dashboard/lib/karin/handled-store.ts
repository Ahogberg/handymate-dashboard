/**
 * Vilka kalenderhändelser ägaren markerat som hanterade (2026-08-07).
 *
 * ═══ VARFÖR business_preferences OCH INTE EN NY TABELL ═══
 *
 * `business_preferences` är en nyckel-värde-tabell med `UNIQUE(business_id, key)`
 * (sql/v2_business_preferences.sql:14) och används redan för morgonbriefens
 * cache. En hanterad-markering är exakt en sådan liten preferens.
 *
 * Att lägga en migration för det hade dessutom kostat mer än den smakar: v94
 * ligger redan okörd på Andreas bord, och varje ny `.sql` är ett moment till
 * som måste utföras manuellt innan funktionen fungerar. Det här kräver noll.
 *
 * ═══ VARFÖR DE GALLRAS ═══
 *
 * Utan gallring växer blobben för alltid — en momsdeklaration i kvartalet och
 * tolv arbetsgivardeklarationer om året blir hundratals rader på några år, och
 * de allra flesta pekar på datum som passerat för länge sedan.
 *
 * Gallringen är möjlig just för att id:t bär datumet: `regel:moms:2026-08-12`.
 * Det var hela poängen med ett stabilt id i stället för ett slumpat.
 *
 * Rena funktioner — tests/karin-handled-store.spec.ts.
 */

/** Nyckeln i business_preferences. */
export const HANDLED_KEY = 'karin_handled_events'

/** Hur länge en markering sparas efter att datumet passerat. */
const GALLRINGSGRANS_DAGAR = 120

/** Plockar ut datumet ur ett händelse-id. Null när id:t inte bär något. */
export function dateFromEventId(id: string): string | null {
  const m = id.match(/(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/**
 * Läser den lagrade listan.
 *
 * Trasigt eller okänt innehåll ger en tom mängd i stället för ett fel: en
 * kalender som vägrar rendera för att en preferens är korrupt är sämre än en
 * som glömt vad du bockat av.
 */
export function parseHandled(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set()
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return new Set()
    return new Set(v.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

/**
 * Gallrar bort markeringar vars datum passerat med god marginal.
 *
 * Id:n utan datum behålls alltid — vi vet inte när de blir inaktuella, och att
 * slänga något vi inte förstår är värre än att bära det.
 */
export function pruneHandled(ids: Iterable<string>, today: Date): string[] {
  const grans = new Date(today)
  grans.setDate(grans.getDate() - GALLRINGSGRANS_DAGAR)
  const gransStr = grans.toISOString().slice(0, 10)

  return Array.from(ids).filter(id => {
    const d = dateFromEventId(id)
    return d === null || d >= gransStr
  })
}

/** Lägger till eller tar bort en markering, och gallrar i samma veva. */
export function applyHandledChange(
  current: Set<string>,
  eventId: string,
  handled: boolean,
  today: Date,
): string[] {
  const nasta = new Set(current)
  if (handled) nasta.add(eventId)
  else nasta.delete(eventId)
  return pruneHandled(nasta, today).sort()
}
