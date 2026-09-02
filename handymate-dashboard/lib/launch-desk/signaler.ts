/**
 * lib/launch-desk/signaler.ts (pass 1b, tasks/plan-launch-desk-signaler.md)
 *
 * Härleder DETERMINISTISKA signaler ur ett prospekts EGEN webbplats — ingen
 * AI, bara mönstermatchning mot texten och HTML:en som redan hämtats med
 * det SSRF-skyddade flödet i lib/onboarding/website-fetch.ts. Signalerna
 * sparas i gtm_account.brief_source_snapshot.signals och används för att
 * låta AI-utkastet (brief.ts) öppna med den starkaste, verkliga iakttagelsen
 * — aldrig en hittepå-slutsats.
 *
 * Varje signal MÅSTE ha ett citat (evidence) ur den faktiska texten — utan
 * ett grundande citat skapas ingen signal, även om själva villkoret är
 * uppfyllt (se t.ex. ingen_bokning/bara_telefon nedan, där avsaknaden av
 * något bara är intressant tillsammans med ett bevisat kontaktsätt).
 *
 * Rena funktioner — ingen nätverk, inget Supabase. Testas i
 * tests/launch-desk-signaler.spec.ts (browserlöst).
 */
import { TRADE_TERMS } from './scoring'

export type GtmSignalStyrka = 1 | 2 | 3

export interface GtmSignal {
  key: string
  label: string
  evidence: string
  styrka: GtmSignalStyrka
}

export interface GtmSignalSnapshot {
  fetched_at: string
  url: string
  signals: GtmSignal[]
  text_chars: number
}

const MAX_EVIDENCE_CHARS = 120

/** Branschord utöver scoring.ts:s TRADE_TERMS — samma idé (tjänsteord som
 * dyker upp i löptext på en hantverkarsajt), inte en bolagsklassificering. */
const EXTRA_BRANSCHORD = [
  'städ', 'trädgård', 'flytt', 'larm', 'glas', 'plåt', 'isolering', 'fasad',
  'murare', 'vitvaror', 'solceller', 'värmepump', 'staket', 'altan', 'badrum', 'kök',
]

const TJANSTE_ORD = [...TRADE_TERMS, ...EXTRA_BRANSCHORD]

/** Kortar ett citat till högst MAX_EVIDENCE_CHARS tecken, utan att klippa
 * mitt i ett ord om det går att undvika. */
function quote(text: string, max = MAX_EVIDENCE_CHARS): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= max) return trimmed
  const cut = trimmed.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + '…'
}

/** Bygger ett citat runt en regex-träff — några tecken kontext före och
 * upp till MAX_EVIDENCE_CHARS totalt. */
function snippetAround(text: string, match: RegExpMatchArray): string {
  const index = match.index ?? 0
  const start = Math.max(0, index - 20)
  return quote(text.slice(start, start + MAX_EVIDENCE_CHARS + 20))
}

const NAMNDA_ORDNING = [
  'ingen_bokning',
  'bara_telefon',
  'svarstid',
  'gammalt_artal',
  'sasong',
  'anstaller',
  'rot_nämns',
  'recensioner',
  'tjanster',
] as const

const LABELS: Record<(typeof NAMNDA_ORDNING)[number], string> = {
  ingen_bokning: 'Ingen bokning på sajten',
  bara_telefon: 'Bara telefon som kontaktväg',
  svarstid: 'Anger svarstid',
  gammalt_artal: 'Gammalt årtal på sajten',
  sasong: 'Säsongsstängt',
  anstaller: 'Anställer eller söker personal',
  rot_nämns: 'Nämner ROT/RUT-avdrag',
  recensioner: 'Visar recensioner',
  tjanster: 'Tydlig tjänstelista',
}

const BOKNING_ORD = /boka|bokning|onlinebokning|kalender/i
const KONTAKT_UTAN_BOKNING = /(ring oss[^.!?\n]{0,90}|kontakta oss[^.!?\n]{0,90}|telefon\s*[:\-]?\s*0[\d\s-]{5,}[^.!?\n]{0,30})/i
const TELEFON = /(0\d[\d\s-]{5,}\d)/
const EPOST = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i
const FORM_TAGG = /<form/i
const SVARSTID = /(svarar inom\s*\d{1,3}\s*(timmar|tim|h)\b|återkommer(?:\s+\w+){0,6})/i
const ARTAL = /(?:©\s?(\d{4})|copyright\s*(\d{4})|uppdaterad(?:\s+\w+){0,3}\s*(\d{4}))/i
const SASONG = /(sommarstängt|semesterstängt|vinterstängt)/i
const ANSTALLER = /(vi söker[^.!?\n]{0,60}|lediga tjänster|rekryterar|anställer)/i
const ROT_RUT = /(rotavdrag|rot-avdrag|\brot\b|rutavdrag|rut-avdrag)/i
const RECENSIONER = /(reco\.se|reco\b|trustpilot|google recensioner|omdömen)/i

function harledIngenBokning(text: string, html: string): GtmSignal | null {
  if (BOKNING_ORD.test(text)) return null
  if (FORM_TAGG.test(html)) return null
  const match = text.match(KONTAKT_UTAN_BOKNING)
  if (!match) return null
  return { key: 'ingen_bokning', label: LABELS.ingen_bokning, evidence: quote(match[0]), styrka: 2 }
}

function harledBaraTelefon(text: string, html: string): GtmSignal | null {
  const phoneMatch = text.match(TELEFON)
  if (!phoneMatch) return null
  if (EPOST.test(text)) return null
  if (FORM_TAGG.test(html)) return null
  return { key: 'bara_telefon', label: LABELS.bara_telefon, evidence: snippetAround(text, phoneMatch), styrka: 2 }
}

function harledSvarstid(text: string): GtmSignal | null {
  const match = text.match(SVARSTID)
  if (!match) return null
  return { key: 'svarstid', label: LABELS.svarstid, evidence: snippetAround(text, match), styrka: 1 }
}

function harledGammaltArtal(text: string, now: Date): GtmSignal | null {
  const match = text.match(ARTAL)
  if (!match) return null
  const yearStr = match[1] || match[2] || match[3]
  const year = yearStr ? parseInt(yearStr, 10) : NaN
  if (!Number.isFinite(year)) return null
  if (year > now.getFullYear() - 2) return null
  return { key: 'gammalt_artal', label: LABELS.gammalt_artal, evidence: snippetAround(text, match), styrka: 1 }
}

function harledSasong(text: string): GtmSignal | null {
  const match = text.match(SASONG)
  if (!match) return null
  return { key: 'sasong', label: LABELS.sasong, evidence: snippetAround(text, match), styrka: 1 }
}

function harledAnstaller(text: string): GtmSignal | null {
  const match = text.match(ANSTALLER)
  if (!match) return null
  return { key: 'anstaller', label: LABELS.anstaller, evidence: snippetAround(text, match), styrka: 3 }
}

function harledRotNamns(text: string): GtmSignal | null {
  const match = text.match(ROT_RUT)
  if (!match) return null
  return { key: 'rot_nämns', label: LABELS.rot_nämns, evidence: snippetAround(text, match), styrka: 1 }
}

function harledRecensioner(text: string): GtmSignal | null {
  const match = text.match(RECENSIONER)
  if (!match) return null
  return { key: 'recensioner', label: LABELS.recensioner, evidence: snippetAround(text, match), styrka: 1 }
}

function harledTjanster(text: string): GtmSignal | null {
  const lower = text.toLowerCase()
  const funna = TJANSTE_ORD.filter(ord => lower.includes(ord))
  if (funna.length < 3 || funna.length > 8) return null
  const firstIndex = Math.min(...funna.map(ord => lower.indexOf(ord)))
  const evidence = quote(text.slice(Math.max(0, firstIndex - 10), firstIndex + MAX_EVIDENCE_CHARS))
  return { key: 'tjanster', label: LABELS.tjanster, evidence, styrka: 1 }
}

/**
 * Härleder alla deterministiska signaler ur text (redan körd genom
 * htmlToExtractableText) och rå HTML (för <form>-detektion).
 * Returnerar signalerna i den fasta, dokumenterade ordningen ovan — INTE
 * sorterade efter styrka (det gör valjOppning).
 */
export function harledSignaler(text: string, html: string, now: Date): GtmSignal[] {
  const kandidater: Array<GtmSignal | null> = [
    harledIngenBokning(text, html),
    harledBaraTelefon(text, html),
    harledSvarstid(text),
    harledGammaltArtal(text, now),
    harledSasong(text),
    harledAnstaller(text),
    harledRotNamns(text),
    harledRecensioner(text),
    harledTjanster(text),
  ]
  return kandidater.filter((s): s is GtmSignal => s !== null)
}

/**
 * Väljer den starkaste signalen att öppna kontaktunderlaget med: högst
 * styrka först, oavgjort bryts av NAMNDA_ORDNING (samma ordning som i
 * planen). Returnerar null om inga signaler finns.
 */
export function valjOppning(signaler: GtmSignal[]): GtmSignal | null {
  if (signaler.length === 0) return null
  const sorterade = [...signaler].sort((a, b) => {
    if (b.styrka !== a.styrka) return b.styrka - a.styrka
    return NAMNDA_ORDNING.indexOf(a.key as (typeof NAMNDA_ORDNING)[number]) -
      NAMNDA_ORDNING.indexOf(b.key as (typeof NAMNDA_ORDNING)[number])
  })
  return sorterade[0]
}
