/**
 * Måndagsmötet — takeover-läget (Måndagsmötet etapp 2, 2026-08-13).
 *
 * Rena, testbara byggstenar för components/jarvis/MandagsmoteTakeover.tsx och
 * dess montering i components/jarvis/JarvisHome.tsx. Ingen DOM, ingen
 * localStorage-åtkomst här — bara beslutslogiken, samma split som resten av
 * lib/jarvis/*.ts (approval-view.ts, card-voice.ts m.fl.).
 *
 * Rör INTE lib/jarvis/monday-brief.ts — den filen äger n>0-regeln för VILKA
 * sektioner ett kort bär (redan körd server-side, se byggMandagskort). Den
 * här filen bestämmer bara i vilken ORDNING takeovern avslöjar de sektioner
 * som redan finns i payloaden, plus när takeovern får öppna sig själv.
 *
 * Facit: tests/mandagsmote-takeover.spec.ts.
 */

/** localStorage-nyckeln är skopad per approval-id — mandagskortId (se
 *  lib/jarvis/monday-brief.ts) är redan deterministisk per företag+ISO-vecka,
 *  så nyckeln nollställs naturligt varje ny vecka utan egen datumlogik. */
export function mandagsmoteSeenKey(approvalId: string): string {
  return `hm_mandagsmote_sett_${approvalId}`
}

/**
 * Har onboarding-kedjan (CompanyScan → HemTur) släppt fram dashboarden helt?
 *
 * `welcomeTourSeen` speglar business_config.welcome_tour_seen (satt av
 * HemTur.finish(), ALDRIG av CompanyScan — se components/tour/HemTur.tsx och
 * components/tour/CompanyScan.tsx). `hemturSeenLocally` täcker fönstret
 * mellan att HemTur skriver sin egen localStorage-flagga (hm_hemtur_klar,
 * synkront) och att server-flaggan hunnit rundtripa (PUT:en är
 * fire-and-forget) — utan den andra vägen kunde Måndagsmötet trigga för
 * tidigt precis efter en färdig Hemtur i samma session.
 */
export function onboardingGatesResolved(input: {
  welcomeTourSeen: boolean
  hemturSeenLocally: boolean
}): boolean {
  return input.welcomeTourSeen || input.hemturSeenLocally
}

/**
 * Ska takeovern öppna sig SJÄLV vid sidladdning?
 *
 * Bara när det finns ett pending-kort, onboarding-kedjan är helt förbi (se
 * onboardingGatesResolved), och den här specifika veckans kort inte redan
 * visats i den här webbläsaren (mandagsmoteSeenKey).
 */
export function shouldAutoOpenMandagsmote(input: {
  approvalId: string | null
  onboardingResolved: boolean
  alreadySeen: boolean
}): boolean {
  return input.approvalId !== null && input.onboardingResolved && !input.alreadySeen
}

export type MandagsmoteSectionKey = 'resultat' | 'lardomar' | 'risker' | 'fortroende'

/**
 * Ordningen sektionerna avslöjas i under den stegvisa uppbyggnaden
 * (mirrorar buildScanRows-mönstret i components/tour/CompanyScan.tsx, men
 * över de fyra REDAN filtrerade sektionerna i stället för enskilda rader).
 * En sektion som är null/tom (n=0-regeln kördes redan i byggMandagskort)
 * tas aldrig med — takeovern hittar aldrig på en femte, tom sektion.
 */
/** Truthy för objekt (lardomar), men en TOM array räknas inte som "finns" —
 *  en bar `[]` är truthy i JS och hade annars gett en avslöjad-men-tom
 *  sektion. Defensivt: byggMandagskort garanterar redan icke-tomma arrayer
 *  server-side, men den här funktionen ska hålla samma sanning oavsett. */
function harInnehall(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0
  return Boolean(v)
}

export function mandagsmoteSectionOrder(payload: {
  resultat?: unknown[] | null
  lardomar?: unknown | null
  risker?: unknown[] | null
  fortroende?: unknown[] | null
}): MandagsmoteSectionKey[] {
  const order: MandagsmoteSectionKey[] = []
  if (harInnehall(payload.resultat)) order.push('resultat')
  if (harInnehall(payload.lardomar)) order.push('lardomar')
  if (harInnehall(payload.risker)) order.push('risker')
  if (harInnehall(payload.fortroende)) order.push('fortroende')
  return order
}
