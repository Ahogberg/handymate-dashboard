/**
 * Delad form-state för det nya onboarding-flödet (Claude Design redesign).
 * Hanterar både pre-registrerings-state (Step 2 skapar kontot) och
 * post-registrerings-state (resten av flödet uppdaterar business_config).
 */

export interface OnboardingFormData {
  // ── Step 2: Företaget + konto ────────────────────────────
  companyName?: string
  trade?: string
  orgNumber?: string
  fSkatt?: boolean
  area?: string
  logoDataUrl?: string

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

  // ── Step 4: Telefonnummer ────────────────────────────────
  lisaNumber?: string
  phoneMode?: 'forward' | 'primary'

  // ── Step 5: Aktivera ─────────────────────────────────────
  plan?: string  // 'starter' | 'professional' | 'business'

  // ── Steg 6: Hämta in verksamhet (import) ─────────────────
  // Antal importerade rader — LiveTour kan visa dem som payoff (state E).
  importedCustomers?: number
  importedInvoices?: number
}
