/**
 * Företagsskannern — ren, DOM-fri och testbar skannelogik (pass 1a, 2026-09-02,
 * tasks/plan-foretagsskannern.md).
 *
 * Allt körs I WEBBLÄSAREN på den publika sidan (app/foretagsskannern/page.tsx):
 * ingen fil skickas till servern, ingen databas läses eller skrivs härifrån.
 * Modulen tar bara emot råtext (CSV-filens innehåll) och räknar — precis som
 * onboardingens genomgång (lib/onboarding/company-scan-rows.ts), fast på
 * besökarens EGEN kundlista i stället för en importerad firma.
 *
 * ÄRLIGHET: bara räknade fakta. Inget fabriceras, ingen AI, ingen gissning på
 * belopp eller datum — en rad som inte går att tolka räknas hellre bort.
 */

import { parseCsvCustomers, parseCustomerCsv } from '@/lib/customers/csv'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'

// ─────────────────────────── Kundlistan ───────────────────────────────────

export interface SkannadKund {
  name: string
  phone_number: string
  email: string
  address: string
}

export interface SkannaKundlistaResultat {
  kunder: number
  utanTelefon: number
  utanEpost: number
  /** Rader vars normaliserade telefon ELLER e-post redan förekommit tidigare i listan. */
  dubbletter: number
  /** De tre första kundnamnen som faktiskt finns i filen — aldrig påhittade. */
  exempelNamn: string[]
}

/** Jämförbar telefonnyckel. Tomt/otolkbart nummer deltar aldrig i dubblettjämförelsen. */
function telefonNyckel(raw: string): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  const normaliserat = normalizeSwedishPhone(trimmed)
  const siffror = normaliserat.replace(/[^0-9]/g, '')
  if (!normaliserat.startsWith('+') || siffror.length < 8 || siffror.length > 15) return null
  return normaliserat
}

function epostNyckel(raw: string): string | null {
  const trimmed = raw?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

export function skannaKundlista(text: string): SkannaKundlistaResultat {
  const kunder = parseCsvCustomers(text)

  let utanTelefon = 0
  let utanEpost = 0
  let dubbletter = 0
  const settaTelefoner = new Set<string>()
  const settaEpostar = new Set<string>()

  for (const k of kunder) {
    if (!k.phone_number?.trim()) utanTelefon++
    if (!k.email?.trim()) utanEpost++

    const telNyckel = telefonNyckel(k.phone_number)
    const eNyckel = epostNyckel(k.email)
    const arDubblett = (telNyckel !== null && settaTelefoner.has(telNyckel)) || (eNyckel !== null && settaEpostar.has(eNyckel))
    if (arDubblett) dubbletter++
    if (telNyckel !== null) settaTelefoner.add(telNyckel)
    if (eNyckel !== null) settaEpostar.add(eNyckel)
  }

  const exempelNamn = kunder.map(k => k.name?.trim()).filter((n): n is string => !!n).slice(0, 3)

  return { kunder: kunder.length, utanTelefon, utanEpost, dubbletter, exempelNamn }
}

// ─────────────────────────── Fakturorna ───────────────────────────────────

export interface SkannaFakturorResultat {
  fakturor: number
  oppna: number
  forfallna: number
  /** Summa i kronor för de förfallna fakturorna. */
  forfalletBelopp: number
  /** Antal dagar sedan förfallodatumet för den äldst förfallna fakturan (0 om inget tolkbart datum fanns). */
  aldstaForfallnaDagar: number
}

const FAKTURANUMMER_NYCKLAR = ['fakturanummer', 'invoice']
const FORFALLODATUM_NYCKLAR = ['förfallodatum', 'forfallodatum', 'due']
const BELOPP_NYCKLAR = ['belopp', 'total', 'amount']
const STATUS_NYCKLAR = ['betald', 'paid', 'status']
const KUND_NYCKLAR = ['kund', 'customer']

function hittaKolumn(header: string[], nycklar: string[]): number {
  return header.findIndex(h => nycklar.some(n => h.includes(n)))
}

/** Tolerant beloppsparser: "12 300,50 kr" / "12300.50" / "12,300.00" → 12300.5. Otolkbart → null (gissas aldrig). */
function tolkaBelopp(raw: string): number | null {
  if (!raw) return null
  let s = raw.trim().toLowerCase().replace(/kr|sek/g, '').replace(/[\s ]/g, '')
  if (!s) return null
  const harKomma = s.includes(',')
  const harPunkt = s.includes('.')
  if (harKomma && harPunkt) {
    // Sista separatoren är decimaltecknet, den andra är tusentalsavskiljare.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (harKomma) {
    s = s.replace(',', '.')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Otolkbart datum → null. Litar bara på vad Date faktiskt kan tolka — gissar aldrig. */
function tolkaDatum(raw: string): Date | null {
  if (!raw?.trim()) return null
  const d = new Date(raw.trim())
  return Number.isNaN(d.getTime()) ? null : d
}

function arBetald(raw: string): boolean {
  const v = raw?.trim().toLowerCase()
  return /^(betald|paid|ja|yes|true|1)$/.test(v || '')
}

function arForfallenStatus(raw: string): boolean {
  const v = raw?.trim().toLowerCase()
  return /förfallen|forfallen|overdue/.test(v || '')
}

/**
 * `now` är injicerbar (default = riktig tid) så facit kan vara deterministiskt
 * — aldrig beroende av vilken dag testet råkar köras.
 */
export function skannaFakturor(text: string, now: Date = new Date()): SkannaFakturorResultat | null {
  const { headers, rows } = parseCustomerCsv(text)
  if (headers.length === 0) return null
  const header = headers.map(h => h.toLowerCase())

  const invoiceIdx = hittaKolumn(header, FAKTURANUMMER_NYCKLAR)
  const dueIdx = hittaKolumn(header, FORFALLODATUM_NYCKLAR)
  const amountIdx = hittaKolumn(header, BELOPP_NYCKLAR)
  const statusIdx = hittaKolumn(header, STATUS_NYCKLAR)
  const customerIdx = hittaKolumn(header, KUND_NYCKLAR)

  if (invoiceIdx < 0 && dueIdx < 0 && amountIdx < 0 && statusIdx < 0 && customerIdx < 0) return null
  // Utan en beloppskolumn finns inget att räkna kr på — aldrig gissa ett tal.
  if (amountIdx < 0) return null

  let fakturor = 0
  let oppna = 0
  let forfallna = 0
  let forfalletBelopp = 0
  let aldstaForfallnaDagar = 0

  for (const cols of rows) {
    const belopp = tolkaBelopp(cols[amountIdx] ?? '')
    if (belopp === null) continue // ogiltigt belopp — raden ignoreras helt

    fakturor++
    const betald = statusIdx >= 0 && arBetald(cols[statusIdx] ?? '')
    if (betald) continue

    oppna++

    const forfalloDatum = dueIdx >= 0 ? tolkaDatum(cols[dueIdx] ?? '') : null
    const statusSagerForfallen = statusIdx >= 0 && arForfallenStatus(cols[statusIdx] ?? '')
    const datumSagerForfallen = forfalloDatum !== null && forfalloDatum.getTime() < now.getTime()

    if (statusSagerForfallen || datumSagerForfallen) {
      forfallna++
      forfalletBelopp += belopp
      if (forfalloDatum !== null) {
        const dagar = Math.floor((now.getTime() - forfalloDatum.getTime()) / (24 * 60 * 60 * 1000))
        if (dagar > aldstaForfallnaDagar) aldstaForfallnaDagar = dagar
      }
    }
  }

  return { fakturor, oppna, forfallna, forfalletBelopp: Math.round(forfalletBelopp), aldstaForfallnaDagar }
}

// ─────────────────────────── Fynden ───────────────────────────────────────

export type ForetagsskannernAgent = 'lisa' | 'hanna' | 'karin'

export interface ForetagsskannernFynd {
  key: string
  text: string
  agent?: ForetagsskannernAgent
  /** Vad teamet gör åt just det här fyndet EFTER att kunden skapat konto. */
  uppfoljning: string
}

function fmt(n: number): string {
  return n.toLocaleString('sv-SE')
}

/**
 * Egen "vad teamet gör"-karta för Företagsskannern — samma anda som
 * teamGorNarDuAktiverar (lib/onboarding/company-scan-rows.ts), men skriven
 * för en besökare som ÄNNU INTE har ett konto.
 */
function teamGorAtFyndet(key: string): string {
  switch (key) {
    case 'kunder':
      return 'Lisa fångar samtalet när de ringer och Hanna håller kontakten'
    case 'utanTelefon':
      return 'Lisa kan inte nå dem'
    case 'utanEpost':
      return 'Hanna kan inte skicka påminnelser till dem'
    case 'dubbletter':
      return 'Vi slår ihop dem automatiskt vid import — inga dubbletter kvar'
    case 'fakturor_oppna':
      return 'Karin bevakar dem och påminner när det behövs'
    case 'fakturor_forfallna':
      return 'Karin förbereder påminnelser du godkänner'
    default:
      return ''
  }
}

/**
 * Bygger raderna ur de råa talen — bara sanna rader (n>0), aldrig ett
 * påhittat fynd. `now` finns med för framtida tidsberoende rader (t.ex. en
 * "X dagar förfallet"-formulering) utan att signaturen behöver ändras igen.
 */
export function byggFynd(kund: SkannaKundlistaResultat, faktura: SkannaFakturorResultat | null, _now: Date): ForetagsskannernFynd[] {
  const rows: ForetagsskannernFynd[] = []

  if (kund.kunder > 0) {
    rows.push({ key: 'kunder', text: `${fmt(kund.kunder)} kund${kund.kunder > 1 ? 'er' : ''} hittade`, uppfoljning: teamGorAtFyndet('kunder') })
  }
  if (kund.utanTelefon > 0) {
    rows.push({
      key: 'utanTelefon',
      text: `${fmt(kund.utanTelefon)} kund${kund.utanTelefon > 1 ? 'er' : ''} saknar telefonnummer`,
      agent: 'lisa',
      uppfoljning: teamGorAtFyndet('utanTelefon'),
    })
  }
  if (kund.utanEpost > 0) {
    rows.push({
      key: 'utanEpost',
      text: `${fmt(kund.utanEpost)} kund${kund.utanEpost > 1 ? 'er' : ''} saknar e-post`,
      agent: 'hanna',
      uppfoljning: teamGorAtFyndet('utanEpost'),
    })
  }
  if (kund.dubbletter > 0) {
    rows.push({
      key: 'dubbletter',
      text: `${fmt(kund.dubbletter)} dubblett${kund.dubbletter > 1 ? 'er' : ''}`,
      uppfoljning: teamGorAtFyndet('dubbletter'),
    })
  }
  if (faktura) {
    if (faktura.oppna > 0) {
      rows.push({
        key: 'fakturor_oppna',
        text: `${fmt(faktura.oppna)} öppna faktur${faktura.oppna > 1 ? 'or' : 'a'}`,
        agent: 'karin',
        uppfoljning: teamGorAtFyndet('fakturor_oppna'),
      })
    }
    if (faktura.forfallna > 0) {
      rows.push({
        key: 'fakturor_forfallna',
        text: `${fmt(faktura.forfallna)} förfallna faktur${faktura.forfallna > 1 ? 'or' : 'a'}, ${fmt(faktura.forfalletBelopp)} kr`,
        agent: 'karin',
        uppfoljning: teamGorAtFyndet('fakturor_forfallna'),
      })
    }
  }

  return rows
}

// ─────────────────────────── Handoff till onboardingen ────────────────────

export const HANDOFF_KEY = 'hm_foretagsskannern_underlag'

/** Fler kunder än så här sparas aldrig i sessionStorage — samma tak som Fynd 1a i planen. */
const MAX_UNDERLAG_KUNDER = 5000

export interface ForetagsskannernUnderlag {
  kunder: SkannadKund[]
  fynd: ForetagsskannernFynd[]
  skannatAt: string
}

/**
 * Skriver underlaget kunden tar med sig till onboardingen. Bara siffrorna
 * från fakturorna finns med i fynden — inga fakturarader sparas.
 * Tyst vid privat läge / otillgänglig storage (samma mönster som
 * app/onboarding/step2-draft.ts) — skannern får aldrig krascha på det.
 */
export function skrivUnderlag(kunder: SkannadKund[], fynd: ForetagsskannernFynd[]): void {
  try {
    const underlag: ForetagsskannernUnderlag = {
      kunder: kunder.slice(0, MAX_UNDERLAG_KUNDER),
      fynd,
      skannatAt: new Date().toISOString(),
    }
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(underlag))
  } catch {
    // Privat läge / storage otillgänglig — degradera tyst.
  }
}

function arSkannadKund(v: unknown): v is SkannadKund {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return typeof r.name === 'string' && typeof r.phone_number === 'string' && typeof r.email === 'string' && typeof r.address === 'string'
}

/**
 * Icke-förstörande koll: finns ett underlag sparat, utan att konsumera det.
 * Onboardingsidan (app/onboarding/page.tsx) behöver veta OM ett underlag
 * finns redan vid mount (för att stämpla varianten 'skanner' i tratten) —
 * men det är StepImportData som senare faktiskt LÄSER OCH RENSAR det via
 * lasOchRensaUnderlag(). Samma tvådelade mönster som hasStep2Draft/
 * readStep2Draft i app/onboarding/step2-draft.ts.
 */
export function harForetagsskannernUnderlag(): boolean {
  try {
    return !!sessionStorage.getItem(HANDOFF_KEY)
  } catch {
    return false
  }
}

/** Läser OCH rensar underlaget (engångshandoff) — tyst vid skräp/otillgänglig storage. */
export function lasOchRensaUnderlag(): ForetagsskannernUnderlag | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY)
    sessionStorage.removeItem(HANDOFF_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const kunder = Array.isArray(parsed.kunder) ? parsed.kunder.filter(arSkannadKund) : []
    if (kunder.length === 0) return null
    const fynd = Array.isArray(parsed.fynd) ? parsed.fynd : []
    const skannatAt = typeof parsed.skannatAt === 'string' ? parsed.skannatAt : new Date().toISOString()
    return { kunder, fynd, skannatAt }
  } catch {
    return null
  }
}
