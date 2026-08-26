/**
 * Klassificerar en Fortnox-fakturas betalläge (2026-08-26). Ren funktion.
 *
 * Kärnfelet som detta löser: sync-payments såg bara `FullyPaid || Balance<=0`
 * som betald och allt annat efter förfallodagen som förfallet. På en ROT/RUT-
 * faktura där kunden betalat SIN del står Fortnox Balance kvar > 0 (=
 * skattereduktionen som Skatteverket ska betala) → fakturan blev "förfallen",
 * påminnelsetrappan jagade kunden för Skatteverkets pengar, och fakturan
 * blev aldrig ROT-berättigad.
 *
 * Stegen, i ordning (första träff vinner):
 *   1. Cancelled                          → 'cancelled'  (en makulerad har Balance 0 — måste prövas FÖRST)
 *   2. FullyPaid || Balance ≤ 0           → 'paid'       (även slutreglering från customer_paid)
 *   3. lokal status redan customer_paid   → 'unchanged'  (aldrig nedgradera till overdue)
 *   4. ROT/RUT och Balance > 0, och minst EN av två oberoende signaler:
 *        a) Total − Balance ≥ kundens andel − 1 kr   (andel = TotalToPay, annars lokal getCustomerShare)
 *        b) Balance ≤ TaxReduction + 1 kr
 *                                          → 'customer_paid'
 *   5. DueDate < idag                     → 'overdue'
 *   6. annars                             → 'unchanged'
 *
 * FLAGGAT ANTAGANDE (Pass 3/I2, kräver riktigt Fortnox-konto): att Fortnox
 * Balance på en husarbetesfaktura startar på hela Total och står kvar på
 * TaxReduction efter kundens betalning (kundreskontran bokför hela fordran,
 * ROT-delen på "delad faktura"). Om Balance i stället skulle starta på
 * kundens andel kan steg 4 ge falskt customer_paid för fakturor där
 * skattereduktionen är ≥ kundens andel (t.ex. RUT 50 % utan material).
 * Logga hela GET /invoices/{n}-svaret en gång i Pass 3 och justera.
 */

import { getCustomerShare, hasTaxReduction, type CustomerShareInput } from '@/lib/invoices/customer-share'

export type FortnoxPaymentClass = 'cancelled' | 'paid' | 'customer_paid' | 'overdue' | 'unchanged'

export interface FortnoxPaymentSnapshot {
  Cancelled?: boolean
  FullyPaid?: boolean
  Balance?: number
  Total?: number
  TotalToPay?: number
  TaxReduction?: number
  DueDate?: string
}

export interface LocalInvoiceForClassify extends CustomerShareInput {
  status?: string | null
}

const TOLERANCE_KR = 1

export function classifyFortnoxPayment(
  fn: FortnoxPaymentSnapshot,
  local: LocalInvoiceForClassify,
  todayStr: string,
): FortnoxPaymentClass {
  if (fn.Cancelled === true) return 'cancelled'

  const balance = typeof fn.Balance === 'number' ? fn.Balance : null
  if (fn.FullyPaid === true || (balance !== null && balance <= 0)) return 'paid'

  if (local.status === 'customer_paid') return 'unchanged'

  if (hasTaxReduction(local) && balance !== null && balance > 0) {
    const total = typeof fn.Total === 'number' && fn.Total > 0 ? fn.Total : Number(local.total ?? 0)
    const share = typeof fn.TotalToPay === 'number' && fn.TotalToPay > 0
      ? fn.TotalToPay
      : getCustomerShare(local)
    const isSplit = share > 0 && total - share > TOLERANCE_KR

    if (isSplit) {
      const paidSoFar = total - balance
      const byPaidShare = paidSoFar >= share - TOLERANCE_KR
      const byRemaining = typeof fn.TaxReduction === 'number' && fn.TaxReduction > 0
        && balance <= fn.TaxReduction + TOLERANCE_KR
      if (byPaidShare || byRemaining) return 'customer_paid'
    }
  }

  if (fn.DueDate && fn.DueDate < todayStr) return 'overdue'
  return 'unchanged'
}

/**
 * Hur mycket kunden bevisligen betalat enligt Fortnox (Total − Balance),
 * eller null om Fortnox inte skickade Total. Callern faller då tillbaka på
 * lokal kundandel.
 */
export function paidSoFarFromFortnox(fn: FortnoxPaymentSnapshot): number | null {
  if (typeof fn.Total !== 'number' || typeof fn.Balance !== 'number') return null
  return Math.max(0, fn.Total - fn.Balance)
}
