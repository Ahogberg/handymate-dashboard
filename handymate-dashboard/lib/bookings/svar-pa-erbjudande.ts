/**
 * Svaret på tidsförslaget blir en bokning — spår 3, 2026-09-18.
 *
 * ═══ VILKET VERKLIGT FEL DETTA STÄNGER ═══
 *
 * Vi skickade "Vi kan komma: 1) … 2) … Svara med numret som passar bäst" och
 * kunden svarade "2". Svaret gick rakt in i den vanliga intent-vägen och blev
 * ett `lead_review`-kort med texten "2" — ingen bokning, ingen koppling till
 * tiderna vi själva föreslagit. Hantverkaren fick ringa upp och fråga vilken
 * tid kunden menade. `lib/approvals/booking-times-review.ts` sa det rakt ut:
 * "Kundens svar hanteras separat innan kalendern ändras". Det här ÄR det
 * separata ledet.
 *
 * ═══ INGEN MODELL ═══
 *
 * Tolkningen är ren kod: en siffra 1–3, eller en veckodag/tid som ENTYDIGT
 * pekar ut exakt en av de erbjudna tiderna. Är svaret tvetydigt matchar vi
 * ingenting och släpper igenom det till den vanliga vägen. En gissning här
 * skulle boka in fel dag hos en riktig kund.
 *
 * ═══ ETT TRYCK, INTE NOLL ═══
 *
 * Kundens svar ger ETT kort — "Anna valde tisdag 13–15 — Boka". Bokningen
 * skapas när hantverkaren trycker, och kundbekräftelsen går ut då.
 * tasks/earned-autonomy-spec.md säger att `create_booking` ALDRIG är autonom;
 * helautonom bokning på svar kräver ett eget spec-beslut och byggs inte här.
 *
 * ═══ VARFÖR KUNDEN INTE FÅR ETT KVITTO-SMS ═══
 *
 * "Tack, jag återkommer med bekräftelse" hade varit vänligt, men det är en NY
 * utskickstyp: ett automatiskt, kundvänt SMS utan kort och utan regel.
 * Lead-intake-granskningen (tasks/lead-intake-granskning-2026-08-10.md) slår
 * fast att nya utskickstyper ska gå genom approvals/regler. Kunden får i
 * stället bokningsbekräftelsen när hantverkaren trycker — ETT SMS, inte två.
 * Att avvisa kortet skickar heller INGET till kunden: "tiden gick inte att
 * bekräfta" är ett besked bara hantverkaren kan formulera, och en automatisk
 * ursäkt på en tid kunden redan valt gör mer skada än nytta.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneCandidates } from '@/lib/voice/find-customer-by-phone'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'
import { skapaKort } from '@/lib/approvals/skapa-kort'
import { rensaSlots, type BookingOffer, type ErbjudenSlot } from '@/lib/bookings/erbjudande'

export type ErbjudandeUtfall =
  /** Inget öppet erbjudande, eller svaret pekade inte entydigt på en tid. */
  | 'ingen_matchning'
  /** Tiden var ledig: erbjudandet accepterat och ett kort ligger i kön. */
  | 'accepterat'
  /** Tiden var tagen: nytt tidsförslag förberett åt hantverkaren (runda 2). */
  | 'upptagen_nytt_forslag'
  /** Tiden var tagen andra gången: ärendet går till hantverkaren, inget mer SMS. */
  | 'upptagen_till_hantverkaren'
  /** Erbjudandet var redan besvarat — andra svaret ger inget nytt kort. */
  | 'redan_besvarat'

export interface ErbjudandeSvar {
  /** true ⇒ SMS:et är hanterat här; intent-agenten och lead-kortet hoppas över. */
  hanterat: boolean
  utfall: ErbjudandeUtfall
  offerId: string | null
  kortId: string | null
  vald: ErbjudenSlot | null
}

const INGEN: ErbjudandeSvar = { hanterat: false, utfall: 'ingen_matchning', offerId: null, kortId: null, vald: null }

const VECKODAGAR: Record<string, number> = {
  söndag: 0, sondag: 0, sön: 0, son: 0,
  måndag: 1, mandag: 1, mån: 1, man: 1,
  tisdag: 2, tis: 2,
  onsdag: 3, ons: 3,
  torsdag: 4, tors: 4, tor: 4,
  fredag: 5, fre: 5,
  lördag: 6, lordag: 6, lör: 6, lor: 6,
}

/** Veckodagen en tid infaller på, i svensk tid — inte serverns UTC. */
export function veckodagFor(iso: string): number {
  const svensk = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }))
  return svensk.getDay()
}

/** Starttimmen i svensk tid. */
export function starttimmeFor(iso: string): number {
  const svensk = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }))
  return svensk.getHours()
}

/**
 * Tolkar kundens svar mot de erbjudna tiderna. Returnerar index eller null.
 * Ren funktion, ingen modell, inga sidoeffekter — och den gissar aldrig:
 * pekar svaret på två tider är svaret inte ett val.
 */
export function tolkaSvar(text: string, slots: ErbjudenSlot[]): number | null {
  const rå = (text || '').trim().toLowerCase()
  if (!rå || !slots.length) return null

  // ── 1. Siffran vi bad om ────────────────────────────────────────────
  // "2", "2)", "nr 2", "alternativ 3", "tid 1 tack". Inget annat tal får
  // finnas i texten — "tisdag 13" ska aldrig tolkas som alternativ 13, och
  // "1 eller 2" är inget val.
  const siffror = rå.match(/\d+/g) || []
  if (siffror.length === 1) {
    const kortText = rå.replace(/[^a-zåäö0-9]+/g, ' ').trim()
    const bara = /^(nr|nummer|alt|alternativ|tid|tiden|val|alternativet)?\s*(\d+)\s*(tack|passar|går bra|funkar|ok)?$/.test(kortText)
    const nummer = Number(siffror[0])
    if (bara && nummer >= 1 && nummer <= slots.length) return nummer - 1
  }

  // ── 2. Veckodag (och vid behov klockslag) ───────────────────────────
  const nämndaDagar = new Set<number>()
  for (const [ord, dag] of Object.entries(VECKODAGAR)) {
    if (new RegExp(`(^|[^a-zåäö])${ord}([^a-zåäö]|$)`).test(rå)) nämndaDagar.add(dag)
  }
  if (nämndaDagar.size !== 1) return null
  const dag = Array.from(nämndaDagar)[0]

  const träffar = slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => veckodagFor(slot.start) === dag)
  if (träffar.length === 1) return träffar[0].index
  if (träffar.length === 0) return null

  // Flera tider samma dag: klockslaget måste avgöra, annars vet vi inte.
  const timmar = (rå.match(/\b(\d{1,2})(?:[.:]\d{2})?\b/g) || [])
    .map(v => Number(v.replace(/[.:]\d{2}$/, '')))
    .filter(v => v >= 0 && v <= 23)
  const medTimme = träffar.filter(({ slot }) => timmar.includes(starttimmeFor(slot.start)))
  return medTimme.length === 1 ? medTimme[0].index : null
}

/**
 * Är tiden fortfarande ledig? Samma konfliktkoll som `createBooking` i
 * lib/approve-actions.ts: överlapp mot booking och schedule_entry.
 *
 * getAvailableSlots används MEDVETET inte här: den returnerar de tre FÖRSTA
 * lediga luckorna i kalendern, vilket inte är samma sak som ett svar på
 * "är just den här tiden ledig?" — en ledig tid längre fram hade fallit ur
 * listan och felaktigt sett upptagen ut.
 */
export async function arSlotenLedig(
  supabase: SupabaseClient, businessId: string, start: string, end: string,
): Promise<boolean> {
  const { data: bokningar, error: bokningsFel } = await supabase
    .from('booking')
    .select('booking_id')
    .eq('business_id', businessId)
    .neq('status', 'cancelled')
    .lt('scheduled_start', end)
    .gt('scheduled_end', start)
  // Ett uppslagsfel får ALDRIG tolkas som "ledig" — då bokar vi över någon.
  if (bokningsFel) throw new Error(bokningsFel.message)
  if ((bokningar || []).length > 0) return false

  const { data: schema, error: schemaFel } = await supabase
    .from('schedule_entry')
    .select('id')
    .eq('business_id', businessId)
    .neq('status', 'cancelled')
    .lt('start_datetime', end)
    .gt('end_datetime', start)
  if (schemaFel) throw new Error(schemaFel.message)
  return (schema || []).length === 0
}

/** Hämtar öppet, ej utgånget erbjudande för avsändaren i det här företaget. */
async function hittaOppetErbjudande(
  supabase: SupabaseClient, businessId: string, from: string, nu: Date,
): Promise<BookingOffer | null> {
  const kandidater = Array.from(new Set([...phoneCandidates(from), normalizeSwedishPhone(from)].filter(Boolean))) as string[]
  if (!kandidater.length) return null
  const { data, error } = await supabase
    .from('booking_offer')
    .select('*')
    .eq('business_id', businessId)
    .eq('status', 'open')
    .in('phone_e164', kandidater)
    .gt('expires_at', nu.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[svar-pa-erbjudande] uppslaget misslyckades (svaret går vanliga vägen):', error.message)
    return null
  }
  return (data as BookingOffer) || null
}

async function kundnamn(
  supabase: SupabaseClient, businessId: string, erbjudande: BookingOffer,
): Promise<string> {
  try {
    if (erbjudande.customer_id) {
      const { data } = await supabase.from('customer').select('name')
        .eq('business_id', businessId).eq('customer_id', erbjudande.customer_id).maybeSingle()
      if (data?.name) return String(data.name)
    }
    if (erbjudande.lead_id) {
      const { data } = await supabase.from('leads').select('name')
        .eq('business_id', businessId).eq('lead_id', erbjudande.lead_id).maybeSingle()
      if (data?.name) return String(data.name)
    }
  } catch { /* namnet är kosmetik — kortet ska finnas ändå */ }
  return 'Kunden'
}

/**
 * Hela vägen från inkommande SMS till ETT kort. Kastar ALDRIG — ett svar som
 * inte kan hanteras här ska falla tillbaka till den vanliga vägen, aldrig bli
 * ett tappat SMS.
 */
export async function svarPaErbjudande(input: {
  supabase: SupabaseClient
  businessId: string
  from: string
  text: string
  nu?: Date
}): Promise<ErbjudandeSvar> {
  const { supabase, businessId, from, text } = input
  const nu = input.nu ?? new Date()
  try {
    const erbjudande = await hittaOppetErbjudande(supabase, businessId, from, nu)
    if (!erbjudande) return INGEN
    // Bältet vid sidan av hängslet: uppslaget filtrerar redan på expires_at,
    // men ett utgånget erbjudande får ALDRIG bli en bokning på grund av ett
    // fel i en query. Efter 48 timmar är tiden sällan kvar i kalendern, och
    // svaret ska gå den vanliga vägen.
    if (!(Date.parse(erbjudande.expires_at) > nu.getTime())) return INGEN

    const slots = rensaSlots(erbjudande.slots)
    const index = tolkaSvar(text, slots)
    if (index === null) return INGEN
    const vald = slots[index]

    let ledig: boolean
    try {
      ledig = await arSlotenLedig(supabase, businessId, vald.start, vald.end)
    } catch (konfliktFel) {
      // Kan vi inte kontrollera kalendern vet vi ingenting. Då är svaret
      // ohanterat och går den vanliga vägen — hellre ett kort att läsa än en
      // bokning ovanpå någon annan.
      console.error('[svar-pa-erbjudande] konfliktkollen misslyckades:', konfliktFel)
      return INGEN
    }

    if (!ledig) return await tidenArTagen(supabase, businessId, erbjudande, vald, nu)

    // ── Status-CAS: open → accepted ───────────────────────────────────
    // Två svar på samma erbjudande (kunden skickar "2" två gånger, eller
    // 46elks levererar samma SMS igen) ska ge ETT kort och EN bokning. Den
    // villkorade uppdateringen är avgörandet; kortets id är deterministiskt
    // ur erbjudandet, så även ett omkört anrop bara kan skriva samma rad.
    const kortId = `appr_boff_${erbjudande.id}`
    const { data: cas, error: casFel } = await supabase
      .from('booking_offer')
      .update({
        status: 'accepted',
        chosen_slot: vald,
        answered_at: nu.toISOString(),
        resulting_approval_id: kortId,
      })
      .eq('business_id', businessId)
      .eq('id', erbjudande.id)
      .eq('status', 'open')
      .select('id')
      .maybeSingle()

    if (casFel) {
      console.error('[svar-pa-erbjudande] erbjudandet kunde inte accepteras:', casFel.message)
      return INGEN
    }
    if (!cas) {
      // Någon annan hann före. Svaret ÄR hanterat — men inget nytt kort.
      return { hanterat: true, utfall: 'redan_besvarat', offerId: erbjudande.id, kortId: null, vald }
    }

    const namn = await kundnamn(supabase, businessId, erbjudande)
    const förnamn = namn.split(' ')[0]
    const minuter = Math.max(30, Math.round((Date.parse(vald.end) - Date.parse(vald.start)) / 60000))

    const kort = await skapaKort(supabase as any, {
      id: kortId,
      business_id: businessId,
      approval_type: 'booking_offer_confirm',
      title: `${förnamn} valde ${vald.label || 'den föreslagna tiden'} — Boka`,
      description: `${namn} svarade "${(text || '').trim().slice(0, 60)}" på tidsförslaget. Tiden är fortfarande ledig. Bokningen skapas och kunden får bekräftelsen när du trycker.`,
      // Samma risknivå som övriga bokningskort i huset (create_booking via
      // agent-trigger): en bokning rör kundens kalender och skickar ett SMS.
      risk_level: 'high',
      payload: {
        agent_id: 'lars',
        offer_id: erbjudande.id,
        customer_id: erbjudande.customer_id,
        lead_id: erbjudande.lead_id,
        customer_name: namn,
        customer_phone: erbjudande.phone_e164,
        slot: vald,
        duration_minutes: minuter,
        kundens_svar: (text || '').trim().slice(0, 200),
      },
    })

    if (!kort) {
      console.error('[svar-pa-erbjudande] kortet kunde inte skapas — erbjudandet är accepterat utan kort:', erbjudande.id)
      return { hanterat: true, utfall: 'accepterat', offerId: erbjudande.id, kortId: null, vald }
    }
    return { hanterat: true, utfall: 'accepterat', offerId: erbjudande.id, kortId: kort.id, vald }
  } catch (err) {
    console.error('[svar-pa-erbjudande] oväntat fel (sväljs — SMS:et är redan sparat):', err)
    return INGEN
  }
}

/**
 * Kunden valde en tid som hunnit bli upptagen.
 *
 * Runda 1: erbjudandet markeras `superseded` och ett nytt
 * `propose_booking_times`-kort förbereds. SMS:et med två nya tider går ut
 * genom EXAKT samma väg och samma grindar som det första (kortet godkänns,
 * lib/approvals/booking-times-review.ts hämtar färska tider) — ingen ny
 * utskickstyp, ingen ny autonomi.
 *
 * Runda 2: aldrig ett tredje SMS. Då ligger felet inte i tiderna, och kunden
 * ska inte få ännu en lista. Hantverkaren får ärendet i stället.
 */
async function tidenArTagen(
  supabase: SupabaseClient,
  businessId: string,
  erbjudande: BookingOffer,
  vald: ErbjudenSlot,
  nu: Date,
): Promise<ErbjudandeSvar> {
  const { data: cas, error } = await supabase
    .from('booking_offer')
    .update({ status: 'superseded', answered_at: nu.toISOString() })
    .eq('business_id', businessId)
    .eq('id', erbjudande.id)
    .eq('status', 'open')
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('[svar-pa-erbjudande] erbjudandet kunde inte stängas:', error.message)
    return INGEN
  }
  if (!cas) return { hanterat: true, utfall: 'redan_besvarat', offerId: erbjudande.id, kortId: null, vald }

  const namn = await kundnamn(supabase, businessId, erbjudande)
  const andraRundan = Boolean(erbjudande.parent_offer_id)
  const timmar = Math.max(0.5, Math.round(((Date.parse(vald.end) - Date.parse(vald.start)) / 3600000) * 2) / 2)

  if (andraRundan) {
    const kort = await skapaKort(supabase as any, {
      id: `appr_boff_stopp_${erbjudande.id}`,
      business_id: businessId,
      approval_type: 'agent_insight',
      title: `${namn.split(' ')[0]} hittar ingen tid som fungerar`,
      description: `${namn} valde ${vald.label || 'en föreslagen tid'}, men den blev upptagen — andra gången i rad. Vi skickar inga fler tider automatiskt. Ring kunden och kom överens om en tid.`,
      risk_level: 'medium',
      payload: {
        agent_id: 'lars',
        offer_id: erbjudande.id,
        customer_id: erbjudande.customer_id,
        lead_id: erbjudande.lead_id,
        customer_phone: erbjudande.phone_e164,
        upptagen_slot: vald,
      },
    })
    return { hanterat: true, utfall: 'upptagen_till_hantverkaren', offerId: erbjudande.id, kortId: kort?.id ?? null, vald }
  }

  const kort = await skapaKort(supabase as any, {
    id: `appr_boff_nya_${erbjudande.id}`,
    business_id: businessId,
    approval_type: 'propose_booking_times',
    title: `${namn.split(' ')[0]}s tid blev upptagen — föreslå nya tider`,
    description: `${namn} valde ${vald.label || 'en föreslagen tid'}, men den är inte längre ledig. Godkänn så skickas två nya tider ur kalendern.`,
    risk_level: 'medium',
    payload: {
      agent_id: 'lars',
      customer_id: erbjudande.customer_id,
      lead_id: erbjudande.lead_id,
      duration_hours: timmar,
      // Nästa erbjudande ärver ursprunget: det är det som gör "max en gång"
      // till kod i stället för en förhoppning.
      parent_offer_id: erbjudande.id,
      entity: { customerId: erbjudande.customer_id, leadId: erbjudande.lead_id },
    },
  })
  return { hanterat: true, utfall: 'upptagen_nytt_forslag', offerId: erbjudande.id, kortId: kort?.id ?? null, vald }
}
