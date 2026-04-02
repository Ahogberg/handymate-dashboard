/**
 * Formatera svarsnummer för SMS-mallar.
 *
 * Om företaget har ett tilldelat 46elks-nummer lägger vi till
 * "Svara: 07X-XXX XX XX" i meddelandetexten så kunden kan svara
 * och hamna i Matte-agentens konversationsflöde.
 *
 * Returnerar tom sträng om inget nummer finns.
 */
export function formatReplyHint(assignedPhoneNumber?: string | null): string {
  if (!assignedPhoneNumber) return ''
  // Formatera +46XXXXXXXXX → 0XX-XXX XX XX
  const formatted = formatSwedishPhone(assignedPhoneNumber)
  return `Svara: ${formatted}`
}

/**
 * Bygg SMS-signatur med företagsnamn + valfritt svarsnummer.
 *
 * Exempel:
 *   buildSmsSuffix('Svenssons El', '+46761234567')
 *   → "\n\nSvara: 076-123 45 67\n//Svenssons El"
 *
 *   buildSmsSuffix('Svenssons El')
 *   → "\n//Svenssons El"
 */
export function buildSmsSuffix(
  businessName: string,
  assignedPhoneNumber?: string | null,
): string {
  const replyHint = formatReplyHint(assignedPhoneNumber)
  if (replyHint) {
    return `\n${replyHint}\n//${businessName}`
  }
  return `//${businessName}`
}

/** +46761234567 → 076-123 45 67 */
function formatSwedishPhone(phone: string): string {
  // Strip + and country code
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('46') && digits.length > 9) {
    digits = '0' + digits.substring(2)
  }
  // Format: 0XX-XXX XX XX
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`
  }
  return digits
}
