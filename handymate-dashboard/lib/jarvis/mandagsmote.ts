/**
 * Måndagsmötet — takeover-läget (Måndagsmötet etapp 2, 2026-08-13).
 * Veckomötet — dialogformen (Veckomötet, 2026-08-14, se Claude Design-
 * projektet "Digital CFO + COO-mötet").
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
 * byggVeckomoteRepliker gör om de fyra sektionerna till en ordnad lista av
 * "repliker" (en per sektion, utom förtroende som är en per rad — varje
 * förtroenderad bär redan sin egen riktiga agent, se AUTONOMY_META). Ingen
 * ny data, ingen påhittad mening — bara samma rader som MandagskortCard
 * redan visar, omskrivna till en sammanhängande mening per replik.
 *
 * Facit: tests/mandagsmote-takeover.spec.ts.
 */

import type {
  MandagskortResultatRad,
  MandagskortLardomar,
  MandagskortRiskRad,
  MandagskortFortroendeRad,
} from '@/lib/jarvis/monday-brief'

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

/** Delas mellan JarvisHome.tsx (den vanliga kön) och MandagsmoteTakeover.tsx
 *  (Veckomötets beslutskort) — samma fönster, en enda källa, aldrig två
 *  konstanter som kan glida isär. Ett godkännande är oåterkalleligt efter
 *  det här fönstret (POST:en till /api/approvals/:id har redan gått). */
export const UNDO_WINDOW_MS = 5000

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

// ── Veckomötets repliker (dialogformen) ─────────────────────────────────

export interface VeckomoteReplik {
  agentId: string
  text: string
}

/** Samma etiketter som MandagskortCard.tsx (RESULTAT_LABEL) — dupliceras
 *  medvetet, de två filerna renderar mot olika ytor (lista kontra dialog). */
const RESULTAT_LABEL: Record<MandagskortResultatRad['key'], string> = {
  identifierat: 'Identifierat',
  agerat: 'Agerat',
  fakturerat: 'Fakturerat',
  betalt: 'Betalt',
}

function krText(kr: number): string {
  return `${Math.round(kr).toLocaleString('sv-SE')} kr`
}

/** "ett beslut" / "2 beslut" — svensk pluralisering, samma stil som
 *  mandagskortBeskrivning (lib/jarvis/monday-brief.ts). */
export function beslutText(n: number): string {
  return n === 1 ? 'ett beslut' : `${n} beslut`
}

function resultatReplik(rader: MandagskortResultatRad[]): string {
  const delar = rader.map(r => `${RESULTAT_LABEL[r.key]} ${r.antal} st · ${krText(r.kr)}`)
  return `Den här månaden: ${delar.join(', ')}.`
}

function lardomarReplik(l: MandagskortLardomar): string {
  return `${l.antal} ny${l.antal === 1 ? '' : 'a'} lärdom${l.antal === 1 ? '' : 'ar'} sedan förra veckan, från avslutade projekt.`
}

function riskerReplik(rader: MandagskortRiskRad[]): string {
  const projekt = rader.map(r => {
    const procent = typeof r.cost_percent === 'number'
      ? ` — ${r.cost_percent}% av kalkylen använt${r.status === 'over_budget' ? ' (budgeten är överskriden)' : ''}`
      : ''
    return `${r.project_name}${procent}`
  })
  const rubrik = rader.length === 1 ? 'Ett projekt att hålla koll på: ' : `${rader.length} projekt att hålla koll på: `
  return `${rubrik}${projekt.join('; ')}.`
}

function fortroendeRepliker(rader: MandagskortFortroendeRad[]): VeckomoteReplik[] {
  return rader.map(r => ({
    agentId: r.agent,
    text: `${r.label} sköts automatiskt — ${r.streak} godkända i rad${typeof r.cap_kr === 'number' ? `, upp till ${krText(r.cap_kr)}` : ''}.`,
  }))
}

/**
 * De fyra sektionerna → en ordnad lista av repliker, en agent i taget.
 * Samma resultat/lärdomar/risker/förtroende-ordning som mandagsmoteSectionOrder.
 * Förtroende kan ge FLERA repliker (en per rad, varje rad har sin egen
 * riktiga agent) — övriga sektioner ger högst en replik var, oavsett hur
 * många rader de bär (en sammanhängande mening, inte en per rad).
 */
export function byggVeckomoteRepliker(payload: {
  resultat: MandagskortResultatRad[] | null
  lardomar: MandagskortLardomar | null
  risker: MandagskortRiskRad[] | null
  fortroende: MandagskortFortroendeRad[] | null
}): VeckomoteReplik[] {
  const repliker: VeckomoteReplik[] = []
  if (payload.resultat && payload.resultat.length > 0) {
    repliker.push({ agentId: 'matte', text: resultatReplik(payload.resultat) })
  }
  if (payload.lardomar) {
    repliker.push({ agentId: 'daniel', text: lardomarReplik(payload.lardomar) })
  }
  if (payload.risker && payload.risker.length > 0) {
    repliker.push({ agentId: 'karin', text: riskerReplik(payload.risker) })
  }
  if (payload.fortroende && payload.fortroende.length > 0) {
    repliker.push(...fortroendeRepliker(payload.fortroende))
  }
  return repliker
}
