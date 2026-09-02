/**
 * Tyst tid för push (2026-09-02) — rena funktioner, ingen I/O.
 *
 * Teamet i fickan: en hantverkare ska inte väckas 23:40 av "Karin har
 * sammanfattat" eller "Matte märkte något". Mellan TYST_TID.start och
 * TYST_TID.end (svensk tid) HÅLLS pushar av klasserna hant och
 * teamuppdatering i push_held (sql/v194) och släpps som EN
 * morgonsammanfattning av /api/cron/push-morgon. Klassen beslut går alltid
 * igenom — ett fyra-ögon-beslut eller en observation som kräver ägarens
 * ja/nej är precis det ägaren sagt att den vill väckas för.
 *
 * Kortet/raden i pending_approvals är redan skapad av anroparen innan
 * pushen når hit — bara notisen hålls, aldrig händelsen.
 *
 * Fönstret är V1-konstant (samma default som SMS-grinden, 21:00–07:00).
 * Per-företagsinställning är nästa steg när någon ber om det.
 */

import { isWithinQuietHours, stockholmMinutesNow } from '@/lib/tysta-timmar'
import type { PushKlass } from '@/lib/notifications/push-policy'

export const TYST_TID = { start: '21:00', end: '07:00' } as const

/** Vilka klasser som hålls under tyst tid. beslut hålls ALDRIG. */
export const HALLS_UNDER_TYST_TID: Record<PushKlass, boolean> = {
  beslut: false,
  hant: true,
  teamuppdatering: true,
}

/** Hållna rader äldre än så skickas inte i efterhand — de har spelat ut sin roll. */
export const HALLEN_MAX_ALDER_TIMMAR = 36

/** Max rubriker som räknas upp i sammanfattningens brödtext. */
export const SAMMANFATTNING_MAX_RADER = 3

export const MORGON_TAG = 'morgon-sammanfattning'

export function arTystTid(now: Date = new Date()): boolean {
  return isWithinQuietHours(TYST_TID.start, TYST_TID.end, stockholmMinutesNow(now))
}

export function skaHallasUnderTystTid(klass: PushKlass, now: Date = new Date()): boolean {
  return HALLS_UNDER_TYST_TID[klass] === true && arTystTid(now)
}

export interface HallenPush {
  id: string
  business_id: string
  target_user_id: string | null
  approval_type: string
  push_class: PushKlass
  dedupe_key: string
  title: string
  body: string
  url: string
  created_at: string
}

export interface Morgonsammanfattning {
  title: string
  body: string
  url: string
  tag: string
  antal: number
}

/** Grupperar hållna rader per mottagare: företag + (riktad person eller hela företaget). */
export function grupperaPerMottagare(rader: HallenPush[]): Map<string, HallenPush[]> {
  const grupper = new Map<string, HallenPush[]>()
  for (const rad of rader) {
    const nyckel = `${rad.business_id}|${rad.target_user_id || ''}`
    const lista = grupper.get(nyckel) ?? []
    lista.push(rad)
    grupper.set(nyckel, lista)
  }
  return grupper
}

/** Delar upp i det som ska skickas och det som är för gammalt. */
export function delaUppHallna(rader: HallenPush[], now: Date = new Date()): { skicka: HallenPush[]; utgangna: HallenPush[] } {
  const grans = now.getTime() - HALLEN_MAX_ALDER_TIMMAR * 3600 * 1000
  const skicka: HallenPush[] = []
  const utgangna: HallenPush[] = []
  for (const rad of rader) {
    const t = Date.parse(rad.created_at)
    if (Number.isFinite(t) && t < grans) utgangna.push(rad)
    else skicka.push(rad)
  }
  return { skicka, utgangna }
}

function kortaNer(text: string, max: number): string {
  const s = text.trim()
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}

/**
 * En hållen notis skickas som den är (bara försenad). Flera blir en
 * sammanfattning: rubriken räknar, brödtexten radar upp de första
 * rubrikerna, länken är gemensam om alla pekar på samma sida — annars
 * startsidan.
 */
export function byggMorgonsammanfattning(rader: HallenPush[]): Morgonsammanfattning | null {
  if (rader.length === 0) return null
  const sorterade = [...rader].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  if (sorterade.length === 1) {
    const [enda] = sorterade
    return { title: enda.title, body: enda.body, url: enda.url || '/dashboard', tag: MORGON_TAG, antal: 1 }
  }
  const rubriker = sorterade.slice(0, SAMMANFATTNING_MAX_RADER).map(r => kortaNer(r.title.replace(/^✓\s*/, ''), 60))
  const rest = sorterade.length - rubriker.length
  const body = kortaNer(rubriker.join(' · ') + (rest > 0 ? ` · +${rest} till` : ''), 180)
  const urlar = new Set(sorterade.map(r => r.url || '/dashboard'))
  return {
    title: `${sorterade.length} saker hände medan du var borta`,
    body,
    url: urlar.size === 1 ? Array.from(urlar)[0] : '/dashboard',
    tag: MORGON_TAG,
    antal: sorterade.length,
  }
}
