/**
 * Skatteverket ROT/RUT — arbetskategorier enligt schema v6.
 *
 * Elementnamnen MÅSTE matcha XSD:n exakt (bekräftat mot
 * http://xmls.skatteverket.se/se/skatteverket/ht/komponent/V6/BegaranCOMPONENT.xsd
 * + exempelfilerna exempel_rot_3st.xml / exempel_rut_3st.xml). Varje kategori
 * blir ett element under <UtfortArbete> med <AntalTimmar> (valfri) +
 * <Materialkostnad> (obligatorisk). RUT-schablonkategorier använder <Utfort>
 * (boolean) i stället för timmar.
 */

export type RotRutType = 'rot' | 'rut'

export interface SkvCategory {
  /** Exakt XSD-elementnamn (ns2). Får INTE ändras. */
  code: string
  /** Svensk etikett för UI. */
  label: string
  type: RotRutType
  /** RUT-schablonarbete: <Utfort> boolean i stället för <AntalTimmar>. */
  schablon?: boolean
}

// ── ROT-kategorier (schema v6) ──────────────────────────────────────────
export const ROT_CATEGORIES: SkvCategory[] = [
  { code: 'Bygg', label: 'Bygg – reparation, om- och tillbyggnad', type: 'rot' },
  { code: 'El', label: 'El', type: 'rot' },
  { code: 'GlasPlatarbete', label: 'Glas- och plåtarbete', type: 'rot' },
  { code: 'MarkDraneringarbete', label: 'Mark- och dräneringsarbete', type: 'rot' },
  { code: 'Murning', label: 'Murning och sotning', type: 'rot' },
  { code: 'MalningTapetsering', label: 'Målning och tapetsering', type: 'rot' },
  { code: 'Vvs', label: 'VVS', type: 'rot' },
]

// ── RUT-kategorier (schema v6) ──────────────────────────────────────────
export const RUT_CATEGORIES: SkvCategory[] = [
  { code: 'Stadning', label: 'Städning', type: 'rut' },
  { code: 'KladOchTextilvard', label: 'Kläd- och textilvård', type: 'rut' },
  { code: 'Snoskottning', label: 'Snöskottning', type: 'rut' },
  { code: 'Tradgardsarbete', label: 'Trädgårdsarbete', type: 'rut' },
  { code: 'Barnpassning', label: 'Barnpassning', type: 'rut' },
  { code: 'Personligomsorg', label: 'Personlig omsorg', type: 'rut' },
  { code: 'Flyttjanster', label: 'Flyttjänster', type: 'rut' },
  { code: 'ItTjanster', label: 'IT-tjänster', type: 'rut' },
  { code: 'ReparationAvVitvaror', label: 'Reparation av vitvaror', type: 'rut' },
  { code: 'Moblering', label: 'Möblering', type: 'rut' },
  { code: 'TillsynAvBostad', label: 'Tillsyn av bostad', type: 'rut' },
  { code: 'TransportTillForsaljning', label: 'Transport till försäljning', type: 'rut', schablon: true },
  { code: 'TvattVidTvattinrattning', label: 'Tvätt vid tvättinrättning', type: 'rut', schablon: true },
]

export const ALL_CATEGORIES: SkvCategory[] = [...ROT_CATEGORIES, ...RUT_CATEGORIES]

export function categoriesForType(type: RotRutType): SkvCategory[] {
  return type === 'rot' ? ROT_CATEGORIES : RUT_CATEGORIES
}

export function getCategory(code: string | null | undefined): SkvCategory | undefined {
  if (!code) return undefined
  return ALL_CATEGORIES.find(c => c.code === code)
}

/**
 * Default-kategori per bransch (business_config.industry / branch-nyckel).
 * Bara ett förslag — hantverkaren kan alltid override:a per faktura, och
 * kategorin måste matcha fakturans rot_rut_type (annars valideringsfel).
 */
export const INDUSTRY_TO_CATEGORY: Record<string, string> = {
  electrician: 'El',
  plumber: 'Vvs',
  hvac: 'Vvs',
  carpenter: 'Bygg',
  construction: 'Bygg',
  locksmith: 'Bygg',
  roofing: 'GlasPlatarbete',
  flooring: 'Bygg',
  painter: 'MalningTapetsering',
  gardening: 'Tradgardsarbete', // RUT
  cleaning: 'Stadning',          // RUT
  moving: 'Flyttjanster',        // RUT
  other: 'Bygg',
}

export function defaultCategoryForIndustry(industry: string | null | undefined): string | null {
  if (!industry) return null
  return INDUSTRY_TO_CATEGORY[industry.toLowerCase()] || null
}
