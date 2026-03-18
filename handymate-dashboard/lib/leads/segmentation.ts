/**
 * Segmentering per yrkeskategori — bestämmer vilka fastigheter
 * som är relevanta för respektive hantverkstyp.
 */

export interface LeadSegment {
  label: string
  builtYearRange: [number, number] | null
  energyClasses: string[] | null
  recentPurchase: boolean
  purchaseDays: number
  propertyTypes: string[]
  letterAngle: string
}

export const LEAD_SEGMENTS: Record<string, LeadSegment> = {
  el: {
    label: 'Elektriker',
    builtYearRange: [1960, 1985],
    energyClasses: ['D', 'E', 'F', 'G'],
    recentPurchase: true,
    purchaseDays: 90,
    propertyTypes: ['villa', 'radhus'],
    letterAngle: 'Äldre elinstallationer kan vara en säkerhetsrisk — boka en kostnadsfri besiktning',
  },
  vvs: {
    label: 'VVS/Rörmokare',
    builtYearRange: [1900, 1975],
    energyClasses: ['E', 'F', 'G'],
    recentPurchase: true,
    purchaseDays: 90,
    propertyTypes: ['villa', 'radhus'],
    letterAngle: 'Sänk din energikostnad med modern VVS',
  },
  malare: {
    label: 'Målare',
    builtYearRange: [1970, 1990],
    energyClasses: null,
    recentPurchase: true,
    purchaseDays: 90,
    propertyTypes: ['villa', 'radhus', 'bostadsrätt'],
    letterAngle: 'Grattis till nya hemmet — vi hjälper dig sätta din personliga prägel',
  },
  bygg: {
    label: 'Bygg/Snickare',
    builtYearRange: [1900, 1980],
    energyClasses: ['E', 'F', 'G'],
    recentPurchase: true,
    purchaseDays: 90,
    propertyTypes: ['villa', 'radhus'],
    letterAngle: 'Vi såg att bygglov beviljats i ditt område — vi kan hjälpa med allt från grund till tak',
  },
  tak: {
    label: 'Plåtslagare/Tak',
    builtYearRange: [1900, 1970],
    energyClasses: ['D', 'E', 'F', 'G'],
    recentPurchase: true,
    purchaseDays: 90,
    propertyTypes: ['villa', 'radhus'],
    letterAngle: 'Ett välskött tak skyddar hela ditt hem — boka en kostnadsfri takinspektering',
  },
  golv: {
    label: 'Golvläggare',
    builtYearRange: [1960, 1980],
    energyClasses: null,
    recentPurchase: true,
    purchaseDays: 90,
    propertyTypes: ['villa', 'radhus', 'bostadsrätt'],
    letterAngle: 'Nytt hem, nya golv — vi erbjuder kostnadsfri mätning och offert',
  },
  fasad: {
    label: 'Fasadarbeten/Puts',
    builtYearRange: [1960, 1975],
    energyClasses: ['E', 'F', 'G'],
    recentPurchase: false,
    purchaseDays: 90,
    propertyTypes: ['villa', 'radhus'],
    letterAngle: 'En renoverad fasad ökar husets värde med upp till 15%',
  },
  tradgard: {
    label: 'Trädgård/Mark',
    builtYearRange: null,
    energyClasses: null,
    recentPurchase: true,
    purchaseDays: 90,
    propertyTypes: ['villa'],
    letterAngle: 'Välkommen till ditt nya hem — vi hjälper dig forma drömträdgården',
  },
  allman: {
    label: 'Allmän hantverkare',
    builtYearRange: [1900, 1980],
    energyClasses: null,
    recentPurchase: true,
    purchaseDays: 90,
    propertyTypes: ['villa', 'radhus'],
    letterAngle: 'Vi är din lokala hantverkare — inga jobb för stora eller små',
  },
}

/** Hämta segment baserat på branch (business_config.branch) */
export function getSegmentForBranch(branch: string | null): LeadSegment {
  if (!branch) return LEAD_SEGMENTS.allman
  const key = branch.toLowerCase().replace(/[^a-zåäö]/g, '')
  // Try exact match first
  if (LEAD_SEGMENTS[key]) return LEAD_SEGMENTS[key]
  // Fuzzy match
  if (key.includes('elekt') || key.includes('el')) return LEAD_SEGMENTS.el
  if (key.includes('vvs') || key.includes('rör')) return LEAD_SEGMENTS.vvs
  if (key.includes('mål') || key.includes('malar')) return LEAD_SEGMENTS.malare
  if (key.includes('bygg') || key.includes('snick')) return LEAD_SEGMENTS.bygg
  if (key.includes('tak') || key.includes('plåt')) return LEAD_SEGMENTS.tak
  if (key.includes('golv')) return LEAD_SEGMENTS.golv
  if (key.includes('fasad') || key.includes('puts')) return LEAD_SEGMENTS.fasad
  if (key.includes('träd') || key.includes('mark')) return LEAD_SEGMENTS.tradgard
  return LEAD_SEGMENTS.allman
}
