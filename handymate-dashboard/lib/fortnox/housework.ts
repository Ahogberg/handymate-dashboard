/**
 * ROT/RUT i Fortnox-fakturan — REN mappning (2026-08-26).
 *
 * Fortnox v3 uttrycker husarbete så här (verifierat mot Fortnox egna
 * fältlistor 2026-08-26: Invoice.TaxReduction är ett READ-ONLY heltal som
 * Fortnox räknar fram; Invoice.HouseWork är en boolean):
 *
 *   Invoice.TaxReductionType     'ROT' | 'RUT' | 'GREEN'
 *   InvoiceRow.HouseWork         true på arbetsrader som ger skattereduktion
 *   InvoiceRow.HouseWorkType     typ av husarbete — måste sättas på VARJE rad
 *                                när fakturan har husarbete (även rader med
 *                                HouseWork=false), får inte blanda ROT/RUT
 *   InvoiceRow.HouseWorkHoursToReport  antal timmar att rapportera
 *
 * Köparens personnummer/fastighetsbeteckning skickas INTE på fakturan utan
 * via resursen /taxreductions (POST) som pekar på fakturans DocumentNumber
 * — det är den posten Fortnox skickar till Skatteverket.
 *
 * Tidigare skickade sync-to-fortnox ett påhittat `TaxReduction`-OBJEKT
 * ({ Type, PropertyType, TaxReductionAmount, AskerSocialSecurityNumber })
 * på fakturan — ett fält som inte finns i den formen. Aldrig observerat
 * eftersom Fortnox-vägen är licensblockerad (Pass 3/I2).
 *
 * Kategorikoderna här är Skatteverkets (lib/skv/categories.ts) — EN källa
 * för vad arbetet är; Fortnox HouseWorkType härleds ur den.
 */

import type { RotRutType } from '@/lib/skv/categories'

/** Skatteverkets kategorikod → Fortnox HouseWorkType. */
const HOUSEWORK_TYPE_BY_SKV_CATEGORY: Record<string, string> = {
  // ROT
  Bygg: 'CONSTRUCTION',
  El: 'ELECTRICITY',
  GlasPlatarbete: 'GLASSMETALWORK',
  MarkDraneringarbete: 'GROUNDDRAINAGEWORK',
  Murning: 'MASONRY',
  MalningTapetsering: 'PAINTINGWALLPAPERING',
  Vvs: 'HVAC',
  // RUT
  Stadning: 'CLEANING',
  KladOchTextilvard: 'TEXTILECLOTHING',
  Snoskottning: 'SNOWPLOWING',
  Tradgardsarbete: 'GARDENING',
  Barnpassning: 'BABYSITTING',
  Personligomsorg: 'OTHERCARE',
  Flyttjanster: 'MOVINGSERVICES',
  ItTjanster: 'ITSERVICES',
  ReparationAvVitvaror: 'MAJORAPPLIANCEREPAIR',
  Moblering: 'FURNISHING',
  TillsynAvBostad: 'HOMEMAINTENANCE',
  TransportTillForsaljning: 'TRANSPORTATIONSERVICES',
  TvattVidTvattinrattning: 'WASHINGANDCAREOFCLOTHING',
}

export function fortnoxHouseWorkType(skvCategory: string | null | undefined): string | null {
  if (!skvCategory) return null
  return HOUSEWORK_TYPE_BY_SKV_CATEGORY[skvCategory] ?? null
}

export function fortnoxTaxReductionType(rotRutType: string | null | undefined): 'ROT' | 'RUT' | null {
  const t = (rotRutType || '').toLowerCase()
  if (t === 'rot') return 'ROT'
  if (t === 'rut') return 'RUT'
  return null
}

export interface HouseWorkRowInput {
  quantity?: number | null
  unit?: string | null
  is_rot_eligible?: boolean | null
  is_rut_eligible?: boolean | null
  /** Äldre rader: 'labor' | 'material'. */
  type?: string | null
}

export interface HouseWorkRowFields {
  HouseWork: boolean
  HouseWorkType: string
  HouseWorkHoursToReport?: number
}

const HOUR_UNITS = new Set(['tim', 'h', 'timme', 'timmar', 'hour', 'hours', 'hr'])

/** Är raden arbete som ger skattereduktion? Flaggan på raden vinner; äldre
    rader utan flaggor räknas som arbete om type==='labor'. */
export function isHouseWorkRow(item: HouseWorkRowInput, type: RotRutType): boolean {
  if (type === 'rot' && typeof item.is_rot_eligible === 'boolean') return item.is_rot_eligible
  if (type === 'rut' && typeof item.is_rut_eligible === 'boolean') return item.is_rut_eligible
  return item.type === 'labor'
}

/**
 * Radfälten för husarbete. HouseWorkType sätts på ALLA rader (Fortnox-regeln);
 * timmar rapporteras bara på arbetsrader med timenhet.
 */
export function houseWorkRowFields(item: HouseWorkRowInput, type: RotRutType, houseWorkType: string): HouseWorkRowFields {
  const isWork = isHouseWorkRow(item, type)
  const fields: HouseWorkRowFields = { HouseWork: isWork, HouseWorkType: houseWorkType }
  if (isWork && HOUR_UNITS.has((item.unit || '').toLowerCase().trim())) {
    const hours = Math.round(Number(item.quantity ?? 0))
    if (hours > 0) fields.HouseWorkHoursToReport = hours
  }
  return fields
}

export interface TaxReductionRequestInput {
  documentNumber: string
  askedAmountKr: number
  customerName: string | null | undefined
  personalNumber: string
  /** Småhus: fastighetsbeteckning. */
  propertyDesignation?: string | null
  /** Bostadsrätt: BRF:ens org-nr + lägenhetsnummer. */
  brfOrgNumber?: string | null
  apartmentNumber?: string | null
}

/**
 * Payload för POST /taxreductions — Fortnox-posten som skickas till
 * Skatteverket. FLAGGAT (Pass 3/I2): fältnamnen följer Fortnox dokumentation
 * (AskedAmount, CustomerName, PropertyDesignation, ReferenceDocumentType,
 * ReferenceNumber, ResidenceAssociationOrganisationNumber, ApartmentNumber,
 * SocialSecurityNumber) — verifiera mot ett riktigt svar första gången.
 */
export function buildTaxReductionPayload(i: TaxReductionRequestInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ReferenceDocumentType: 'INVOICE',
    ReferenceNumber: i.documentNumber,
    AskedAmount: Math.round(i.askedAmountKr),
    CustomerName: i.customerName || undefined,
    SocialSecurityNumber: i.personalNumber.replace(/\D/g, ''),
  }
  if (i.brfOrgNumber) {
    payload.ResidenceAssociationOrganisationNumber = i.brfOrgNumber.replace(/\D/g, '')
    if (i.apartmentNumber) payload.ApartmentNumber = i.apartmentNumber
  } else if (i.propertyDesignation) {
    payload.PropertyDesignation = i.propertyDesignation
  }
  return payload
}
