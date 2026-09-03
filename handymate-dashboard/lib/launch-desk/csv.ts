import type { GtmAccountInput, GtmContactBasis, GtmLegalForm, GtmChannel } from './types'

const HEADER_ALIASES: Record<string, string> = {
  företag: 'company_name',
  foretag: 'company_name',
  företagsnamn: 'company_name',
  foretagsnamn: 'company_name',
  organisationsnummer: 'org_number',
  orgnummer: 'org_number',
  bolagsform: 'legal_form',
  bransch: 'industry',
  anställda: 'employee_band',
  anstallda: 'employee_band',
  omsättning: 'turnover_band',
  omsattning: 'turnover_band',
  webbplats: 'website',
  telefon: 'company_phone',
  epost: 'company_email',
  'e-post': 'company_email',
  kommun: 'municipality',
  län: 'county',
  lan: 'county',
  källa: 'source_name',
  kalla: 'source_name',
  källurl: 'source_url',
  kallurl: 'source_url',
  kontrolldatum: 'source_checked_at',
  faktanotering: 'factual_notes',
  kontaktperson: 'primary_contact_name',
  kontaktroll: 'primary_contact_role',
  kontaktemail: 'primary_contact_email',
  kontakttelefon: 'primary_contact_phone',
  linkedin: 'primary_contact_linkedin',
  kontaktkälla: 'contact_basis',
  kontaktkalla: 'contact_basis',
  föreslagen_kanal: 'suggested_channel',
  foreslagen_kanal: 'suggested_channel',
}

function canonicalHeader(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/^\uFEFF/, '')
  return HEADER_ALIASES[normalized] || normalized
}

function delimiterFor(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  return (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ','
}

export function parseCsvRows(text: string): string[][] {
  const delimiter = delimiterFor(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"'
        i++
      } else {
        quoted = !quoted
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim())
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(cell.trim())
      if (row.some(value => value !== '')) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  row.push(cell.trim())
  if (row.some(value => value !== '')) rows.push(row)
  return rows
}

function legalForm(value: string): GtmLegalForm {
  const normalized = value.trim().toLowerCase()
  if (['ab', 'aktiebolag', 'limited_company'].includes(normalized)) return 'limited_company'
  if (['enskild', 'enskild firma', 'enskild näringsidkare', 'sole_trader'].includes(normalized)) return 'sole_trader'
  if (['hb', 'kb', 'handelsbolag', 'kommanditbolag', 'trading_partnership'].includes(normalized)) return 'trading_partnership'
  if (['förening', 'forening', 'association'].includes(normalized)) return 'association'
  if (normalized === 'other') return 'other'
  return 'unknown'
}

function contactBasis(value: string): GtmContactBasis {
  const normalized = value.trim().toLowerCase()
  if (['varm', 'varm introduktion', 'warm_intro'].includes(normalized)) return 'warm_intro'
  if (['inkommande', 'inbound'].includes(normalized)) return 'inbound'
  if (['kundreferens', 'customer_referral'].includes(normalized)) return 'customer_referral'
  if (['offentlig företagskontakt', 'public_business_contact'].includes(normalized)) return 'public_business_contact'
  if (['offentlig yrkesroll', 'public_professional_role'].includes(normalized)) return 'public_professional_role'
  return 'unknown'
}

function channel(value: string): GtmChannel {
  const normalized = value.trim().toLowerCase()
  const map: Record<string, GtmChannel> = {
    varm: 'warm_intro',
    warm_intro: 'warm_intro',
    telefon: 'phone',
    phone: 'phone',
    linkedin: 'linkedin',
    epost: 'email',
    'e-post': 'email',
    email: 'email',
    brev: 'letter',
    letter: 'letter',
    video: 'video',
  }
  return map[normalized] || 'none'
}

/**
 * Varför en rad avvisades. Texten visas rakt av för den som importerar, så
 * den ska säga vad som ska rättas — inte vilket fält som var tomt.
 */
export interface AvvisadRad {
  rad: number          // radnummer i filen, 1-indexerat inklusive rubrikraden
  namn: string         // företagsnamnet om det fanns, annars '(namn saknas)'
  skal: string
}

export interface GranskadCsv {
  giltiga: GtmAccountInput[]
  avvisade: AvvisadRad[]
}

/** Kall kontakt = allt utom inkommande förfrågan och en varm relation. Det är
 *  där bolagsformen är materiell: en enskild firma ÄR en fysisk person och
 *  organisationsnumret är personnumret. */
const VARMA_GRUNDER = ['inbound', 'warm_intro', 'customer_referral']

/**
 * Granskar en CSV och skiljer giltiga rader från avvisade, med skäl.
 *
 * Bakgrund (2026-09-03): tidigare krävdes bara `company_name`. Två hål:
 *
 *  1. Saknades `source_checked_at` byggde importrutten
 *     `new Date(new Date('').getTime() + 180 dagar).toISOString()` — vilket
 *     kastar `RangeError: Invalid time value` och fäller HELA importen, utan
 *     att säga vilken rad eller vilket fält som saknades.
 *  2. `source_name: ''` uppfyller kolumnens NOT NULL (tom sträng är inte
 *     null), så en rad helt utan källhänvisning kunde landa i basen och se
 *     komplett ut. Det är precis den efterlevnadsskuld fältet finns för att
 *     förhindra — hundra rader går att städa, tiotusen gör det inte.
 *
 * Ren funktion. Ingen I/O.
 */
export function granskaLaunchCsv(text: string): GranskadCsv {
  const rows = parseCsvRows(text)
  if (rows.length < 2) return { giltiga: [], avvisade: [] }
  const headers = rows[0].map(canonicalHeader)

  const giltiga: GtmAccountInput[] = []
  const avvisade: AvvisadRad[] = []

  rows.slice(1).forEach((values, index) => {
    const radnummer = index + 2 // +1 för rubrikraden, +1 för 1-indexering
    const record: Record<string, string> = {}
    headers.forEach((header, i) => { record[header] = values[i] || '' })
    const namn = record.company_name?.trim() || '(namn saknas)'

    if (!record.company_name?.trim()) {
      avvisade.push({ rad: radnummer, namn, skal: 'Företagsnamn saknas' })
      return
    }
    if (!record.source_name?.trim()) {
      avvisade.push({ rad: radnummer, namn, skal: 'Källa saknas — varifrån kommer uppgiften?' })
      return
    }

    const kontrolldatum = record.source_checked_at?.trim()
    if (!kontrolldatum) {
      avvisade.push({ rad: radnummer, namn, skal: 'Kontrolldatum saknas — när kontrollerades källan?' })
      return
    }
    const parsat = new Date(kontrolldatum)
    if (Number.isNaN(parsat.getTime())) {
      avvisade.push({ rad: radnummer, namn, skal: `Kontrolldatumet går inte att tolka: "${kontrolldatum}"` })
      return
    }
    // Ett datum i framtiden är alltid ett skrivfel — man kan inte ha
    // kontrollerat en källa imorgon. Dygnets marginal tål tidszonsslarv.
    if (parsat.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      avvisade.push({ rad: radnummer, namn, skal: `Kontrolldatumet ligger i framtiden: "${kontrolldatum}"` })
      return
    }

    const grund = contactBasis(record.contact_basis || '')
    const form = legalForm(record.legal_form || '')
    if (form === 'unknown' && !VARMA_GRUNDER.includes(grund)) {
      avvisade.push({
        rad: radnummer,
        namn,
        skal: 'Bolagsform okänd. Krävs för kall kontakt — enskild firma är en fysisk person.',
      })
      return
    }

    giltiga.push(byggRad(record))
  })

  return { giltiga, avvisade }
}

export function parseLaunchCsv(text: string): GtmAccountInput[] {
  return granskaLaunchCsv(text).giltiga
}

function byggRad(record: Record<string, string>): GtmAccountInput {
  {
    return {
      company_name: record.company_name,
      org_number: record.org_number || null,
      legal_form: legalForm(record.legal_form || ''),
      industry: record.industry || null,
      sni_code: record.sni_code || null,
      employee_band: record.employee_band || null,
      turnover_band: record.turnover_band || null,
      website: record.website || null,
      company_phone: record.company_phone || null,
      company_email: record.company_email || null,
      municipality: record.municipality || null,
      county: record.county || null,
      source_name: record.source_name,
      source_url: record.source_url || null,
      source_checked_at: record.source_checked_at,
      factual_notes: record.factual_notes || null,
      primary_contact_name: record.primary_contact_name || null,
      primary_contact_role: record.primary_contact_role || null,
      primary_contact_email: record.primary_contact_email || null,
      primary_contact_phone: record.primary_contact_phone || null,
      primary_contact_linkedin: record.primary_contact_linkedin || null,
      contact_basis: contactBasis(record.contact_basis || ''),
      suggested_channel: channel(record.suggested_channel || ''),
    }
  }
}
