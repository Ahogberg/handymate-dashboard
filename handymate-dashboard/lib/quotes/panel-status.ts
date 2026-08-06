/**
 * Status per panel i offertskaparens "Mer"-rad.
 *
 * Bakgrund (pilotfeedback 2026-08-06): Christoffer om offertskaparen — "för
 * mycket, rörigt, man får inte med allt". Kartläggningen visade varför det
 * sista är strukturellt sant: SJU av fjorton offertfält bor enbart bakom
 * Mer-raden, och knapparna ser exakt likadana ut oavsett om panelen är ifylld,
 * tom eller behöver åtgärdas. Man måste öppna var och en för att veta.
 *
 * Den här funktionen gör tillståndet synligt utan att öppna något:
 *   'filled'    — något är ifyllt (visas som teal prick, ibland med antal)
 *   'attention' — något BEHÖVS men saknas (amber prick)
 *   'empty'     — inget ifyllt, och det är okej
 *
 * 'attention' används sparsamt och bara där det finns ett verkligt fel:
 * ROT valt men personnummer saknas (Skatteverket kräver det), och en betalplan
 * som inte summerar till totalen. Att färga allt tomt som en varning hade gjort
 * raden till en vägg av amber och lärt hantverkaren att ignorera den.
 *
 * Ren funktion — facit-testad i tests/panel-status.spec.ts.
 */

export type PanelKey = 'stil' | 'villkor' | 'betalplan' | 'visning' | 'bilagor' | 'rot'
export type PanelState = 'filled' | 'empty' | 'attention'

export interface PanelStatusInput {
  /** Villkor & texter */
  notIncluded?: string | null
  termsText?: string | null
  ataTerms?: string | null
  paymentTermsText?: string | null
  referencePerson?: string | null
  customerReference?: string | null
  projectAddress?: string | null

  /** Betalplan */
  paymentPlanCount?: number
  paymentPlanValid?: boolean

  /** Visning — avviker den från standard (full detalj)? */
  detailLevel?: string | null
  showUnitPrices?: boolean
  showQuantities?: boolean

  /** Bilagor */
  attachmentCount?: number

  /** Stil — null betyder "företagets standard" */
  templateStyle?: string | null

  /** ROT-detaljer */
  hasRotItems?: boolean
  hasRutItems?: boolean
  personnummer?: string | null
  fastighetsbeteckning?: string | null
}

export interface PanelStatusEntry {
  state: PanelState
  /** Kort tillägg i knappen, t.ex. antal bilagor eller vald stil. */
  hint?: string
}

const hasText = (value: string | null | undefined): boolean => !!(value && value.trim().length > 0)

const STYLE_LABELS: Record<string, string> = {
  modern: 'Modern',
  premium: 'Premium',
  friendly: 'Personlig',
}

export function panelStatus(input: PanelStatusInput): Record<PanelKey, PanelStatusEntry> {
  // ── Villkor & texter ──────────────────────────────────────────────
  const villkorFields = [
    input.notIncluded,
    input.termsText,
    input.ataTerms,
    input.paymentTermsText,
    input.referencePerson,
    input.customerReference,
    input.projectAddress,
  ]
  const villkorCount = villkorFields.filter(hasText).length

  // ── Betalplan ─────────────────────────────────────────────────────
  const planCount = input.paymentPlanCount ?? 0
  let betalplan: PanelStatusEntry
  if (planCount === 0) {
    betalplan = { state: 'empty' }
  } else if (input.paymentPlanValid === false) {
    // En delbetalningsplan som inte går ihop skickas aldrig — det är ett fel
    // hantverkaren måste se innan han trycker Skicka.
    betalplan = { state: 'attention', hint: 'går inte ihop' }
  } else {
    betalplan = { state: 'filled', hint: `${planCount} delar` }
  }

  // ── Visning ───────────────────────────────────────────────────────
  // Standard är full detalj: detaljnivå 'detailed' med både antal och à-pris.
  const isDefaultDisplay =
    (input.detailLevel ?? 'detailed') === 'detailed' &&
    input.showUnitPrices !== false &&
    input.showQuantities !== false

  // ── Bilagor ───────────────────────────────────────────────────────
  const attachments = input.attachmentCount ?? 0

  // ── ROT-detaljer ──────────────────────────────────────────────────
  // Personnumret krävs för att avdraget ska kunna begäras. Saknas det när ROT
  // är valt skickas en offert som lovar ett avdrag som inte går att få.
  let rot: PanelStatusEntry
  if (input.hasRotItems && !hasText(input.personnummer)) {
    rot = { state: 'attention', hint: 'personnummer saknas' }
  } else if (input.hasRotItems || input.hasRutItems) {
    rot = { state: 'filled' }
  } else if (hasText(input.personnummer) || hasText(input.fastighetsbeteckning)) {
    rot = { state: 'filled' }
  } else {
    rot = { state: 'empty' }
  }

  return {
    stil: input.templateStyle
      ? { state: 'filled', hint: STYLE_LABELS[input.templateStyle] || input.templateStyle }
      : { state: 'empty' },
    villkor: villkorCount > 0 ? { state: 'filled', hint: `${villkorCount}` } : { state: 'empty' },
    betalplan,
    visning: isDefaultDisplay ? { state: 'empty' } : { state: 'filled' },
    bilagor: attachments > 0 ? { state: 'filled', hint: `${attachments}` } : { state: 'empty' },
    rot,
  }
}

/** Antal paneler som kräver åtgärd — driver den samlade varningen. */
export function attentionCount(status: Record<PanelKey, PanelStatusEntry>): number {
  return Object.values(status).filter(entry => entry.state === 'attention').length
}
