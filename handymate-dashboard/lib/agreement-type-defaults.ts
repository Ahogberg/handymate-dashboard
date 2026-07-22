/**
 * Serviceavtal-katalogen v1 (Motor 2, Etapp 1, lager 1) — kuraterade
 * avtalstyper per bransch. Mönster: lib/quote-template-defaults.ts.
 *
 * price_items fryses in i service_agreement.price_items när ett avtal
 * tecknas från en katalogpost (snapshot-princip — ändras katalogposten
 * senare påverkas inte redan tecknade avtal). Radformen är medvetet kompatibel
 * med QuoteItem-formen (id/item_type/description/quantity/unit/unit_price/
 * total/is_rot_eligible/sort_order) så lib/agreements/invoice-visit.ts kan
 * kopiera raderna rakt in i invoice.items utan omformning.
 *
 * ROT-regel (Andreas direktiv 2026-07-22): SERVICE av en installation i
 * bostaden är ROT-berättigat (t.ex. värmepumpsservice, laddbox-service,
 * filterbyte) — ren BESIKTNING/KONTROLL/ÖVERSYN/GENOMGÅNG är det INTE
 * (inget fysiskt underhållsarbete utförs, bara en okulär/mätteknisk
 * bedömning). Konservativt vald per typ nedan utifrån namnet:
 *   - "kontroll"/"besiktning"/"översyn"/"genomgång" → ej ROT
 *   - "service"/"filterbyte"/"tvätt"/"underhåll"    → ROT
 * Granskaren (Fable) finjusterar vid granskning — värdena är konservativa
 * utgångspunkter, inte skatterättsligt slutgiltiga.
 *
 * Priser exkl. moms. Arbetsraden räknar branschens timpris (samma tal som
 * lib/quote-template-defaults.ts använder för respektive bransch: bygg 650,
 * el 750, VVS 750, måleri 550, allround 650) × en rimlig besökslängd (1–3 h).
 * Servicebil/framkörning (450 kr, ej ROT) läggs på som egen rad där ett
 * fysiskt besök krävs (alla typer i denna katalog).
 */

import { normalizeTemplateBranch } from '@/lib/quote-template-defaults'

export interface DefaultAgreementPriceItem {
  id: string
  item_type: 'item'
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  is_rot_eligible: boolean
  rot_rut_type: 'rot' | null
  sort_order: number
}

export interface DefaultAgreementType {
  name: string
  description: string
  interval_months: number
  visit_duration_min: number
  price_items: DefaultAgreementPriceItem[]
  match_keys: string[]
}

function genItemId(): string {
  return 'api_' + Math.random().toString(36).substr(2, 12)
}

/** Arbetsrad — is_rot_eligible/rot_rut_type styrs av `rot` (true = 'rot'). */
function laborLine(description: string, hours: number, hourlyRate: number, rot: boolean): DefaultAgreementPriceItem {
  return {
    id: genItemId(),
    item_type: 'item',
    description,
    quantity: hours,
    unit: 'tim',
    unit_price: hourlyRate,
    total: hours * hourlyRate,
    is_rot_eligible: rot,
    rot_rut_type: rot ? 'rot' : null,
    sort_order: 0,
  }
}

/** Servicebil/framkörning — aldrig ROT-berättigad (ingen arbetstid i bostaden). */
function servicebilLine(price = 450): DefaultAgreementPriceItem {
  return {
    id: genItemId(),
    item_type: 'item',
    description: 'Servicebil/framkörning',
    quantity: 1,
    unit: 'st',
    unit_price: price,
    total: price,
    is_rot_eligible: false,
    rot_rut_type: null,
    sort_order: 1,
  }
}

function finalize(items: DefaultAgreementPriceItem[]): DefaultAgreementPriceItem[] {
  return items.map((item, idx) => ({ ...item, sort_order: idx }))
}

// ─── Timpriser per bransch (samma tal som lib/quote-template-defaults.ts) ──
const HOURLY_RATE = {
  construction: 650,
  carpenter: 650,
  electrician: 750,
  plumber: 750,
  painter: 550,
  other: 650,
} as const

// ─── BYGG/SNICKERI (construction + carpenter) ──────────────────────────

function byggAgreementTypes(rate: number): DefaultAgreementType[] {
  return [
    {
      name: 'Våtrumskontroll',
      description: 'Årlig kontroll av tätskikt, fogar och golvbrunn i våtrum — upptäck fuktskador innan de blir dyra.',
      interval_months: 24,
      visit_duration_min: 90,
      price_items: finalize([laborLine('Kontroll av tätskikt, fogar och golvbrunn', 1.5, rate, false), servicebilLine()]),
      match_keys: ['badrum', 'våtrum', 'tätskikt', 'badrumrenovering'],
    },
    {
      name: 'Altanöversyn',
      description: 'Årlig översyn av altan/trädäck — kontroll av virke, infästningar och räcken.',
      interval_months: 12,
      visit_duration_min: 90,
      price_items: finalize([laborLine('Översyn av virke, infästningar och räcken', 1.5, rate, false), servicebilLine()]),
      match_keys: ['altan', 'trädäck', 'uteplats'],
    },
    {
      name: 'Takgenomgång',
      description: 'Regelbunden genomgång av taket — kontroll av tätskikt, hängrännor och skorsten.',
      interval_months: 36,
      visit_duration_min: 120,
      price_items: finalize([laborLine('Genomgång av tätskikt, hängrännor och skorsten', 2, rate, false), servicebilLine()]),
      match_keys: ['tak', 'takläggning', 'skorsten', 'hängränna'],
    },
  ]
}

// ─── EL (electrician) ───────────────────────────────────────────────────

function elAgreementTypes(rate: number): DefaultAgreementType[] {
  return [
    {
      name: 'Elbesiktning',
      description: 'Periodisk besiktning av elanläggningen med protokoll — enligt rekommenderat intervall.',
      interval_months: 36,
      visit_duration_min: 90,
      price_items: finalize([laborLine('Besiktning av elanläggning inkl. protokoll', 1.5, rate, false), servicebilLine()]),
      match_keys: ['elcentral', 'elinstallation', 'el', 'elbesiktning'],
    },
    {
      name: 'Laddbox-service',
      description: 'Årlig service av laddbox för elbil — funktionskontroll, åtdragning och mjukvaruuppdatering.',
      interval_months: 12,
      visit_duration_min: 60,
      price_items: finalize([laborLine('Service av laddbox: funktionskontroll och åtdragning', 1, rate, true), servicebilLine()]),
      match_keys: ['laddbox', 'elbil', 'laddpunkt'],
    },
    {
      name: 'Solcellsöversyn',
      description: 'Årlig översyn av solcellsanläggningen — kontroll av paneler, inverter och montage.',
      interval_months: 12,
      visit_duration_min: 90,
      price_items: finalize([laborLine('Översyn av paneler, inverter och montage', 1.5, rate, false), servicebilLine()]),
      match_keys: ['solceller', 'solpanel', 'solenergi', 'inverter'],
    },
  ]
}

// ─── VVS (plumber) ──────────────────────────────────────────────────────

function vvsAgreementTypes(rate: number): DefaultAgreementType[] {
  return [
    {
      name: 'Värmepumpsservice',
      description: 'Årlig service av värmepumpen — filterrengöring, funktionskontroll och köldmediekontroll. Krävs ofta för garantin.',
      interval_months: 12,
      visit_duration_min: 120,
      price_items: finalize([laborLine('Service: filterrengöring, funktionskontroll och köldmediekontroll', 2, rate, true), servicebilLine()]),
      match_keys: ['värmepump', 'bergvärme', 'luftvärme'],
    },
    {
      name: 'Vattenfelsbrytare-filterbyte',
      description: 'Årligt filterbyte i vattenfelsbrytaren — säkerställer att skyddet mot vattenskador fungerar.',
      interval_months: 12,
      visit_duration_min: 60,
      price_items: finalize([laborLine('Filterbyte och funktionstest av vattenfelsbrytare', 1, rate, true), servicebilLine()]),
      match_keys: ['vattenfelsbrytare', 'vattenfilter', 'läckagevarnare'],
    },
  ]
}

// ─── MÅLERI (painter) ────────────────────────────────────────────────────

function maleriAgreementTypes(rate: number): DefaultAgreementType[] {
  return [
    {
      name: 'Fasadtvätt',
      description: 'Regelbunden fasadtvätt — förlänger målningens livslängd och håller huset fräscht.',
      interval_months: 24,
      visit_duration_min: 180,
      // OBS: ren rengöring (alg-/fasadtvätt) är INTE ROT-berättigad enligt
      // Skatteverket — ROT kräver reparation/underhåll, tvätt räknas som
      // rengöring. (Målning av fasaden är ROT; tvätten ensam är det inte.)
      price_items: finalize([laborLine('Fasadtvätt', 3, rate, false), servicebilLine()]),
      match_keys: ['fasad', 'fasadmålning', 'fasadtvätt'],
    },
    {
      name: 'Fönsterunderhåll',
      description: 'Periodiskt underhåll av utvändiga fönster — bättring av kitt och färg innan fukt tränger in.',
      interval_months: 36,
      visit_duration_min: 120,
      price_items: finalize([laborLine('Underhåll: bättring av kitt och färg', 2, rate, true), servicebilLine()]),
      match_keys: ['fönster', 'fönsterrenovering', 'fönsterunderhåll'],
    },
  ]
}

// ─── ALLROUND (seedas till alla branscher) ─────────────────────────────

function allroundAgreementTypes(rate: number): DefaultAgreementType[] {
  return [
    {
      name: 'Årlig hantverksöversyn',
      description: 'En årlig genomgång av hemmet — vi tittar efter sådant som kan bli dyrt om det får stå för länge.',
      interval_months: 12,
      visit_duration_min: 90,
      price_items: finalize([laborLine('Allmän översyn av hemmet', 1.5, rate, false), servicebilLine()]),
      match_keys: ['renovering', 'underhåll', 'allmänt'],
    },
  ]
}

// ─── Publikt API ──────────────────────────────────────────────────────

/**
 * Branschmappning: construction/carpenter → byggkatalog, electrician →
 * elkatalog, plumber → VVS-katalog, painter → målerikatalog. Alla branscher
 * (inkl. other/okänd) får dessutom "Årlig hantverksöversyn".
 */
export function getDefaultAgreementTypes(branch?: string | null): DefaultAgreementType[] {
  const normalized = normalizeTemplateBranch(branch)
  const rate = (HOURLY_RATE as Record<string, number>)[normalized] ?? HOURLY_RATE.other
  const allround = allroundAgreementTypes(rate)

  switch (normalized) {
    case 'construction':
    case 'carpenter':
      return [...allround, ...byggAgreementTypes(rate)]
    case 'electrician':
      return [...allround, ...elAgreementTypes(rate)]
    case 'plumber':
      return [...allround, ...vvsAgreementTypes(rate)]
    case 'painter':
      return [...allround, ...maleriAgreementTypes(rate)]
    default:
      return allround
  }
}

/**
 * Alla katalognamn som kan seedas, oavsett bransch — för framtida bruk
 * (kvot-undantag etc.), mönster: getAllDefaultTemplateNames().
 */
export function getAllDefaultAgreementTypeNames(): string[] {
  const names = new Set<string>()
  for (const t of allroundAgreementTypes(650)) names.add(t.name)
  for (const t of byggAgreementTypes(650)) names.add(t.name)
  for (const t of elAgreementTypes(750)) names.add(t.name)
  for (const t of vvsAgreementTypes(750)) names.add(t.name)
  for (const t of maleriAgreementTypes(550)) names.add(t.name)
  return Array.from(names)
}
