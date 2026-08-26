/**
 * Betalbeslutet (2026-08-26). Ren funktion — inga DB-anrop.
 *
 * Givet fakturans nuvarande tillstånd och ett registrerat belopp: vilken
 * övergång är sann?
 *
 *   sent|overdue|draft ─(ROT/RUT, belopp < total)──► customer_paid   'to_customer_paid'
 *   sent|overdue|draft ─(ej ROT, eller hela beloppet)► paid           'to_paid'
 *   customer_paid      ─(rest ≥ återstående)────────► paid           'settled'
 *   customer_paid      ─(rest < återstående)────────► customer_paid  'none' (bara paid_amount räknas upp)
 *   paid               ───────────────────────────────► paid          'none' (already_settled)
 *
 * Belopp utelämnat = kundens andel (getCustomerShare). Så en ROT-faktura
 * som markeras betald utan belopp blir customer_paid — det är det ärliga
 * tillståndet: kunden är klar, Skatteverkets del väntar. Utan ROT blir
 * samma anrop paid precis som förr (Golden Path Station 9 oförändrad).
 *
 * Tolerans ±1 kr mot öresavrundning mellan Handymate och Fortnox.
 */

import { getCustomerShare, hasTaxReduction, type CustomerShareInput } from './customer-share'

export type PaymentTransition = 'to_paid' | 'to_customer_paid' | 'settled' | 'none'

export interface PaymentDecisionInput extends CustomerShareInput {
  status?: string | null
  /** Tidigare registrerat belopp (NULL för äldre rader = okänt). */
  paid_amount?: number | null
}

export interface PaymentDecision {
  transition: PaymentTransition
  /** Status efter övergången (oförändrad vid 'none'). */
  status: string
  /** Ackumulerat betalt belopp efter denna registrering. */
  paid_amount: number
  /** Vad som återstår att få från Skatteverket (0 när inget återstår). */
  remaining_rot_kr: number
  /** Fakturan var redan helt betald — inget att göra. */
  already_settled: boolean
}

const TOLERANCE_KR = 1

export function decidePaymentOutcome(inv: PaymentDecisionInput, amount?: number | null): PaymentDecision {
  const total = Number(inv.total ?? 0)
  const status = inv.status || 'sent'

  if (status === 'paid') {
    return {
      transition: 'none',
      status: 'paid',
      paid_amount: Number(inv.paid_amount ?? total),
      remaining_rot_kr: 0,
      already_settled: true,
    }
  }

  if (status === 'customer_paid') {
    const previouslyPaid = inv.paid_amount != null ? Number(inv.paid_amount) : getCustomerShare(inv)
    const remaining = Math.max(0, total - previouslyPaid)
    const add = amount != null ? Number(amount) : remaining
    const newPaid = previouslyPaid + add
    if (newPaid >= total - TOLERANCE_KR) {
      return { transition: 'settled', status: 'paid', paid_amount: newPaid, remaining_rot_kr: 0, already_settled: false }
    }
    return {
      transition: 'none',
      status: 'customer_paid',
      paid_amount: newPaid,
      remaining_rot_kr: Math.max(0, total - newPaid),
      already_settled: false,
    }
  }

  const share = getCustomerShare(inv)
  const paid = amount != null ? Number(amount) : share

  if (hasTaxReduction(inv) && paid < total - TOLERANCE_KR) {
    return {
      transition: 'to_customer_paid',
      status: 'customer_paid',
      paid_amount: paid,
      remaining_rot_kr: Math.max(0, total - paid),
      already_settled: false,
    }
  }

  return { transition: 'to_paid', status: 'paid', paid_amount: paid, remaining_rot_kr: 0, already_settled: false }
}
