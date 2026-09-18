/**
 * ROT/RUT-beräkningar och validering.
 *
 * Satserna och taken bor i lib/rot/regler.ts som DATERAD regel — den här
 * filen räknar bara. Varje funktion tar ett valfritt `datum`; utan datum
 * gäller dagens regel (bästa kända datum, se regler.ts om vilket datum som
 * egentligen styr: betalningsdatumet).
 */

import { regelFor } from '@/lib/rot/regler'

/**
 * Skatteverkets regel (verifierad 2026-07-30 mot skatteverket.se):
 * avdraget är X % av arbetskostnaden INKLUSIVE moms, efter rabatt.
 * Motorernas arbetskostnader är exkl moms → grossa upp med momsfaktorn
 * och skala med rabattfaktorn INNAN procentsatsen och taket appliceras.
 */
export function rotRutDeductionInclVat(
  type: 'rot' | 'rut',
  workCostExVat: number,
  opts: { vatRate?: number; discountFactor?: number; datum?: Date | string } = {}
): number {
  if (workCostExVat <= 0) return 0
  const regel = regelFor(opts.datum)
  const vatFactor = 1 + (opts.vatRate ?? 25) / 100
  const factor = Math.max(0, Math.min(1, opts.discountFactor ?? 1))
  const rate = type === 'rot' ? regel.rot_andel : regel.rut_andel
  const cap = type === 'rot' ? regel.rot_tak : regel.rut_tak
  return Math.min(workCostExVat * factor * vatFactor * rate, cap)
}

export function gronTeknikDeductionInclVat(
  rawDeductionExVat: number,
  opts: { vatRate?: number; discountFactor?: number; datum?: Date | string } = {}
): number {
  if (rawDeductionExVat <= 0) return 0
  const vatFactor = 1 + (opts.vatRate ?? 25) / 100
  const factor = Math.max(0, Math.min(1, opts.discountFactor ?? 1))
  return Math.min(rawDeductionExVat * factor * vatFactor, regelFor(opts.datum).gron_teknik_tak)
}

export type RotRutType = 'rot' | 'rut' | ''

export interface RotRutResult {
  laborTotal: number
  eligible: number
  rate: number
  deduction: number
  customerPays: number
  maxPerPerson: number
}

export interface QuoteItem {
  type: 'labor' | 'material' | 'service'
  total: number
}

/**
 * Beräkna ROT/RUT-avdrag
 */
export function calculateRotRut(
  items: QuoteItem[],
  type: RotRutType,
  totalInclVat?: number,
  datum?: Date | string
): RotRutResult {
  const laborTotal = items
    .filter(i => i.type === 'labor')
    .reduce((sum, i) => sum + i.total, 0)

  if (!type) {
    return {
      laborTotal,
      eligible: 0,
      rate: 0,
      deduction: 0,
      customerPays: totalInclVat || 0,
      maxPerPerson: 0,
    }
  }

  const regel = regelFor(datum)
  const rate = type === 'rot' ? regel.rot_andel : regel.rut_andel
  const maxPerPerson = type === 'rot' ? regel.rot_tak : regel.rut_tak
  const eligible = laborTotal
  const deduction = rotRutDeductionInclVat(type, eligible, { datum })
  const customerPays = (totalInclVat || 0) - deduction

  return {
    laborTotal,
    eligible,
    rate,
    deduction,
    customerPays,
    maxPerPerson,
  }
}

/**
 * Validera svenskt personnummer (YYYYMMDD-XXXX eller YYMMDD-XXXX)
 * Luhn-algoritm på de 10 sista siffrorna
 */
export function validatePersonnummer(nr: string): boolean {
  if (!nr) return false

  // Rensa bort bindestreck och mellanslag
  const cleaned = nr.replace(/[-\s]/g, '')

  // Acceptera 10 eller 12 siffror
  if (!/^\d{10}$/.test(cleaned) && !/^\d{12}$/.test(cleaned)) {
    return false
  }

  // Använd de sista 10 siffrorna för Luhn
  const digits = cleaned.length === 12 ? cleaned.substring(2) : cleaned

  // Luhn-kontroll
  let sum = 0
  for (let i = 0; i < 10; i++) {
    let d = parseInt(digits[i])
    if (i % 2 === 0) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }

  return sum % 10 === 0
}

/**
 * Formatera personnummer till YYYYMMDD-XXXX
 */
export function formatPersonnummer(nr: string): string {
  if (!nr) return ''
  const cleaned = nr.replace(/[-\s]/g, '')

  if (cleaned.length === 12) {
    return `${cleaned.substring(0, 8)}-${cleaned.substring(8)}`
  }

  if (cleaned.length === 10) {
    // Gissa århundrade
    const year = parseInt(cleaned.substring(0, 2))
    const century = year > 30 ? '19' : '20'
    return `${century}${cleaned.substring(0, 6)}-${cleaned.substring(6)}`
  }

  return nr
}

/**
 * Hämta label för ROT/RUT-typ
 */
export function getRotRutLabel(type: RotRutType, datum?: Date | string): string {
  const regel = regelFor(datum)
  switch (type) {
    case 'rot': return `ROT-avdrag ${Math.round(regel.rot_andel * 100)}%`
    case 'rut': return `RUT-avdrag ${Math.round(regel.rut_andel * 100)}%`
    default: return ''
  }
}
