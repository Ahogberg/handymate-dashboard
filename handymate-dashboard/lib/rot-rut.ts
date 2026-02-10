/**
 * ROT/RUT-beräkningar och validering
 * ROT: 30% avdrag på arbetskostnad, max 50 000 kr/person/år
 * RUT: 50% avdrag på arbetskostnad, max 75 000 kr/person/år
 */

export const ROT_RATE = 0.30
export const RUT_RATE = 0.50
export const ROT_MAX_PER_PERSON = 50000
export const RUT_MAX_PER_PERSON = 75000

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
  totalInclVat?: number
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

  const rate = type === 'rot' ? ROT_RATE : RUT_RATE
  const maxPerPerson = type === 'rot' ? ROT_MAX_PER_PERSON : RUT_MAX_PER_PERSON
  const eligible = laborTotal
  const deduction = Math.min(eligible * rate, maxPerPerson)
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
export function getRotRutLabel(type: RotRutType): string {
  switch (type) {
    case 'rot': return 'ROT-avdrag 30%'
    case 'rut': return 'RUT-avdrag 50%'
    default: return ''
  }
}
