import type { OnboardingFormData } from '@/app/onboarding/types-redesign'

/**
 * Säljgenomgången — den rena delen (2026-09-12, Andreas).
 *
 * Handymate Sales Experience bygger en personlig genomgång tillsammans med
 * kunden i mötet: org.nr-uppslag, deras siffror, deras smärtpunkt, ett
 * business case och en rekommendation. Sedan skickas den som en personlig
 * länk, och CTA:n "Kom igång" ska ta kunden in i onboardingen med det vi
 * redan vet ifyllt.
 *
 * ═══ VARFÖR EN SERVERRAD OCH INTE localStorage ═══
 *
 * Prototypen sparade caset under `hm_sales_case` i localStorage. Det bär
 * inte den överlämning som räknas: localStorage är per origin OCH per
 * webbläsare. Säljarens browser har caset, kundens har det inte. Öppnar
 * prospektet sin personliga länk på sin egen dator får de demodatan.
 * Därför en rad i `sales_case` med en token i länken (v231), samma mönster
 * som kundportalen (lib/portal-link.ts).
 *
 * Den här filen gör ingen I/O. Formen på payloaden ägs av Sales Experience,
 * och tolkas därför DEFENSIVT här — allt är valfritt, inget fält antas, och
 * ett okänt värde ger `undefined` i stället för en gissning.
 *
 * ═══ GRÄNSEN SOM INTE FÅR FLYTTAS ═══
 *
 * Caset FÖRIFYLLER fält. Det hoppar aldrig över ett steg. Step2Business
 * skapar fortfarande kontot, StepGenomgang kör fortfarande genomgången av
 * kundens egna siffror, Step5Activate tar fortfarande betalningen. Beslutet
 * från 2026-09-02 (tasks/plan-genomgang-fore-betalning.md) står: kunden
 * betalar för något de själva sett i sina egna siffror, och ingen
 * prova-på-väg förbi det. En säljgenomgång är vår bild av kunden — inte
 * kundens egen data ur deras eget system.
 */

/** 90 dagar — länken ska gå att öppna "när ni vill", men inte för alltid. */
export const SALES_CASE_TTL_DAGAR = 90

/**
 * Payloaden som Sales Experience skickar. MEDVETET lös: fälten speglar
 * `casePayload()` i säljsidan, och sidan ägs av design-kanvasen — den kan
 * växa utan att den här filen går sönder. Bara det vi faktiskt läser är
 * typat.
 */
export interface SalesCasePayload {
  company?: {
    name?: string
    short?: string
    org?: string
    sni?: string
    seat?: string
    form?: string
    address?: string
    addressStreet?: string
    addressPostalCode?: string
    addressCity?: string
  }
  told?: Array<{ v?: string; l?: string }>
  focusTitle?: string
  steps?: unknown
  agents?: unknown
  roi?: Record<string, unknown> | null
  pkg?: { name?: string; monthly?: string }
  goal?: { name?: string; quote?: string }
  meeting?: { date?: string; iso?: string }
  prospect?: { name?: string; email?: string }
  raw?: Record<string, unknown>
}

/** Det som inte har någon plats i OnboardingFormData men ska följa med in i kontot. */
export interface SalesCaseExtras {
  token: string
  /** Kundens mål med Handymate, ordagrant ur genomgången. Följs upp på 30/60/90 dagar. */
  mal?: string
  malCitat?: string
  /** Smärtpunkten kunden valde att lösa först. */
  fokus?: string
  /** Rekommenderat paket ur genomgången — ett förslag, aldrig en låsning i betalsteget. */
  rekommenderatPaket?: string
  /** Antal personer och jobb/månad som kunden själv uppgav. */
  personer?: number
  jobbPerManad?: string
  /** Mötesdatum, så uppföljningen vet när bilden togs. */
  motesdatum?: string
  /** Hela genomgången, orörd — så inget går förlorat även om fälten ovan ändras. */
  genomgang: SalesCasePayload
}

export interface SalesCasePrefill {
  /** Fält som förifylls i onboardingen. Bara fält som FINNS i OnboardingFormData. */
  form: Partial<OnboardingFormData>
  extras: SalesCaseExtras
}

/** Ren. Utgången om expires_at har passerat. Saknat/ogiltigt datum räknas som utgånget — hellre neka än släppa igenom en rad vi inte kan bedöma. */
export function arUtgangen(expiresAt: string | null | undefined, nuMs: number): boolean {
  if (!expiresAt) return true
  const ms = new Date(expiresAt).getTime()
  if (Number.isNaN(ms)) return true
  return ms <= nuMs
}

/**
 * SNI → bransch. MEDVETET kort och konservativ.
 *
 * Branschen styr hela artikelbanken, offertmallarna och checklistorna
 * (lib/seed-defaults.ts). En gissning som blir fel är därför sämre än
 * ingen gissning: kunden får en halv artikelbank för ett helt jobb.
 * Därför bara koder som entydigt pekar på EN bransch i TRADES — allt
 * annat ger undefined, och Step2 visar sitt vanliga val.
 *
 * Koderna är SNI 2007. Prefixmatchning på fyra siffror, utom 43341
 * (måleri) där femte siffran skiljer måleri från glasmästeri.
 */
const SNI_TILL_BRANSCH: Array<{ prefix: string; trade: string }> = [
  { prefix: '43341', trade: 'painter' },        // Måleriarbeten (43342 = glasmästeri, inte måleri)
  { prefix: '4321', trade: 'electrician' },     // Elinstallationer
  { prefix: '4322', trade: 'plumber' },         // Värme, sanitet, ventilation
  { prefix: '4391', trade: 'roofing' },         // Takarbeten
  { prefix: '4311', trade: 'groundworks' },     // Rivning
  { prefix: '4312', trade: 'groundworks' },     // Mark- och grundarbeten
  { prefix: '4120', trade: 'construction' },    // Byggande av hus
  { prefix: '4332', trade: 'construction' },    // Byggnadssnickeriarbeten
  { prefix: '4333', trade: 'construction' },    // Golv- och väggbeläggning
  { prefix: '4399', trade: 'construction' },    // Andra specialiserade byggarbeten
]

/** Ren. Returnerar ett TRADES-id, eller undefined när koden inte entydigt pekar på en bransch. */
export function branschFranSni(sni: string | null | undefined): string | undefined {
  if (!sni) return undefined
  // Sales Experience skickar "43210 — Elinstallationer"; bara siffrorna betyder något.
  const siffror = sni.replace(/\D/g, '')
  if (!siffror) return undefined
  // Längsta prefix först, så 43341 vinner över 4334 om någon lägger till det.
  const sorterad = [...SNI_TILL_BRANSCH].sort((a, b) => b.prefix.length - a.prefix.length)
  for (const rad of sorterad) {
    if (siffror.startsWith(rad.prefix)) return rad.trade
  }
  return undefined
}

/** Ren. Plockar ut ett heltal ur ett fält som kan vara tal, sträng eller skräp. */
function heltal(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v)
  if (typeof v === 'string') {
    const n = parseInt(v.replace(/\D/g, ''), 10)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/** Ren. Trimmar och ger undefined för tomt — aldrig tomma strängar in i formuläret. */
function text(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t.length > 0 ? t : undefined
}

/**
 * Ren. Bygger förifyllningen ur en säljgenomgång.
 *
 * Sätter BARA fält som finns i OnboardingFormData. Adressen kommer från
 * Bolagsverket-uppslaget i säljsidan om det gjorts; annars lämnas den tom
 * och onboardingens eget uppslag (Step2Business) gör jobbet igen.
 *
 * Sätter ALDRIG e-post eller lösenord. Prospektets e-post i genomgången är
 * dit LÄNKEN skickades — inte nödvändigtvis den som ska äga kontot, och ett
 * förifyllt kontomejl som är fel är värre än ett tomt fält.
 */
export function prefillFranCase(token: string, payload: SalesCasePayload | null | undefined): SalesCasePrefill {
  const p = payload ?? {}
  const c = p.company ?? {}
  const raw = (p.raw ?? {}) as Record<string, unknown>
  const rawCompany = (raw.company ?? {}) as Record<string, unknown>

  const form: Partial<OnboardingFormData> = {}

  const namn = text(c.name)
  if (namn) form.companyName = namn

  const org = text(c.org)
  if (org) form.orgNumber = org

  const bolagsform = text(c.form) ?? text(rawCompany.form)
  if (bolagsform) form.companyForm = bolagsform

  // Adressfälten: säljsidan har i dag en enda adressrad (`address`). Vi
  // delar den ALDRIG isär med gissningar — antingen finns de tre separata
  // fälten, eller så lämnas adressen till onboardingens eget uppslag.
  const gata = text(c.addressStreet)
  const postnr = text(c.addressPostalCode)
  const ort = text(c.addressCity)
  if (gata) form.addressStreet = gata
  if (postnr) form.addressPostalCode = postnr
  if (ort) form.addressCity = ort

  const bransch = branschFranSni(c.sni)
  if (bransch) form.trade = bransch

  const sate = text(c.seat)
  if (sate) form.area = sate

  // Ur `told`-korten: "14 personer" / "50–100 jobb". Formen ägs av
  // säljsidan, så läs hellre `raw` när det finns — det är källvärdena.
  const personer = heltal(raw.employees)
  const jobb = text(raw.jobs) ?? text((p.told ?? []).find(t => /jobb/i.test(t.l ?? ''))?.v)

  const extras: SalesCaseExtras = {
    token,
    mal: text(p.goal?.name),
    malCitat: text(p.goal?.quote),
    fokus: text(p.focusTitle),
    rekommenderatPaket: text(p.pkg?.name),
    personer,
    jobbPerManad: jobb,
    motesdatum: text(p.meeting?.iso) ?? text(p.meeting?.date),
    genomgang: p,
  }

  return { form, extras }
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

/** Den personliga länken till genomgången. */
export function byggCaseLank(token: string): string {
  return `${APP_URL}/case/${token}`
}

/** Länken som tar kunden in i onboardingen med genomgången ifylld. */
export function byggOnboardingLank(token: string): string {
  return `${APP_URL}/onboarding?case=${encodeURIComponent(token)}`
}
