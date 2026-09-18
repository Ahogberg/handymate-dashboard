import type { SupabaseClient } from '@supabase/supabase-js'
import { findCustomerByPhone, phoneCandidates } from '@/lib/voice/find-customer-by-phone'

/**
 * EN identitetsläsare (kundminne pass 2, spår 6 — 2026-09-18).
 *
 * Samma person hör av sig via tre kanaler och skrev sitt nummer på tre sätt:
 * "070-123 45 67" i webbformuläret, "+46701234567" från 46elks, och en
 * e-postadress med versaler i Gmail. Fram till nu läste varje kanal identiteten
 * på sitt eget sätt — rått `.eq('phone_number', from)` i SMS-vägarna (rättat i
 * spår 1), rått `.eq('email', …)` i Gmail-matcharen, och ett telefonnummer
 * jämfört mot ett KUND-ID i dealtidslinjen. Resultatet var tre bilder av samma
 * kund och en kanal som aldrig hittade någon alls.
 *
 * Den här funktionen är den enda läsning som behövs framåt. Den uppfinner
 * INGEN tredje normalisering: telefonen går genom `phoneCandidates` /
 * `findCustomerByPhone` (som i sin tur bygger på `normalizeSwedishPhone` och
 * `findCustomerDuplicates`), e-posten trimmas och gemenformas precis som
 * `findCustomerDuplicates` gör.
 *
 * FAIL-CLOSED. Pekar signalerna åt olika håll — e-posten finns på två kunder,
 * eller telefonen på en kund och e-posten på en annan — returneras
 * `ambiguous: true` UTAN id. Att gissa vilken av två personer det är vore
 * värre än att låta ärendet gå den okända vägen; samma val som tenant-grinden
 * i app/api/sms/incoming/route.ts gör när ett nummer finns hos två företag.
 *
 * Ingen ny tabell, ingen ny modell, ingen skrivning: det här är ett uppslag.
 */

/** Lead-statusar som räknas som öppna. Samma lista som Gmail-matcharen använt sedan start. */
export const AKTIVA_LEAD_STATUSAR = ['new', 'contacted', 'qualified'] as const

export interface ContactQuery {
  phone?: string | null
  email?: string | null
}

export interface ContactResolution {
  customerId?: string
  leadId?: string
  /** Vilken signal som bar träffen. `none` = ingen träff ELLER tvetydigt. */
  matchedBy: 'phone' | 'email' | 'none'
  /** Signalerna pekar åt olika håll — inget id returneras. */
  ambiguous?: boolean
}

/** Gemener + trimmat, exakt som findCustomerDuplicates jämför e-post. */
export function normalizeContactEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase()
}

const TVETYDIG: ContactResolution = { matchedBy: 'none', ambiguous: true }
const INGEN: ContactResolution = { matchedBy: 'none' }

/** Distinkta id:n i träfflistan — två rader för samma person är ingen tvetydighet. */
function distinkta(ids: (string | null | undefined)[]): string[] {
  return Array.from(new Set(ids.filter((id): id is string => !!id)))
}

export async function resolveContact(
  supabase: SupabaseClient,
  businessId: string,
  query: ContactQuery,
): Promise<ContactResolution> {
  const telefon = (query.phone || '').trim()
  const epost = normalizeContactEmail(query.email)
  const kandidater = phoneCandidates(telefon)
  if (kandidater.length === 0 && !epost) return INGEN

  // ── 1. Kund först ────────────────────────────────────────────────────────
  const kundViaTelefon = kandidater.length > 0
    ? await findCustomerByPhone(supabase, businessId, telefon)
    : null

  let kundViaEpost: string[] = []
  if (epost) {
    const { data, error } = await supabase
      .from('customer')
      .select('customer_id, email')
      .eq('business_id', businessId)
      .ilike('email', epost.replace(/[\\%_]/g, '\\$&'))
    if (error) throw new Error('Kundens identitet kunde inte slås upp säkert.')
    // ilike är redan skiftlägesokänsligt, men mönstret kan i teorin träffa
    // bredare än vi vill — jämförelsen görs om i JS på normaliserad form.
    kundViaEpost = distinkta(
      (data || [])
        .filter(r => normalizeContactEmail(r.email as string | null) === epost)
        .map(r => r.customer_id as string),
    )
  }

  if (kundViaEpost.length > 1) return TVETYDIG
  if (kundViaTelefon && kundViaEpost.length === 1 && kundViaTelefon.customer_id !== kundViaEpost[0]) {
    // Numret hör till en kund, adressen till en annan. Vem som helst av dem
    // vore en gissning.
    return TVETYDIG
  }
  if (kundViaTelefon) return { customerId: kundViaTelefon.customer_id, matchedBy: 'phone' }
  if (kundViaEpost.length === 1) return { customerId: kundViaEpost[0], matchedBy: 'email' }

  // ── 2. Sedan öppna leads ─────────────────────────────────────────────────
  const leadViaTelefon = kandidater.length > 0
    ? await hittaLeads(supabase, businessId, q => q.in('phone', kandidater))
    : []
  const leadViaEpost = epost
    ? (await hittaLeads(supabase, businessId, q => q.ilike('email', epost.replace(/[\\%_]/g, '\\$&'))))
        .filter(l => normalizeContactEmail(l.email) === epost)
    : []

  const telefonIds = distinkta(leadViaTelefon.map(l => l.lead_id))
  const epostIds = distinkta(leadViaEpost.map(l => l.lead_id))
  if (telefonIds.length > 1 || epostIds.length > 1) return TVETYDIG
  if (telefonIds.length === 1 && epostIds.length === 1 && telefonIds[0] !== epostIds[0]) return TVETYDIG

  const träff = leadViaTelefon[0] || leadViaEpost[0]
  if (!träff) return INGEN
  return {
    leadId: träff.lead_id,
    // En lead som redan konverterats bär kundens id — då är kunden svaret.
    ...(träff.customer_id ? { customerId: träff.customer_id } : {}),
    matchedBy: telefonIds.length === 1 ? 'phone' : 'email',
  }
}

interface LeadRad {
  lead_id: string
  email: string | null
  customer_id: string | null
}

async function hittaLeads(
  supabase: SupabaseClient,
  businessId: string,
  filter: (q: any) => any,
): Promise<LeadRad[]> {
  const bas = supabase
    .from('leads')
    .select('lead_id, email, customer_id')
    .eq('business_id', businessId)
    .in('status', AKTIVA_LEAD_STATUSAR as unknown as string[])
  const { data, error } = await filter(bas)
  if (error) throw new Error('Förfrågans identitet kunde inte slås upp säkert.')
  return (data || []) as LeadRad[]
}
