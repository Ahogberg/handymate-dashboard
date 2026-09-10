import type { SmsPurpose } from '@/lib/outbound/sms-gate'

/**
 * Vilket SYFTE en automationsregels SMS har — och därmed vilka spärrar som
 * gäller för det.
 *
 * Bakgrund (2026-09-10, provsamtalet kl 07:30). Kunden ringde, ingen svarade,
 * och fångst-SMS:et gick INTE ut. Skälet i loggen: "Kunden har redan fått ett
 * SMS de senaste sju dagarna". Regelmotorn hårdkodade `purpose: 'proactive'`
 * för varje regel-SMS (lib/automation-engine.ts), och sjudagarsfönstret i
 * lib/outbound/sms-gate.ts gäller just `proactive`. Ett svar på ett samtal
 * kunden själv ringt hamnade alltså under samma tak som ett kampanjutskick.
 *
 * Spärren är riktig och ska vara kvar — den finns för att en hantverkares
 * kunder inte ska bli nedringda av omvårdnadsutskick. Felet var
 * klassificeringen: taxonomin har redan `conversational`, som fönstret
 * medvetet inte rör.
 *
 * Regeln som avgör: HAR KUNDEN NYSS HÖRT AV SIG? Då är vårt SMS ett svar, och
 * ett svar får aldrig hållas tillbaka av en frekvensspärr — att tiga när någon
 * just ringt är värre än ett SMS för mycket. Allt annat (uppföljningar,
 * omvårdnad, påminnelser om vad vi själva skickat, kampanjer) är `proactive`
 * och ligger kvar under taket.
 *
 * Listan är avsiktligt kort och sluten: en händelse som inte står här räknas
 * som proaktiv. Att lägga till en händelse här är att ta bort en spärr för
 * den, så det ska vara ett uttryckligt beslut per händelse.
 */

/** Händelser där kunden själv tog kontakt och vårt SMS är svaret. */
export const SVAR_PA_KUNDKONTAKT = [
  // Kunden ringde, hantverkaren svarade inte. Fångst-SMS:et ÄR svaret.
  'call_missed',
  // Kunden skickade ett SMS.
  'sms_received',
  // Kunden mejlade.
  'email_received',
  // En förfrågan kom in (formulär, portal, partnerflöde) — bekräftelsen till
  // kunden är ett svar på något kunden just gjorde.
  'lead_received',
  'lead_created',
] as const

export function smsSyfteForHandelse(handelse: string | null | undefined): SmsPurpose {
  const namn = (handelse || '').trim()
  if (!namn) return 'proactive'
  return (SVAR_PA_KUNDKONTAKT as readonly string[]).includes(namn) ? 'conversational' : 'proactive'
}
