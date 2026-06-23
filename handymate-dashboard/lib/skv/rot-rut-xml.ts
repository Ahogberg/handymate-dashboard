/**
 * Skatteverket ROT/RUT — XML-generator (begäran om utbetalning, schema v6).
 *
 * Byggd EXAKT mot XSD + exempelfilerna (exempel_rot_3st.xml). Ren funktion utan
 * DB-anrop → enhetstestbar. Validering sker separat (validate-rot-request.ts);
 * denna funktion antar redan validerade ärenden.
 *
 * KRITISKT:
 * - Belopp anges i HELA KRONOR (heltal), INTE öre. Exempelfilen: 4000 kr jobb →
 *   PrisForArbete 4000, BetaltBelopp 2800, BegartBelopp 1200.
 * - ROT och RUT får ALDRIG blandas i samma fil → funktionen tar EN requestType.
 * - Elementordning under <Arenden> måste matcha XSD (annars schemafel).
 */

import { getCategory, type RotRutType } from './categories'

const NS1 = 'http://xmls.skatteverket.se/se/skatteverket/ht/begaran/6.0'
const NS2 = 'http://xmls.skatteverket.se/se/skatteverket/ht/komponent/begaran/6.0'

export interface SkvArende {
  /** 12-siffrigt personnummer (YYYYMMDDNNNN), validerat uppströms. */
  kopare: string
  /** Betalningsdatum YYYY-MM-DD. */
  betalningsDatum: string
  /** Arbetskostnad i hela kronor (= betaltBelopp + begartBelopp). */
  prisForArbete: number
  /** Begärt avdrag i hela kronor. */
  begartBelopp: number
  fakturaNr?: string
  /** Övrig kostnad (ej arbetsgrundande) i hela kronor. */
  ovrigKostnad?: number
  /** Småhus: fastighetsbeteckning. Anges INTE om BRF används. */
  fastighetsbeteckning?: string
  /** Bostadsrätt: föreningens org-nr (12 siffror) + 4-siffrigt lägenhetsnummer. */
  brfOrgNr?: string
  lagenhetsNr?: string
  /** XSD-kategorielement (t.ex. 'El', 'Vvs', 'Bygg'). */
  categoryCode: string
  /** Antal arbetade timmar (0–999). Utelämnas för schablonkategorier. */
  antalTimmar?: number
  /** Materialkostnad för kategorin i hela kronor (obligatorisk per kategori). */
  materialkostnad: number
}

/** Avrunda till hela kronor (heltal). Aldrig öre, aldrig decimaler i XML. */
export function kronor(value: number | null | undefined): number {
  return Math.round(value || 0)
}

export function escapeXml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildUtfortArbete(a: SkvArende): string {
  const cat = getCategory(a.categoryCode)
  const code = a.categoryCode
  if (cat?.schablon) {
    // Schablonarbete (RUT): <Utfort> boolean i stället för timmar.
    return `      <ns2:${code}>\n        <ns2:Utfort>true</ns2:Utfort>\n      </ns2:${code}>`
  }
  const timmar = a.antalTimmar != null
    ? `        <ns2:AntalTimmar>${Math.round(a.antalTimmar)}</ns2:AntalTimmar>\n`
    : ''
  return `      <ns2:${code}>\n${timmar}        <ns2:Materialkostnad>${kronor(a.materialkostnad)}</ns2:Materialkostnad>\n      </ns2:${code}>`
}

function buildArende(a: SkvArende): string {
  const betalt = kronor(a.prisForArbete) - kronor(a.begartBelopp)
  const lines: string[] = []
  lines.push(`    <ns2:Arenden>`)
  lines.push(`      <ns2:Kopare>${escapeXml(a.kopare)}</ns2:Kopare>`)
  lines.push(`      <ns2:BetalningsDatum>${escapeXml(a.betalningsDatum)}</ns2:BetalningsDatum>`)
  lines.push(`      <ns2:PrisForArbete>${kronor(a.prisForArbete)}</ns2:PrisForArbete>`)
  lines.push(`      <ns2:BetaltBelopp>${betalt}</ns2:BetaltBelopp>`)
  lines.push(`      <ns2:BegartBelopp>${kronor(a.begartBelopp)}</ns2:BegartBelopp>`)
  if (a.fakturaNr) lines.push(`      <ns2:FakturaNr>${escapeXml(a.fakturaNr.slice(0, 20))}</ns2:FakturaNr>`)
  if (a.ovrigKostnad != null) lines.push(`      <ns2:Ovrigkostnad>${kronor(a.ovrigKostnad)}</ns2:Ovrigkostnad>`)
  // Fastighet: BRF (LagenhetsNr + BrfOrgNr) ELLER småhus (Fastighetsbeteckning).
  if (a.brfOrgNr && a.lagenhetsNr) {
    lines.push(`      <ns2:LagenhetsNr>${escapeXml(a.lagenhetsNr)}</ns2:LagenhetsNr>`)
    lines.push(`      <ns2:BrfOrgNr>${escapeXml(a.brfOrgNr)}</ns2:BrfOrgNr>`)
  } else if (a.fastighetsbeteckning) {
    lines.push(`      <ns2:Fastighetsbeteckning>${escapeXml(a.fastighetsbeteckning)}</ns2:Fastighetsbeteckning>`)
  }
  lines.push(`      <ns2:UtfortArbete>`)
  lines.push(buildUtfortArbete(a))
  lines.push(`      </ns2:UtfortArbete>`)
  lines.push(`    </ns2:Arenden>`)
  return lines.join('\n')
}

/**
 * Bygg en komplett begäran-XML för EN typ (rot eller rut).
 * namnPaBegaran: 1–16 tecken (Skatteverkets begränsning).
 */
export function buildSkvXml(input: {
  requestType: RotRutType
  namnPaBegaran: string
  arenden: SkvArende[]
}): string {
  const root = input.requestType === 'rot' ? 'RotBegaran' : 'RutBegaran'
  const namn = escapeXml(input.namnPaBegaran.slice(0, 16))
  const arenden = input.arenden.map(buildArende).join('\n')
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<ns1:Begaran xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:ns1="${NS1}" xmlns:ns2="${NS2}">`,
    `  <ns2:NamnPaBegaran>${namn}</ns2:NamnPaBegaran>`,
    `  <ns2:${root}>`,
    arenden,
    `  </ns2:${root}>`,
    `</ns1:Begaran>`,
    '',
  ].join('\n')
}
