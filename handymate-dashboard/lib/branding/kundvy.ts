/**
 * "Så ser dina kunder dig" — ren logik för inställningssidan
 * (app/dashboard/settings/kundvy). Ingen Supabase, ingen React.
 *
 * Sidan visar företagets varumärke genom hela kundresan i sju kontaktpunkter.
 * Allt renderas med EXEMPELDATA (Anna Lindqvist / Badrumsrenovering) så att
 * förhandsvisningen är stabil, tydligt markerad och aldrig läcker en riktig
 * kunds siffror. Mailen byggs av samma byggare som sändvägarna använder —
 * det ägaren ser här är det kunden får.
 *
 * ROT-avdraget är ALLTID preliminärt i alla texter (sanningsregeln).
 */
import { buildSmsSuffix } from '@/lib/sms-reply-number'
import { buildReviewRequestMessage } from '@/lib/notifications/review-request-message'
import { DEFAULT_ACCENT_COLOR, normalizeAccentColor } from '@/lib/branding/get-branding'

// ── Exempeldata ────────────────────────────────────────────────────────
// Designbriefen (docs/design/briefs/07-sa-ser-dina-kunder-dig.md): en kund
// och ett jobb som återkommer i alla sju kontaktpunkter.

export const EXEMPEL = {
  kund: { namn: 'Anna Lindqvist', adress: 'Sjövägen 4', epost: 'anna@exempel.se' },
  offert: {
    nummer: 'OF-2026-0142',
    titel: 'Badrumsrenovering Sjövägen 4',
    beskrivning: 'Rivning av befintligt badrum, nytt tätskikt, kakel och klinker enligt genomgång, ny golvvärme och montering av inredning.',
    total: 84500,
    rotAvdrag: 18000,
    kundBetalar: 66500,
    giltigTill: '2026-10-05',
  },
  bokning: { dag: 'fredag 12 september', tid: '07:30' },
  faktura: {
    nummer: 'F-1023',
    delsumma: 67600,
    momssats: 25,
    moms: 16900,
    total: 84500,
    attBetala: 66500,
    ocr: '10230017',
    forfaller: '2026-10-19',
  },
  dagbok: { dag: 'Fredag 12 september', text: 'Kakel klart, fog imorgon' },
} as const

// ── Accentfärg ─────────────────────────────────────────────────────────

/** Sex färdiga färger — teal (standard), marin, skogsgrön, plommon, bärnsten, skiffer. */
export const ACCENT_PRESETS: ReadonlyArray<{ hex: string; namn: string }> = [
  { hex: DEFAULT_ACCENT_COLOR, namn: 'Teal' },
  { hex: '#1E3A8A', namn: 'Marin' },
  { hex: '#166534', namn: 'Skog' },
  { hex: '#6B21A8', namn: 'Plommon' },
  { hex: '#B45309', namn: 'Bärnsten' },
  { hex: '#334155', namn: 'Skiffer' },
]

function kanal(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** Relativ luminans enligt WCAG 2.x för en #rrggbb-färg. */
export function relativeLuminance(hex: string): number {
  const h = normalizeAccentColor(hex).slice(1)
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b)
}

/** Kontrastförhållande mot vit text (knappar och sidhuvud bär vit text på accenten). */
export function contrastVsWhite(hex: string): number {
  const l = relativeLuminance(hex)
  return (1 + 0.05) / (l + 0.05)
}

/**
 * Varning när vit text på accenten blir svårläst. 4,5:1 är WCAG AA för
 * brödtext — knapptexten i mailen är 15 px, så under det säger vi ifrån;
 * vi förbjuder inget (designen: amber-tips, aldrig blockerande).
 */
export function accentVarning(hex: string): string | null {
  const ratio = contrastVsWhite(hex)
  if (ratio >= 4.5) return null
  return 'Vit text blir svår att läsa på den här färgen. Knappar kan bli otydliga för kunden. Vill du prova en mörkare ton?'
}

/** "#0f766e" / "0F766E" / " #0F766E " → "#0F766E", annars null. */
export function parseHexInput(value: string): string | null {
  const v = value.trim().replace(/^#?/, '#').toUpperCase()
  return /^#[0-9A-F]{6}$/.test(v) ? v : null
}

// ── Kontaktpunkterna ───────────────────────────────────────────────────

export type TouchpointKind = 'email' | 'sms' | 'page'

export interface Touchpoint {
  id: TouchpointId
  nr: number
  titel: string
  /** Var i kundresan — står under kortet. */
  under: string
  kind: TouchpointKind
  /** Modalens underrubrik ("Så ser Anna Lindqvist …"). */
  modalSub: string
}

export type TouchpointId =
  | 'offertmail'
  | 'offertsida'
  | 'bokning'
  | 'portal'
  | 'jobbpass'
  | 'faktura'
  | 'omdome'

/**
 * Sju kontaktpunkter i den ordning kunden möter dem. Punkt 3 och 7 är SMS
 * på riktigt (bokningsbekräftelsen går via 46elks, omdömesförfrågan skickas
 * av cron/review-requests som SMS) — designen skissade 7 som ett personligt
 * mail, men vi visar det kunden faktiskt får.
 */
export const KUNDVY_TOUCHPOINTS: ReadonlyArray<Touchpoint> = [
  { id: 'offertmail', nr: 1, titel: 'Offertmailet', under: 'Första kontakten i inkorgen', kind: 'email', modalSub: `Så ser ${EXEMPEL.kund.namn} offerten i sin inkorg` },
  { id: 'offertsida', nr: 2, titel: 'Offertsidan', under: 'Där kunden godkänner, i mobilen', kind: 'page', modalSub: `Så ser ${EXEMPEL.kund.namn} offerten i sin mobil` },
  { id: 'bokning', nr: 3, titel: 'Bokningsbekräftelsen', under: 'SMS med din signatur', kind: 'sms', modalSub: `SMS:et ${EXEMPEL.kund.namn} får när tiden är bokad` },
  { id: 'portal', nr: 4, titel: 'Kundportalen', under: 'Allt om jobbet på ett ställe', kind: 'page', modalSub: `Så ser ${EXEMPEL.kund.namn} sitt jobb i portalen` },
  { id: 'jobbpass', nr: 5, titel: 'Jobbpasset', under: '"Ditt hem" med foton från dagen', kind: 'page', modalSub: `Så följer ${EXEMPEL.kund.namn} jobbet dag för dag` },
  { id: 'faktura', nr: 6, titel: 'Fakturan', under: 'Mail med PDF och Swish', kind: 'email', modalSub: `Så ser ${EXEMPEL.kund.namn} fakturan i sin inkorg` },
  { id: 'omdome', nr: 7, titel: 'Omdömesförfrågan', under: 'SMS efter betalning', kind: 'sms', modalSub: `SMS:et ${EXEMPEL.kund.namn} får när jobbet är betalt` },
]

// ── SMS-texterna — samma byggare som sändvägarna ───────────────────────

/** Signaturen som avslutar alla SMS: "//Ekström Bygg" (härledd ur firmanamnet, ingen egen kolumn). */
export function smsSignatur(businessName: string): string {
  return buildSmsSuffix(businessName)
}

/** Bokningsbekräftelsen — exakt texten i app/api/actions/route.ts, med exempeldata. */
export function bokningSms(businessName: string): string {
  const fornamn = EXEMPEL.kund.namn.split(' ')[0]
  return `Hej ${fornamn}! Din tid hos ${businessName} är bokad: ${EXEMPEL.bokning.dag} kl ${EXEMPEL.bokning.tid}. Välkommen! Behöver du ändra tiden?\n${buildSmsSuffix(businessName)}`
}

/** Omdömesförfrågan — buildReviewRequestMessage (cron/review-requests), med exempeldata. */
export function omdomeSms(businessName: string, reviewUrl: string | null | undefined): string {
  return buildReviewRequestMessage({
    customerName: EXEMPEL.kund.namn,
    projectName: EXEMPEL.offert.titel,
    businessName,
    reviewUrl: reviewUrl || 'https://g.page/r/…',
  })
}

// ── Redo-mätaren ───────────────────────────────────────────────────────

export interface ReadyRow {
  id: string
  label: string
  done: boolean
  /** Det ifyllda värdet, eller vad kunden ser/missar när raden är tom. */
  value: string
  /** Åtgärdslänkens text när raden är tom. */
  action?: string
  /** Var det fylls i. Saknas när fältet finns på kundvy-sidan själv. */
  href?: string
}

/** Fälten ur business_config som mätaren läser. Alla finns i tabellen. */
export interface ReadySource {
  logo_url?: string | null
  accent_color?: string | null
  swish_number?: string | null
  bankgiro?: string | null
  org_number?: string | null
  public_phone?: string | null
  phone_number?: string | null
  contact_email?: string | null
  google_review_url?: string | null
}

const fylld = (v: string | null | undefined) => Boolean((v ?? '').trim())
const trimmad = (v: string | null | undefined) => (v ?? '').trim()

/** Filnamnet ur en lagrings-URL — "…/biz_x/logo.png?t=1" → "logo.png". */
function filnamn(url: string): string {
  try {
    const path = new URL(url).pathname
    return decodeURIComponent(path.split('/').pop() || '') || 'Uppladdad'
  } catch {
    return url.split('/').pop()?.split('?')[0] || 'Uppladdad'
  }
}

/**
 * Sju rader — det kunden ser och det kunden behöver för att kunna betala.
 * Accentfärgen är alltid på plats: standardfärgen är också en färg kunden
 * ser (designen: "Teal (standard)" med grön bock).
 */
export function readyRows(cfg: ReadySource): ReadyRow[] {
  const accent = normalizeAccentColor(cfg.accent_color)
  const egenAccent = fylld(cfg.accent_color) && accent.toUpperCase() !== DEFAULT_ACCENT_COLOR.toUpperCase()
  const telefon = trimmad(cfg.public_phone) || trimmad(cfg.phone_number)
  const epost = trimmad(cfg.contact_email)
  const kontakt = [epost, telefon].filter(Boolean).join(' · ')
  return [
    { id: 'logo', label: 'Logotyp', done: fylld(cfg.logo_url), value: fylld(cfg.logo_url) ? filnamn(trimmad(cfg.logo_url)) : 'Visas som text tills du laddat upp', action: 'Ladda upp' },
    { id: 'accent', label: 'Accentfärg', done: true, value: egenAccent ? `Egen färg ${accent.toUpperCase()}` : 'Teal (standard)' },
    { id: 'swish', label: 'Swish-nummer', done: fylld(cfg.swish_number), value: fylld(cfg.swish_number) ? trimmad(cfg.swish_number) : 'Syns på fakturan', action: 'Lägg till', href: '/dashboard/settings?tab=invoice' },
    { id: 'bankgiro', label: 'Bankgiro', done: fylld(cfg.bankgiro), value: fylld(cfg.bankgiro) ? trimmad(cfg.bankgiro) : 'Syns på fakturan', action: 'Lägg till', href: '/dashboard/settings?tab=invoice' },
    { id: 'orgnr', label: 'Org.nr', done: fylld(cfg.org_number), value: fylld(cfg.org_number) ? trimmad(cfg.org_number) : 'Står i sidfoten på alla mail', action: 'Lägg till', href: '/dashboard/settings?tab=company' },
    { id: 'kontakt', label: 'Kontaktuppgifter', done: Boolean(kontakt), value: kontakt || 'Telefon och e-post i sidfoten', action: 'Lägg till', href: '/dashboard/settings?tab=company' },
    { id: 'omdome', label: 'Google-omdömeslänk', done: fylld(cfg.google_review_url), value: fylld(cfg.google_review_url) ? 'Länk sparad' : 'Behövs för omdömesförfrågan', action: 'Klistra in länk', href: '/dashboard/settings?tab=integrations' },
  ]
}

export function readyCount(rows: ReadyRow[]): { klara: number; totalt: number } {
  return { klara: rows.filter((r) => r.done).length, totalt: rows.length }
}

// ── Förhandsvisningens kontrakt (server → klient) ──────────────────────

export interface KundvyPreview {
  id: TouchpointId
  kind: TouchpointKind
  /** Mail: ämnesraden. */
  subject?: string
  /** Mail: hela dokumentet — visas i en iframe med srcdoc. */
  html?: string
  /** SMS: texten, med radbrytningar. */
  sms?: string
  /** SMS: avsändar-ID:t kunden ser i telefonen. */
  sender?: string
}

/** Överstyrningar från sidan innan de sparats — så förhandsvisningen följer reglagen. */
export interface KundvyOverrides {
  accent_color?: string | null
  logo_url?: string | null
}
