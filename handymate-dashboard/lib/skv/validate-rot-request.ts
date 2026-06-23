/**
 * Skatteverket ROT/RUT — valideringslager.
 *
 * Speglar Skatteverkets regler så en hantverkare ALDRIG laddar upp en fil som
 * nekas. UI blockerar export om någon vald faktura har `errors`; API:t validerar
 * igen (auktoritativt). Ren funktion — årstaks-utnyttjandet skickas in som
 * `alreadyRequestedThisYearKr` (route hämtar via getCustomerRotRutUsage).
 */

import { validatePersonnummer } from '@/lib/rot-rut'
import { getCategory, type RotRutType } from './categories'

const ROT_MAX_PER_YEAR = 50000
const RUT_MAX_PER_YEAR = 75000

export interface SkvInvoiceLike {
  invoice_id: string
  invoice_number?: string | null
  status?: string | null
  paid_at?: string | null
  rot_rut_type?: string | null
  rot_work_cost?: number | null
  rut_work_cost?: number | null
  rot_deduction?: number | null
  rut_deduction?: number | null
  rot_hours?: number | null
  rot_work_category?: string | null
  rot_property_type?: string | null
  rot_property_designation?: string | null
  rot_brf_org_number?: string | null
  rot_apartment_number?: string | null
}

export interface SkvValidationInput {
  invoice: SkvInvoiceLike
  customerPersonalNumber?: string | null
  customerPropertyDesignation?: string | null
  businessOrgNumber?: string | null
  taxYear: number
  /** Summa redan begärt avdrag för kunden/typen detta skatteår (kr), exkl. denna faktura. */
  alreadyRequestedThisYearKr?: number
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  /** Normaliserade värden för XML-byggaren (satt endast när valid). */
  normalized?: {
    type: RotRutType
    personnummer12: string
    prisForArbete: number
    begartBelopp: number
    hours: number
    category: string
    fastighetsbeteckning?: string
    brfOrgNr?: string
    lagenhetsNr?: string
  }
}

/** Rensa personnummer till siffror. Returnerar 12-siffrigt om möjligt, annars råsiffror. */
export function cleanPersonnummer(pnr: string | null | undefined): string {
  return (pnr || '').replace(/\D/g, '')
}

/** Ålder vid ett givet datum, härlett ur 12-siffrigt personnummer (YYYYMMDD...). */
function ageAt(pnr12: string, atDate: Date): number | null {
  if (pnr12.length < 8) return null
  const y = Number(pnr12.slice(0, 4))
  const m = Number(pnr12.slice(4, 6))
  const d = Number(pnr12.slice(6, 8))
  if (!y || !m || !d) return null
  let age = atDate.getFullYear() - y
  const beforeBirthday = atDate.getMonth() + 1 < m || (atDate.getMonth() + 1 === m && atDate.getDate() < d)
  if (beforeBirthday) age--
  return age
}

export function validateInvoiceForSkv(input: SkvValidationInput): ValidationResult {
  const { invoice: inv, taxYear } = input
  const errors: string[] = []
  const warnings: string[] = []

  // 1. Typ
  const type = (inv.rot_rut_type === 'rot' || inv.rot_rut_type === 'rut') ? inv.rot_rut_type : null
  if (!type) errors.push('Saknar ROT/RUT-typ.')

  // 2. Betald + betalningsdatum
  if (inv.status !== 'paid') errors.push('Fakturan är inte betald (krävs innan begäran).')
  const paidAt = inv.paid_at ? new Date(inv.paid_at) : null
  if (!paidAt || isNaN(paidAt.getTime())) errors.push('Saknar betalningsdatum.')

  // 3. Köparens personnummer
  const rawPnr = cleanPersonnummer(input.customerPersonalNumber)
  if (!rawPnr) errors.push('Kundens personnummer saknas.')
  else if (rawPnr.length === 10) warnings.push('Personnummer är 10-siffrigt — fyll i 12 siffror (århundrade) före export.')
  else if (rawPnr.length !== 12) errors.push('Personnummer har fel format (kräver 12 siffror).')
  else if (!validatePersonnummer(rawPnr)) errors.push('Personnummer är ogiltigt (kontrollsiffra).')

  // 4. Utförarens org-nr
  const orgNr = cleanPersonnummer(input.businessOrgNumber)
  if (!orgNr) errors.push('Företagets organisationsnummer saknas (Inställningar → Företag).')

  // 5. Köpare ≠ utförare
  if (rawPnr && orgNr && rawPnr === orgNr) errors.push('Köpare och utförare får inte ha samma nummer.')

  // 6. ≥ 18 år vid betalning
  if (rawPnr.length === 12 && paidAt) {
    const age = ageAt(rawPnr, paidAt)
    if (age != null && age < 18) errors.push('Köparen måste vara minst 18 år vid betalningstillfället.')
  }

  // 7. Betalningsdatum ≤ idag + 12. samma skatteår
  if (paidAt && !isNaN(paidAt.getTime())) {
    if (paidAt.getTime() > Date.now()) errors.push('Betalningsdatum kan inte ligga i framtiden.')
    if (paidAt.getFullYear() !== taxYear) errors.push(`Betalningsdatum (${paidAt.getFullYear()}) matchar inte valt skatteår (${taxYear}).`)
  }

  // 8. Belopp
  const workCost = Math.round((type === 'rut' ? inv.rut_work_cost : inv.rot_work_cost) || 0)
  const deduction = Math.round((type === 'rut' ? inv.rut_deduction : inv.rot_deduction) || 0)
  if (workCost <= 0) errors.push('Arbetskostnad saknas eller är noll.')
  if (deduction <= 0) errors.push('Begärt avdrag saknas eller är noll.')
  if (deduction >= workCost) errors.push('Begärt avdrag kan inte vara större än eller lika med arbetskostnaden.')

  // 9. Årstak per person (inkl. tidigare begärt detta år)
  const max = type === 'rut' ? RUT_MAX_PER_YEAR : ROT_MAX_PER_YEAR
  const already = Math.round(input.alreadyRequestedThisYearKr || 0)
  if (deduction + already > max) {
    errors.push(`Begärt avdrag (${deduction} kr) + redan begärt (${already} kr) överskrider årstaket ${max} kr.`)
  }

  // 10. Kategori satt + matchar typ
  const category = inv.rot_work_category || ''
  const cat = getCategory(category)
  if (!category) errors.push('Arbetskategori saknas.')
  else if (!cat) errors.push(`Okänd arbetskategori: ${category}.`)
  else if (type && cat.type !== type) errors.push(`Kategorin "${cat.label}" är en ${cat.type.toUpperCase()}-kategori men fakturan är ${type.toUpperCase()}.`)

  // 11. Timmar
  const hours = Math.round(inv.rot_hours || 0)
  const isSchablon = cat?.schablon === true
  if (!isSchablon && hours <= 0) errors.push('Antal arbetade timmar saknas.')
  if (hours > 999) errors.push('Antal timmar överstiger maxgränsen (999).')

  // 12. Fastighet: småhus (fastighetsbeteckning) ELLER bostadsrätt (BRF-orgnr + lägenhetsnummer)
  let fastighetsbeteckning: string | undefined
  let brfOrgNr: string | undefined
  let lagenhetsNr: string | undefined
  if (type === 'rot') {
    const propType = inv.rot_property_type
    if (propType === 'bostadsratt') {
      brfOrgNr = cleanPersonnummer(inv.rot_brf_org_number) || undefined
      lagenhetsNr = (inv.rot_apartment_number || '').trim() || undefined
      if (!brfOrgNr) errors.push('Bostadsrätt: föreningens organisationsnummer saknas.')
      if (!lagenhetsNr) errors.push('Bostadsrätt: lägenhetsnummer saknas.')
      else if (!/^\d{4}$/.test(lagenhetsNr)) errors.push('Lägenhetsnummer måste vara 4 siffror.')
    } else {
      fastighetsbeteckning = (inv.rot_property_designation || input.customerPropertyDesignation || '').trim() || undefined
      if (!fastighetsbeteckning) errors.push('Fastighetsbeteckning saknas (krävs för ROT småhus).')
    }
  }

  const valid = errors.length === 0
  return {
    valid,
    errors,
    warnings,
    normalized: valid && type ? {
      type,
      personnummer12: rawPnr,
      prisForArbete: workCost,
      begartBelopp: deduction,
      hours,
      category,
      fastighetsbeteckning,
      brfOrgNr,
      lagenhetsNr,
    } : undefined,
  }
}
