import type { FirstFocusId } from '@/lib/onboarding/first-focus'
import type { FirstQuoteSelection } from '@/lib/quotes/job-type-setup'
/**
 * Delad form-state för det nya onboarding-flödet (Claude Design redesign).
 * Hanterar både pre-registrerings-state (Step 2 skapar kontot) och
 * post-registrerings-state (resten av flödet uppdaterar business_config).
 */

export interface OnboardingFormData {
  // ── Step 2: Företaget + konto ────────────────────────────
  companyName?: string
  trade?: string
  /**
   * Ytterligare branscher utöver huvudbranschen (v93). Verkligheten är sällan
   * en bransch — Bee arbetar både som elektriker och med bygg — och med bara
   * en får han en halv artikelbank för ett helt jobb.
   */
  secondaryTrades?: string[]
  // Skatterytmen (momsperiod/arbetsgivare/räkenskapsår) frågas inte längre i
  // onboardingen (Lager 3 / B10, 2026-08-27) — Karin ber om den i
  // bolagskalendern → Bolagsprofil när hon behöver den.
  orgNumber?: string
  fSkatt?: boolean
  area?: string
  logoDataUrl?: string
  /**
   * Bolagsverket-uppslag (2026-08-15) — org.nr flyttat till start av
   * Step2Business. Frivilliga: uppslaget kan misslyckas (API nere, inga
   * credentials än, okänt org.nr) utan att blockera onboarding — då förblir
   * de här tomma och användaren fyller i manuellt precis som innan.
   */
  companyForm?: string
  addressStreet?: string
  addressPostalCode?: string
  addressCity?: string

  // Betalmottagare (krävs för fakturor — TD-27 pre-flight)
  paymentMethod?: 'bankgiro' | 'plusgiro' | 'bankAccount'
  paymentNumber?: string

  // Account creation (pre-registration)
  contactName?: string
  email?: string
  phone?: string  // Privat mobilnummer
  password?: string

  // Sätts efter framgångsrik registrering
  businessId?: string
  emailPending?: boolean

  // ── Step 3: Så jobbar du ─────────────────────────────────
  specialties?: string[]
  days?: boolean[]   // 7 booleans, mån-sön
  startHour?: number
  endHour?: number
  priceMin?: number
  priceMax?: number
  /** Materialpåslag i % (Prisslingan V2, beslut 4) — företagets EGET påslag,
      förifyllt 20 som förslag i steg 3. Appliceras i fakturakedjan (pass 5). */
  materialMarkup?: number
  // Intern timkostnad frågas inte längre här (Lager 3 / B10) — Lars ber om
  // den i projektekonomin när ett marginalunderlag ska bedömas.
  /**
   * "Vad vill du att teamet hjälper dig med först?" (Lager 3 / B6, 2026-08-27).
   * Ersatte årsomsättnings-/marginalmålet som onboardingfråga — de sätts i
   * Inställningar → Ekonomi. Frivilligt: undefined = hoppade över. Sparas i
   * onboarding_data (JSONB) via sanitizeForSave, ingen egen kolumn.
   */
  firstFocus?: FirstFocusId

  // ── Step 4: Telefonnummer ────────────────────────────────
  lisaNumber?: string
  phoneMode?: 'forward' | 'primary'

  // ── Step 5: Aktivera ─────────────────────────────────────
  plan?: string  // 'starter' | 'professional' | 'business'
  /**
   * Lanseringserbjudandet "Grundarkunderna" (Andreas-beslut 2026-08-19) —
   * server-härlett i GET /api/onboarding (lib/billing/founders-offer.ts),
   * ALDRIG en klientsidan-gissning. undefined/false = ingen banner.
   */
  foundersAvailable?: boolean

  // ── Steg 6: Hämta in verksamhet (import) ─────────────────
  // Antal importerade rader — LiveTour kan visa dem som payoff (state E).
  importedCustomers?: number
  importedInvoices?: number

  // Epic 2: preferenser i befintliga onboarding_data, aldrig offertbelopp.
  quoteJobTypes?: string[]
  firstQuoteSelection?: FirstQuoteSelection | null

  // ── Hemsida-förgreningen (fråga i Step2Business, direkt efter att
  //    kontot skapats) ──────────────────────────────────────────────
  // undefined = inte frågad än (resume ska visa frågan igen).
  // true  = kunden har en egen sajt (websiteUrl satt).
  // false = kunden har ingen sajt (websiteUrl lämnas tom, microsajt-vägen).
  hasWebsite?: boolean
  websiteUrl?: string
}
