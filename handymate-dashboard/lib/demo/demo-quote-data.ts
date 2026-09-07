import type { CanonicalQuoteItem } from '@/lib/quotes/create-quote'
import { rotRutDeductionInclVat } from '@/lib/rot-rut'

/**
 * Rena data och regler för demo-offerten (yta 9, 2026-09-08) — ingen DB,
 * inget SMS. Utbrutet ur demo-quote.ts så facit (tests/demo-offert.spec.ts)
 * kan importera siffrorna och valideringen utan att dra in Supabase-
 * klienten och SMS-strypunkten. Allt här re-exporteras från demo-quote.ts.
 */

export const DEMO_QUOTE_BUSINESS_ID = 'biz_demo_ekstrom'
export const DEMO_QUOTE_BUSINESS_NAME = 'Ekström Bygg AB'
export const DEMO_QUOTE_TITLE = 'Badrumsrenovering, Sjövägen 4'
export const DEMO_QUOTE_PROJECT_ADDRESS = 'Sjövägen 4, Nacka'
export const DEMO_QUOTE_VALID_DAYS = 7

/** Tak — samma siffror som briefens "Kodfakta för bygget". */
export const DEMO_QUOTE_LIMITS = {
  perPhonePerDay: 3,
  perIpPerHour: 5,
  globalPerDay: 200,
} as const

/**
 * Raderna ex moms. Delsumma 62 000, moms 15 500, totalt 77 500 — siffrorna
 * ur designen. ROT räknas på RIKTIGT (30 % av arbetskostnaden inkl. moms,
 * lib/rot-rut.ts) — inte designens illustrativa belopp. Arbetsdelen per rad
 * är satt så avdraget blir 13 500 kr → kunden betalar 64 000 kr.
 */
export const DEMO_QUOTE_ITEMS: CanonicalQuoteItem[] = [
  { description: 'Rivning och bortforsling', quantity: 1, unit: 'st', unit_price: 8000, item_type: 'item', is_rot_eligible: true, rot_rut_type: 'rot', labor_amount: 8000, material_amount: 0 },
  { description: 'VVS — nya rör och blandare', quantity: 1, unit: 'st', unit_price: 18000, item_type: 'item', is_rot_eligible: true, rot_rut_type: 'rot', labor_amount: 10000, material_amount: 8000 },
  { description: 'Kakel och klinker inkl. material', quantity: 1, unit: 'st', unit_price: 26000, item_type: 'item', is_rot_eligible: true, rot_rut_type: 'rot', labor_amount: 12000, material_amount: 14000 },
  { description: 'El — belysning och golvvärme', quantity: 1, unit: 'st', unit_price: 10000, item_type: 'item', is_rot_eligible: true, rot_rut_type: 'rot', labor_amount: 6000, material_amount: 4000 },
]

export function demoQuoteTotals(vatRate = 25) {
  const subtotal = DEMO_QUOTE_ITEMS.reduce((s, r) => s + (r.quantity ?? 0) * (r.unit_price ?? 0), 0)
  const vat = Math.round(subtotal * (vatRate / 100) * 100) / 100
  const total = subtotal + vat
  const rotWorkCost = DEMO_QUOTE_ITEMS.reduce((s, r) => s + (r.labor_amount ?? 0), 0)
  const rotDeduction = Math.round(rotRutDeductionInclVat('rot', rotWorkCost, { vatRate }))
  return { subtotal, vat, total, rotWorkCost, rotDeduction, customerPays: total - rotDeduction }
}

export function arDemoOffertForetag(businessId: string | null | undefined): boolean {
  return businessId === DEMO_QUOTE_BUSINESS_ID
}

/** Feltexterna ur designen — landningen visar dem ordagrant. */
export const DEMO_QUOTE_ERRORS = {
  name: 'Skriv ditt namn (bokstäver, max 40 tecken).',
  phone: 'Skriv ett svenskt mobilnummer, t.ex. 070-123 45 67.',
  firm: 'Företagsnamnet får vara max 40 tecken.',
  perPhone: 'Du har redan fått tre offerter i dag — kolla SMS:en.',
  perIp: 'För många försök just nu. Prova igen om en stund.',
  global: 'Vi kunde inte skicka just nu. Prova igen om en stund eller Boka en genomgång.',
  send: 'Vi kunde inte skicka just nu. Prova igen om en stund eller Boka en genomgång.',
} as const

/** Namn: bokstäver (alla skrifter), mellanslag, bindestreck, apostrof; 1–40 tecken. */
const NAME_RE = /^\p{L}[\p{L} '\-]{0,39}$/u
export function arGiltigtDemoNamn(name: string): boolean {
  return NAME_RE.test(name)
}

/** E.164 +467xxxxxxxx — bara mobilnummer får en SMS-offert. */
export function arSvensktMobilnummer(e164: string): boolean {
  return /^\+467\d{8}$/.test(e164)
}

/**
 * CORS för landningssidan (eget repo, eget origin). Bara handymate.se —
 * plus localhost utanför produktion så blocket kan provköras lokalt.
 */
const ALLOWED_ORIGINS = new Set([
  'https://handymate.se',
  'https://www.handymate.se',
  ...(process.env.NODE_ENV !== 'production'
    ? ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5500', 'http://localhost:8080']
    : []),
])

export function demoCorsHeaders(request: { headers: Pick<Headers, 'get'> }): Record<string, string> {
  const origin = request.headers.get('origin') || ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://handymate.se',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

/** Landningssidan — efteråt-vyn öppnas med token i URL:en. */
export function demoLandingUrl(signToken: string): string {
  const base = (process.env.NEXT_PUBLIC_LANDING_URL || 'https://handymate.se').replace(/\/$/, '')
  return `${base}/?demo=${encodeURIComponent(signToken)}#demo-offert`
}
