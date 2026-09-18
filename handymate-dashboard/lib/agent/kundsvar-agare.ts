/**
 * Vem äger kundsvaret på ett inkommande SMS (2026-09-18).
 *
 * BAKGRUND. app/api/sms/incoming/route.ts startade två oberoende svarsvägar
 * på samma kund-SMS:
 *   (a) Matte-intelligensen — resolver → intent-agent → action-executor,
 *       som kan svara kunden via sendCustomerReply, grindad av
 *       business_config.matte_customer_reply_enabled (sql/v199, default
 *       false) och agents_globally_paused.
 *   (b) triggerAgentFireAndForget('incoming_sms', …) → /api/agent/trigger,
 *       där agenten (routeToAgent → Lisa, lead-agenten i orchestrator-
 *       vägen) har send_sms bland sina verktyg och en systemprompt som
 *       ordagrant sa "svara med SMS".
 * Med flaggan på kan alltså två modeller, som inte vet om varandra, svara
 * samma kund på samma meddelande. Två svar är inte redundans — det är två
 * svar, och kunden ser båda.
 *
 * MÄTNINGEN (prod, 2026-09-18): matte_customer_reply_enabled är true hos 0
 * av 29 företag, och inget utgående SMS har någonsin följt på ett inkommande
 * kund-SMS (noll rader inom 1 minut OCH inom 30 minuter; kontrollerat mot
 * radantalen 14 inkommande kund-SMS och 101 utgående i sms_log). Buggen har
 * alltså aldrig smällt — inkommande SMS gjorde i praktiken ingenting förrän
 * spår 1 landade. Spår 1 gör vägen verkligt användbar, och därmed går risken
 * från teoretisk till nära förestående. Den stängs före det första riktiga
 * kundsvaret, inte efter.
 *
 * BESLUTET. Matte-vägen äger kundsvaret: den har entitetsupplösning, lediga
 * tider, kundfakta och grindarna ovan. Agenten fortsätter kvalificera (leads,
 * kundpost, kort) men får send_sms bortfiltrerat NÄR körningen är svaret på
 * ett inkommande SMS. Ingen annan trigger och inget annat verktyg berörs —
 * agenten ska fortfarande kunna skicka SMS från cron, automationsregler,
 * samtalsvägen och hantverkarens egna kommandon (sms_log visar 11 rader med
 * message_type 'send_sms' från just de sammanhangen).
 *
 * send_email är MEDVETET inte med: felet som mätts är dubbla SMS-svar, och
 * lead-agentens verktygslista har inte ens send_email. Att vidga grinden till
 * e-post vore en egen beteendeändring utan mätt fel bakom sig.
 *
 * DUBBELGRIND (samma disciplin som lib/agent/external-actor.ts och
 * app/api/matte/chat/route.ts isToolAllowedForAgent):
 *   1. app/api/agent/trigger/route.ts filtrerar verktygslistan — modellen
 *      ser aldrig send_sms i den här kontexten.
 *   2. app/api/agent/trigger/tool-router.ts executeTool() nekar FÖRE
 *      switchen — listan till modellen är UX, inte gränsen. Ett hallucinerat
 *      eller injicerat verktygsnamn når aldrig sms-strypunkten.
 *
 * Facit: tests/sms-inkommande.spec.ts (räknar faktiska sendSmsViaElks-anrop).
 */

/** Triggertypen där Matte-vägen äger kundsvaret. */
export const MATTE_AGER_KUNDSVARET_TRIGGER = 'incoming_sms'

/** Verktyg agenten inte får använda när Matte äger kundsvaret. Avsiktligt ett. */
export const KUNDSVARSVERKTYG_MATTE_AGER = ['send_sms'] as const

/** Neutral text till modellen — säger vad som gäller, inte vilka verktyg som finns. */
export const KUNDSVAR_AGS_AV_MATTE_MEDDELANDE =
  'Svaret till kunden på det här SMS:et skickas av Matte-vägen. Kvalificera ärendet — skicka inget eget SMS.'

/** Är körningen svaret på ett inkommande kund-SMS? */
export function matteAgerKundsvaret(triggerType?: string | null): boolean {
  return triggerType === MATTE_AGER_KUNDSVARET_TRIGGER
}

/** Sant för det verktyg som Matte-vägen äger i den här triggerkontexten. */
export function agsVerktygetAvMatte(name: string, triggerType?: string | null): boolean {
  return matteAgerKundsvaret(triggerType) && (KUNDSVARSVERKTYG_MATTE_AGER as readonly string[]).includes(name)
}
