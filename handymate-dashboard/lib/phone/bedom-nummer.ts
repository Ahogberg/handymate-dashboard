/**
 * Bedömer vad 46elks svar om ett nummer betyder. Ren funktion, inget nätverk.
 *
 * Ligger i lib/ och inte i cron-rutten eftersom Next bara tillåter vissa
 * exporter från en route-fil — och för att logiken ska gå att prova utan att
 * starta en server.
 *
 * Bakgrund: se app/api/cron/phone-number-verify/route.ts.
 */

export type NummerUtfallTyp =
  | 'ok'
  | 'nollstallt'
  | 'kan_ej_verifieras'
  | 'webhook_fel'
  | 'kontroll_misslyckades'

export interface NummerUtfall {
  business_id: string
  nummer: string
  utfall: NummerUtfallTyp
  detalj?: string
}

export function bedomNummer(
  rad: { assigned_phone_number: string },
  svar: { status: number; kropp: Record<string, unknown> | null },
  forvantadVoiceStartVag: string,
): { utfall: NummerUtfallTyp; detalj?: string } {
  if (svar.status === 404) return { utfall: 'nollstallt', detalj: 'numret finns inte hos 46elks' }
  if (svar.status < 200 || svar.status >= 300) {
    // 5xx, 429, nätfel: tillfälligt. Nollställ ALDRIG på detta — en störning
    // hos leverantören får inte koppla bort en fungerande telefon.
    return { utfall: 'kontroll_misslyckades', detalj: `46elks svarade ${svar.status}` }
  }
  const k = svar.kropp || {}
  if (String(k.active ?? 'yes') !== 'yes') return { utfall: 'nollstallt', detalj: 'numret är inte aktivt' }
  if (k.number && String(k.number) !== rad.assigned_phone_number) {
    return { utfall: 'nollstallt', detalj: `46elks har ${k.number}, vi har ${rad.assigned_phone_number}` }
  }
  const voiceStart = String(k.voice_start ?? '')
  if (!voiceStart.includes(forvantadVoiceStartVag)) {
    // Numret är vårt men ringer ingen. Nollställ inte — det skulle dölja att
    // numret finns och kostar pengar. Larma, så någon rättar voice_start.
    return { utfall: 'webhook_fel', detalj: voiceStart ? `voice_start pekar på ${voiceStart}` : 'voice_start saknas' }
  }
  return { utfall: 'ok' }
}
