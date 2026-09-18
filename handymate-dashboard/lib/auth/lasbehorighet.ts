/**
 * Läsroller — enda stället som avgör vad en läsande roll får göra.
 *
 * Bakgrunden (2026-09-18): `revisor` är firmans redovisningskonsult. Hen ska
 * se siffrorna och inget annat.
 *
 * VARFÖR GRINDEN SITTER PÅ METODEN OCH INTE PÅ 291 STÄLLEN.
 * getAuthenticatedBusiness() i lib/auth.ts släpper in varje aktiv rad i
 * business_users utan att läsa rollen. Koden har 291 rollkontroller, men de
 * mutande rutter som bara anropar den helpern har ingen — bland dem
 * utskicksvägarna till kundens kunder. En roll som bara läggs till i
 * tabellen hade alltså fått skriva överallt där ingen råkat kontrollera.
 *
 * Därför: läsrollen nekas i helpern, på metoden. En läsning är GET, HEAD
 * eller OPTIONS. ALLT annat är en skrivning — inklusive en metod som inte
 * finns än. Listan är en allowlist just för att det ska vara omöjligt att
 * glömma att förbjuda något.
 *
 * VARFÖR ROLLEN OCH INTE FLAGGORNA. business_users har can_create_invoices,
 * can_approve_time och fyra andra flaggor. De är data någon kan bocka i i
 * teamvyn. Rollen är sanningen: hasPermission() i lib/permissions.ts ignorerar
 * flaggorna för en läsroll. Annars hade en bock i en ruta gjort revisorn till
 * en skrivande användare, och den bocken syns ingenstans i en kodgranskning.
 */

/** Roller som bara får läsa. Utökas aldrig utan att facit ändras med. */
export const LASROLLER = ['revisor'] as const
export type Lasroll = (typeof LASROLLER)[number]

/** Metoder som räknas som läsning. Allowlist — allt utanför är en skrivning. */
export const LASMETODER = ['GET', 'HEAD', 'OPTIONS'] as const

/** Vad en läsroll ändå får se. Inget här ändrar något i databasen. */
export const LASROLLENS_RATTIGHETER = ['see_all_projects', 'see_financials'] as const

export function arLasroll(role: string | null | undefined): boolean {
  return typeof role === 'string' && (LASROLLER as readonly string[]).includes(role)
}

/**
 * Får den här rollen utföra ett anrop med den här metoden?
 *
 * Okänd roll → sant: funktionen är inte en allmän behörighetskontroll, den
 * svarar bara på frågan "är detta en läsroll som försöker skriva?". Alla
 * andra roller grindas som förut av sina egna kontroller.
 */
export function farSkriva(role: string | null | undefined, method: string | null | undefined): boolean {
  if (!arLasroll(role)) return true
  const m = (method || '').toUpperCase()
  return (LASMETODER as readonly string[]).includes(m)
}
