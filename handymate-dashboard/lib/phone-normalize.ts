/**
 * C2: Telefonnummer-normalisering för svenska nummer
 *
 * Stöder:
 * - Mobilnummer: 07X-XXX XX XX → +467XXXXXXXX
 * - Fasta nummer: 08-XXX XX XX → +468XXXXXXXX
 * - Redan internationellt: +46... → +46...
 * - Med 0046 prefix: 0046... → +46...
 */

/**
 * Normalisera svenskt telefonnummer till E.164 format (+46...)
 */
export function normalizeSwedishPhone(phone: string): string {
  if (!phone) return ''

  // Ta bort alla icke-siffror utom +
  let cleaned = phone.replace(/[^\d+]/g, '')

  // Hantera 0046 prefix
  if (cleaned.startsWith('0046')) {
    cleaned = '+46' + cleaned.substring(4)
  }

  // Hantera +46 prefix (redan internationellt)
  if (cleaned.startsWith('+46')) {
    return cleaned
  }

  // Hantera 46 utan + (om det börjar med 46 och är tillräckligt långt)
  if (cleaned.startsWith('46') && cleaned.length >= 11) {
    return '+' + cleaned
  }

  // Hantera lokalt nummer med inledande 0
  if (cleaned.startsWith('0') && cleaned.length >= 7) {
    return '+46' + cleaned.substring(1)
  }

  // Returnera som det är om vi inte kan normalisera
  return phone.trim()
}

/**
 * Formatera E.164-nummer för visning
 * +46701234567 → 070-123 45 67
 */
export function formatSwedishPhone(phone: string): string {
  if (!phone) return ''

  let digits = phone.replace(/[^\d]/g, '')

  // Om det börjar med 46, konvertera till lokal form
  if (digits.startsWith('46') && digits.length >= 11) {
    digits = '0' + digits.substring(2)
  }

  // Mobilnummer (07X...)
  if (digits.startsWith('07') && digits.length === 10) {
    return `${digits.substring(0, 3)}-${digits.substring(3, 6)} ${digits.substring(6, 8)} ${digits.substring(8)}`
  }

  // Stockholm (08...)
  if (digits.startsWith('08') && digits.length >= 9) {
    return `${digits.substring(0, 2)}-${digits.substring(2, 5)} ${digits.substring(5, 7)} ${digits.substring(7)}`
  }

  // Göteborg/Malmö (031, 040...)
  if ((digits.startsWith('031') || digits.startsWith('040')) && digits.length >= 9) {
    return `${digits.substring(0, 3)}-${digits.substring(3, 6)} ${digits.substring(6, 8)} ${digits.substring(8)}`
  }

  // Övriga riktnummer (3-siffrigt)
  if (digits.startsWith('0') && digits.length >= 9) {
    return `${digits.substring(0, 3)}-${digits.substring(3, 6)} ${digits.substring(6, 8)} ${digits.substring(8)}`
  }

  return phone
}

/**
 * Validera att ett telefonnummer ser giltigt ut
 */
export function isValidSwedishPhone(phone: string): boolean {
  const normalized = normalizeSwedishPhone(phone)
  // +46 följt av 7-10 siffror
  return /^\+46\d{7,10}$/.test(normalized)
}

/**
 * Jämför två telefonnummer (normaliserade)
 */
export function phonesMatch(phone1: string, phone2: string): boolean {
  return normalizeSwedishPhone(phone1) === normalizeSwedishPhone(phone2)
}
