/**
 * lib/sms/sender-id.ts (2026-05-28).
 *
 * Sanerar business_name till en 46elks-godkänd alfanumerisk avsändar-ID.
 *
 * 46elks-regler (alphanumeric sender ID):
 *   - Endast A-Z, a-z, 0-9
 *   - Max 11 tecken
 *   - Inga mellanslag eller symboler (vissa svenska operatörer avvisar)
 *
 * Bug-historia (2026-05-28): "Bee Service" har mellanslag på pos 4
 * → 46elks avvisar med "endast får använda karaktärer A-Z utan symboler".
 * 31 olika SMS-call-sites använde `(name || 'Handymate').substring(0, 11)`
 * utan sanering → alla SMS-flöden för Bee Service blockerade.
 *
 * Använd ALLTID denna helper för from-fältet i 46elks-anrop, aldrig
 * direkt substring(0, 11) på obearbetat business-namn.
 */

export function sanitizeSenderId(name: string | null | undefined): string {
  const sanitized = (name || '').replace(/[^A-Za-z0-9]/g, '').substring(0, 11)
  return sanitized || 'Handymate'
}
