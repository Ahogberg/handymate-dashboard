/**
 * Erbjudandet blir data — spår 3, 2026-09-18.
 *
 * ═══ VARFÖR ═══
 *
 * Slot-SMS:et ("Vi kan komma: 1) … Svara med numret som passar bäst") skickas
 * när hantverkaren godkänner ett `propose_booking_times`-kort. Tiderna fanns
 * efteråt bara som en frusen payload på det kortet — utan förfallotid, utan
 * status, och utan något uppslag på kundens telefonnummer. När kunden svarade
 * "2" gick svaret därför den vanliga intent-vägen och blev ett kort till: ett
 * löfte vi själva bett om, som ingen kunde lösa in.
 *
 * Den här modulen äger tabellen `booking_offer` (sql/v262): ETT SMS med tider
 * = EN rad. Raden är det svaret matchas mot (lib/bookings/svar-pa-erbjudande.ts).
 *
 * ═══ INGEN AUTONOMI HÄR ═══
 *
 * Raden säger bara vad vi erbjöd och (senare) vad kunden valde. Bokningen
 * skapas först när hantverkaren trycker på kortet — `create_booking` är
 * ALDRIG autonom (tasks/earned-autonomy-spec.md).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'

/** En erbjuden tid, i samma ordning som numren i SMS:et. */
export interface ErbjudenSlot {
  start: string
  end: string
  label: string
  assigned_user_id?: string | null
}

export interface BookingOffer {
  id: string
  business_id: string
  customer_id: string | null
  lead_id: string | null
  phone_e164: string
  slots: ErbjudenSlot[]
  source_approval_id: string | null
  parent_offer_id: string | null
  status: 'open' | 'accepted' | 'expired' | 'superseded'
  chosen_slot: ErbjudenSlot | null
  expires_at: string
  resulting_approval_id: string | null
  resulting_booking_id: string | null
}

/** Så länge ett erbjudande gäller. Två dygn: längre än så är tiden i kalendern
 *  ändå sällan kvar, och ett svar efter det ska gå den vanliga vägen. */
export const ERBJUDANDE_TIMMAR = 48

/**
 * Erbjudandets id härleds ur kortet som skickade SMS:et. Deterministiskt, så
 * ett omkört godkännande (46elks-retry, dubbelklick) ger SAMMA id och därmed
 * samma rad — inte två öppna erbjudanden på samma tider.
 */
export function erbjudandeId(sourceApprovalId: string): string {
  return 'boff_' + createHash('sha256').update(sourceApprovalId).digest('hex').slice(0, 24)
}

/** Städar slotslistan. Ogiltiga tider kastas — vi lagrar aldrig ett erbjudande vi inte kan matcha mot. */
export function rensaSlots(value: unknown): ErbjudenSlot[] {
  if (!Array.isArray(value)) return []
  const ut: ErbjudenSlot[] = []
  for (const slot of value.slice(0, 3)) {
    const s: any = slot
    if (!s || typeof s.start !== 'string' || typeof s.end !== 'string') continue
    if (!Number.isFinite(Date.parse(s.start)) || !Number.isFinite(Date.parse(s.end))) continue
    if (Date.parse(s.end) <= Date.parse(s.start)) continue
    ut.push({
      start: s.start,
      end: s.end,
      label: typeof s.label === 'string' ? s.label : '',
      assigned_user_id: typeof s.assigned_user_id === 'string' ? s.assigned_user_id : null,
    })
  }
  return ut
}

/**
 * Skriver erbjudandet EFTER att SMS:et gått iväg. Kastar aldrig: SMS:et är
 * redan hos kunden, och ett misslyckat radskrivande får inte visa kortet som
 * "utförandet misslyckades". Konsekvensen av ett fel är att svaret går den
 * vanliga intent-vägen — alltså dagens beteende, inget värre.
 */
export async function skapaErbjudande(
  supabase: SupabaseClient,
  input: {
    businessId: string
    sourceApprovalId: string
    phone: string
    slots: unknown
    customerId?: string | null
    leadId?: string | null
    parentOfferId?: string | null
    nu?: Date
  },
): Promise<{ id: string } | null> {
  try {
    const slots = rensaSlots(input.slots)
    if (!slots.length) return null
    const phone = normalizeSwedishPhone(input.phone) || input.phone
    if (!phone) return null
    const nu = input.nu ?? new Date()
    const id = erbjudandeId(input.sourceApprovalId)

    const { error } = await supabase.from('booking_offer').insert({
      id,
      business_id: input.businessId,
      customer_id: input.customerId ?? null,
      lead_id: input.leadId ?? null,
      phone_e164: phone,
      slots,
      source_approval_id: input.sourceApprovalId,
      parent_offer_id: input.parentOfferId ?? null,
      status: 'open',
      expires_at: new Date(nu.getTime() + ERBJUDANDE_TIMMAR * 60 * 60 * 1000).toISOString(),
      created_at: nu.toISOString(),
    })
    if (error) {
      // Unik nyckel på (business_id, source_approval_id) = kortet har redan
      // gett ett erbjudande. Det är ett lyckat utfall, inte ett fel.
      if ((error as any).code === '23505') return { id }
      console.error('[bookings/erbjudande] erbjudandet kunde inte sparas:', error.message)
      return null
    }
    return { id }
  } catch (err) {
    console.error('[bookings/erbjudande] oväntat fel (sväljs — SMS:et är redan skickat):', err)
    return null
  }
}
