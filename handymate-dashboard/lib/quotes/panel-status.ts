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
 *
 * Rivning paket B (2026-09-17, rad 2.3–2.6, 2.10): "stil", "villkor" och
 * "rot" bar tre av Mer-radens sex paneler. Alla tre är borttagna som egna
 * paneler (stil → firmadefault i inställningar, villkor → dokumentets egna
 * textfält, rot → avdragsväxeln vid dokumentets summering) — kvar är bara
 * de tre paneler som fortfarande är egna ytor.
 */

export type PanelKey = 'betalplan' | 'visning' | 'bilagor'
export type PanelState = 'filled' | 'empty' | 'attention'

export interface PanelStatusInput {
  /** Betalplan */
  paymentPlanCount?: number
  paymentPlanValid?: boolean

  /** Visning — avviker den från standard (full detalj)? */
  detailLevel?: string | null
  showUnitPrices?: boolean
  showQuantities?: boolean

  /** Bilagor */
  attachmentCount?: number
}

export interface PanelStatusEntry {
  state: PanelState
  /** Kort tillägg i knappen, t.ex. antal bilagor eller vald stil. */
  hint?: string
}

export function panelStatus(input: PanelStatusInput): Record<PanelKey, PanelStatusEntry> {
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

  return {
    betalplan,
    visning: isDefaultDisplay ? { state: 'empty' } : { state: 'filled' },
    bilagor: attachments > 0 ? { state: 'filled', hint: `${attachments}` } : { state: 'empty' },
  }
}

/** Antal paneler som kräver åtgärd — driver den samlade varningen. */
export function attentionCount(status: Record<PanelKey, PanelStatusEntry>): number {
  return Object.values(status).filter(entry => entry.state === 'attention').length
}
