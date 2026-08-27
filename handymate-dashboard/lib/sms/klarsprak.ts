/**
 * 46elks-fel → klarspråk till hantverkaren (2026-08-27).
 *
 * Bevisat i prod samma dag: kvittot på hemmet sa "SMS:et stoppades (Not
 * enough credits on your account to send this SMS)". Det är (1) engelska,
 * (2) ett fel i VÅRT 46elks-konto som hantverkaren varken kan förstå eller
 * göra något åt. Andreas: "Absolut inte engelska felmeddelanden."
 *
 * Regeln: råtexten från leverantören loggas (sms_log.error_message,
 * console) och larmas internt när den är vår sak — men det som returneras
 * till anroparen, och därmed når kort, kvitton och banners, är alltid en
 * svensk mening som säger vad hantverkaren kan göra (om något).
 *
 * Ren modul: ingen I/O, enhetstestad.
 */
export type ElksFelKlass = 'saldo' | 'nummer' | 'auth' | 'natverk' | 'okant'

/** Vår sak — hantverkaren kan inte åtgärda; driftlarm till Handymate. */
export const ELKS_FEL_VAR_SAK: ReadonlyArray<ElksFelKlass> = ['saldo', 'auth']

export function klassaElksFel(raw: string | null | undefined, status?: number | null): ElksFelKlass {
  const t = (raw || '').toLowerCase()
  if (/not enough credits|insufficient (credit|funds)|no credits|saldo/.test(t)) return 'saldo'
  if (/invalid.*(number|recipient|to)|not a valid|unsupported.*number|blocked number/.test(t)) return 'nummer'
  if (status === 401 || status === 403 || /unauthori[sz]ed|authentication|forbidden|api key|credentials/.test(t)) return 'auth'
  if (/fetch exception|timeout|timed out|econnreset|enotfound|network|socket/.test(t) || (typeof status === 'number' && status >= 500)) return 'natverk'
  return 'okant'
}

const TEXT: Record<ElksFelKlass, string> = {
  saldo: 'SMS-tjänsten är tillfälligt otillgänglig — Handymate har larmats och åtgärdar det. Meddelandet skickades inte.',
  nummer: 'Telefonnumret verkar ogiltigt — kontrollera kundens nummer och försök igen.',
  auth: 'SMS-tjänsten är felkonfigurerad — Handymate har larmats. Meddelandet skickades inte.',
  natverk: 'SMS-tjänsten svarade inte — försök igen om en stund.',
  okant: 'SMS:et kunde inte skickas på grund av ett tekniskt fel hos SMS-leverantören.',
}

/** Svensk text till hantverkaren för ett leverantörsfel — aldrig råtexten. */
export function elksFelKlarsprak(raw: string | null | undefined, status?: number | null): string {
  return TEXT[klassaElksFel(raw, status)]
}
