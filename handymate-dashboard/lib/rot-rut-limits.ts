import { getServerSupabase } from '@/lib/supabase'

/**
 * ROT/RUT årstak enligt Skatteverket:
 * ROT: 30% avdrag på arbetskostnad, max 50 000 kr/person/år
 * RUT: 50% avdrag på arbetskostnad, max 75 000 kr/person/år
 *
 * Totalt ROT+RUT-tak: 75 000 kr/person/år
 */

export const ROT_RATE = 0.30
export const RUT_RATE = 0.50
export const ROT_MAX_PER_YEAR = 50_000
export const RUT_MAX_PER_YEAR = 75_000
export const TOTAL_MAX_PER_YEAR = 75_000 // Gemensamt tak för ROT+RUT

interface RotRutUsage {
  rot_used: number
  rut_used: number
  total_used: number
  rot_remaining: number
  rut_remaining: number
  total_remaining: number
  year: number
}

interface RotRutValidation {
  allowed: boolean
  requested_deduction: number
  max_allowed_deduction: number
  warning?: string
  usage: RotRutUsage
}

/**
 * Hämta hur mycket ROT/RUT en kund redan har utnyttjat i år
 * baserat på skickade/betalda fakturor
 */
export async function getCustomerRotRutUsage(
  customerId: string,
  businessId: string,
  year?: number
): Promise<RotRutUsage> {
  const supabase = getServerSupabase()
  const currentYear = year || new Date().getFullYear()

  const { data: invoices } = await supabase
    .from('invoice')
    .select('rot_rut_type, rot_rut_deduction, status, is_credit_note')
    .eq('customer_id', customerId)
    .eq('business_id', businessId)
    .in('status', ['sent', 'paid', 'overdue'])
    .gte('invoice_date', `${currentYear}-01-01`)
    .lte('invoice_date', `${currentYear}-12-31`)

  let rotUsed = 0
  let rutUsed = 0

  for (const inv of invoices || []) {
    const deduction = Math.abs(inv.rot_rut_deduction || 0)
    // Kreditfakturor minskar utnyttjat belopp
    const sign = inv.is_credit_note ? -1 : 1

    if (inv.rot_rut_type === 'rot') {
      rotUsed += deduction * sign
    } else if (inv.rot_rut_type === 'rut') {
      rutUsed += deduction * sign
    }
  }

  // Klipp till 0 (kan inte vara negativt)
  rotUsed = Math.max(0, rotUsed)
  rutUsed = Math.max(0, rutUsed)
  const totalUsed = rotUsed + rutUsed

  return {
    rot_used: Math.round(rotUsed),
    rut_used: Math.round(rutUsed),
    total_used: Math.round(totalUsed),
    rot_remaining: Math.max(0, Math.round(ROT_MAX_PER_YEAR - rotUsed)),
    rut_remaining: Math.max(0, Math.round(RUT_MAX_PER_YEAR - rutUsed)),
    total_remaining: Math.max(0, Math.round(TOTAL_MAX_PER_YEAR - totalUsed)),
    year: currentYear,
  }
}

/**
 * Validera om ett ROT/RUT-avdrag är tillåtet och beräkna max tillåtet belopp
 */
export async function validateRotRutDeduction(
  customerId: string,
  businessId: string,
  type: 'rot' | 'rut',
  laborCost: number,
  excludeInvoiceId?: string
): Promise<RotRutValidation> {
  const usage = await getCustomerRotRutUsage(customerId, businessId)

  // Beräkna begärt avdrag
  const rate = type === 'rot' ? ROT_RATE : RUT_RATE
  const requestedDeduction = Math.round(laborCost * rate * 100) / 100

  // Bestäm max tillåtet utifrån årstaket
  const typeMax = type === 'rot' ? ROT_MAX_PER_YEAR : RUT_MAX_PER_YEAR
  const typeUsed = type === 'rot' ? usage.rot_used : usage.rut_used
  const typeRemaining = Math.max(0, typeMax - typeUsed)

  // Gemensamt tak
  const totalRemaining = usage.total_remaining

  // Ta det lägsta av typ-tak och totalt tak
  const maxAllowed = Math.min(typeRemaining, totalRemaining)

  // Om begärt avdrag överskrider max
  if (requestedDeduction > maxAllowed) {
    return {
      allowed: maxAllowed > 0,
      requested_deduction: requestedDeduction,
      max_allowed_deduction: maxAllowed,
      warning: maxAllowed <= 0
        ? `Kunden har redan utnyttjat hela sitt ${type.toUpperCase()}-avdrag för ${usage.year} (${typeUsed.toLocaleString('sv-SE')} kr av ${typeMax.toLocaleString('sv-SE')} kr).`
        : `Begärt avdrag ${requestedDeduction.toLocaleString('sv-SE')} kr överskrider kundens återstående ${type.toUpperCase()}-utrymme på ${maxAllowed.toLocaleString('sv-SE')} kr. Avdraget begränsas till ${maxAllowed.toLocaleString('sv-SE')} kr.`,
      usage,
    }
  }

  return {
    allowed: true,
    requested_deduction: requestedDeduction,
    max_allowed_deduction: requestedDeduction,
    usage,
  }
}

/**
 * Beräkna ROT/RUT-avdrag med hänsyn till årstak
 * Returnerar det faktiska avdraget (kan vara lägre än begärt)
 */
export async function calculateCappedDeduction(
  customerId: string,
  businessId: string,
  type: 'rot' | 'rut',
  laborCost: number
): Promise<{ deduction: number; capped: boolean; warning?: string }> {
  const validation = await validateRotRutDeduction(customerId, businessId, type, laborCost)

  if (validation.requested_deduction <= validation.max_allowed_deduction) {
    return { deduction: validation.requested_deduction, capped: false }
  }

  return {
    deduction: validation.max_allowed_deduction,
    capped: true,
    warning: validation.warning,
  }
}
