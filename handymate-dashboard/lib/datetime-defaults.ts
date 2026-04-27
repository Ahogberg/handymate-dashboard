/**
 * Hjälpfunktioner för default-datum och -tid i formulär.
 * Säkerställer att hantverkaren slipper klicka för att fylla i "nu".
 */

/** Returnerar dagens datum i ISO-format (YYYY-MM-DD) */
export function todayDateStr(): string {
  return new Date().toISOString().split('T')[0]
}

/** Returnerar nuvarande tid i HH:MM-format (avrundat till närmaste 5 min) */
export function nowTimeStr(): string {
  const d = new Date()
  // Avrunda till närmaste 5 min för bekvämare uppgiftsskapande
  const minutes = Math.round(d.getMinutes() / 5) * 5
  const adjustedHour = minutes === 60 ? d.getHours() + 1 : d.getHours()
  const adjustedMinute = minutes === 60 ? 0 : minutes
  return `${String(adjustedHour).padStart(2, '0')}:${String(adjustedMinute).padStart(2, '0')}`
}
