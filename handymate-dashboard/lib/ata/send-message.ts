/**
 * SMS-texten som skickas när en ÄTA går till kunden för signering.
 *
 * ═══ VARFÖR ═══
 *
 * Utbruten till egen fil så att "Skicka ÄTA"-dialogen (Etapp C) kan
 * förhandsvisa EXAKT samma text som `/api/ata/[id]/send` faktiskt skickar
 * — i stället för att gissa i UI:t och riskera att texterna glider isär.
 */

/** Kapa en beskrivning till max `längd` tecken, med "…" om den klipps. */
function kapaBeskrivning(text: string, längd: number): string {
  const trimmad = text.trim()
  if (trimmad.length <= längd) return trimmad
  return `${trimmad.slice(0, längd).trimEnd()}…`
}

export interface AtaSmsInput {
  fornamn?: string | null
  foretag: string
  ataNummer: number | string
  beskrivning: string
  beloppInklMoms: number
  url: string
}

/**
 * Bygg ÄTA-SMS:et. Håll texten (utan URL) under 160 tecken där det går —
 * ett SMS över 160 tecken delas upp i flera delar och kostar mer
 * (46elks-strypunkten är per del).
 */
export function byggAtaSms(input: AtaSmsInput): string {
  const halsning = input.fornamn && input.fornamn.trim() !== ''
    ? `Hej ${input.fornamn.trim()}!`
    : 'Hej!'

  const beskrivning = kapaBeskrivning(input.beskrivning, 40)
  const belopp = Math.round(input.beloppInklMoms).toLocaleString('sv-SE')

  return `${halsning} ${input.foretag}: ÄTA-${input.ataNummer} "${beskrivning}" på ${belopp} kr inkl. moms väntar på ditt godkännande: ${input.url}`
}
