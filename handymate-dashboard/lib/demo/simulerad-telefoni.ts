import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Demons simulerade telefoni — ETT medvetet undantag, med sitt eget nummer.
 *
 * ═══ VARFÖR ═══
 *
 * Andreas 2026-09-10: "Kan vi göra ett snyggt undantag för demon?" Lisa visade
 * "Behöver aktiveras" på demokontot, eftersom `assigned_phone_number` var NULL.
 * Statusen var ÄRLIG (agentremsan grindades sant dagen innan) men fel intryck
 * i ett kundmöte: demot ska visa en telefon som fångar samtal.
 *
 * Att i stället göra ett undantag i sanningslogiken (lib/agents/agent-tillstand.ts
 * eller team-activity-rutten) vore precis fel väg. Den logiken vaktar vad
 * RIKTIGA kunder ser, och den har redan kostat två rättningar den här veckan.
 * Principen här är samma som Fortnox-simmens (app/api/admin/demo-fortnox-sim):
 *
 *     Fejka DATAN på exakt det lager en riktig integration skriver.
 *     Fejka ALDRIG statusen.
 *
 * Så demot får ett simulerat nummer och simulerade fångade samtal, och de
 * befintliga, ogrindade härledningarna får läsa dem som vad de är: ett konto
 * med en kopplad telefon som fångat samtal. Lisa blir "arbetar" för att
 * datan säger det, inte för att någon gjort ett undantag i hennes status.
 *
 * ═══ VARFÖR NUMRET MÅSTE VARA KÄNT PÅ ETT STÄLLE ═══
 *
 * Numret är påhittat. Det finns inget 46elks-nummer bakom det, och därför
 * inget `elks_number_id`. Nattsvepet app/api/cron/phone-number-verify tar
 * ALLA rader med ett nummer och gör två saker: saknas elks_number_id larmar
 * det (`nummer_kan_ej_verifieras`), och svarar 46elks att numret inte är
 * vårt NOLLSTÄLLER det. Utan undantaget här hade demot alltså (a) larmat i
 * driftloggen varje dygn om ett nummer vi själva hittat på, och (b) i värsta
 * fall tappat Lisa varje natt.
 *
 * Därför: EN konstant, EN predikatfunktion, och svepet hoppar över raden när
 * BÅDA stämmer — numret är exakt det här OCH raden är ett demokonto
 * (`is_demo_tenant`). Nyckeln ligger på numret, inte bara på kontot, så ett
 * demokonto som en dag köper ett RIKTIGT nummer fortsätter verifieras som
 * alla andra. Och kravet på is_demo_tenant gör att ett riktigt företag som
 * mot alla odds fick just det här numret ändå kontrolleras.
 *
 * ═══ ÄGARSKAP ═══
 *
 * Numret skrivs i `business_config`, som demoseedaren MEDVETET aldrig rör
 * (tests/demo-seedning-tackning.spec.ts: en skrivning där kunde radera den
 * inloggade presentatörens egen koppling). Därför bor den här funktionen
 * utanför seedaren och anropas av app/api/admin/demo-reset/route.ts, som äger
 * demokontots konfiguration. Seedaren äger datan, resetten äger konfigen.
 *
 * Idempotent i båda leden: numret skrivs bara när fältet är tomt eller redan
 * är det simulerade (ett riktigt nummer skrivs ALDRIG över), och samtalen
 * raderas av RPC:n (sql/v158_demo_reset_v3.sql rad 152) före varje seedning.
 */

/**
 * Demons simulerade telefonnummer. Påhittat — inget 46elks-abonnemang finns
 * bakom det, och det går inte att ringa. Formateras som 070-174 00 00 i UI:t
 * (lib/sms-reply-number.ts), så det ser ut som ett vanligt mobilnummer i en
 * demo utan att vara någons.
 */
export const DEMO_SIMULERAT_NUMMER = '+46701740000'

/** Exakt matchning mot det simulerade numret. Aldrig ett prefix — ett prefix hade kunnat svälja ett riktigt nummer. */
export function arSimuleratDemonummer(nummer: string | null | undefined): boolean {
  return typeof nummer === 'string' && nummer === DEMO_SIMULERAT_NUMMER
}

/**
 * De simulerade samtalen. Två fångade, ett besvarat — samma blandning en
 * riktig vecka har.
 *
 * Tiderna är RELATIVA (timmar sedan återställningen), aldrig absoluta
 * klockslag. Ett absolut "i dag 09:00" hade legat i FRAMTIDEN vid en tidig
 * återställning, och ett samtal som ännu inte har hänt är sämre demodata än
 * inget samtal. Samma val som agentkörningarna i seedaren.
 */
const SIMULERADE_SAMTAL: Array<{
  kundKey: string
  timmarSedan: number
  sekunder: number
  sammanfattning: string
  besvarat: boolean
}> = [
  {
    kundKey: 'mikael',
    timmarSedan: 3,
    sekunder: 34,
    sammanfattning: 'Ringde om byte av eluttag i köket. Vill ha pris innan nästa vecka.',
    besvarat: false,
  },
  {
    kundKey: 'brf',
    timmarSedan: 2,
    sekunder: 52,
    sammanfattning: 'Ordföranden ringde om belysningen i trapphuset. Undrar när ni kan komma.',
    besvarat: true,
  },
  {
    kundKey: 'kristina',
    timmarSedan: 1,
    sekunder: 21,
    sammanfattning: 'Ringde om fakturan för kökskranen. Ville veta OCR-numret.',
    besvarat: false,
  },
]

export interface DemotelefoniResultat {
  /** Numret kontot har efter körningen — det simulerade, eller ett riktigt som lämnats orört. */
  nummer: string | null
  /** true när numret lämnades orört för att det redan var ett riktigt. */
  riktigtNummerBehallet: boolean
  /** Antal simulerade samtal som skrevs. */
  samtal: number
}

/**
 * Ger demokontot ett simulerat nummer och simulerade inkommande samtal.
 *
 * Skriver ALDRIG över ett riktigt nummer (då finns inget att simulera — då
 * är telefonin äkta) och rör aldrig `elks_number_id`: det ska förbli NULL,
 * eftersom det inte finns något nummer hos 46elks att peka på.
 *
 * Fail-soft i samtalsledet: ett misslyckat samtalsinlägg loggas men fäller
 * inte återställningen — numret är det som avgör Lisas status, samtalen är
 * det som gör henne "arbetar" i stället för "bevakar".
 */
export async function simuleraDemotelefoni(
  supabase: SupabaseClient,
  businessId: string,
): Promise<DemotelefoniResultat> {
  const { data: cfg } = await supabase
    .from('business_config')
    .select('assigned_phone_number, personal_phone')
    .eq('business_id', businessId)
    .maybeSingle()

  const befintligt = (cfg?.assigned_phone_number as string | null) ?? null
  if (befintligt && !arSimuleratDemonummer(befintligt)) {
    // Demokontot har ett RIKTIGT nummer. Då behövs ingen simulering — och att
    // skriva över det hade tagit bort en fungerande telefon.
    return { nummer: befintligt, riktigtNummerBehallet: true, samtal: 0 }
  }

  if (!befintligt) {
    const { error } = await supabase
      .from('business_config')
      .update({
        assigned_phone_number: DEMO_SIMULERAT_NUMMER,
        // elks_number_id lämnas MEDVETET orört (NULL): det finns inget
        // nummer hos 46elks. Se filhuvudet om nattsvepets undantag.
        updated_at: new Date().toISOString(),
      })
      .eq('business_id', businessId)
    if (error) {
      console.error('[simulerad-telefoni] kunde inte sätta demonummer:', error.message)
      return { nummer: null, riktigtNummerBehallet: false, samtal: 0 }
    }
  }

  // Samtalen knyts till demokunderna via deras e-post (demo+N@handymate.se),
  // som seedaren just skrivit. Ordningen är alltid: RPC raderar → seedaren
  // skapar kunderna → den här funktionen lägger samtalen.
  const { data: kunder } = await supabase
    .from('customer')
    .select('customer_id, email, phone_number')
    .eq('business_id', businessId)

  const kundPerKey: Record<string, { customer_id: string; phone_number: string | null }> = {}
  const nyckelPerEpost: Record<string, string> = {
    'demo+1@handymate.se': 'anna',
    'demo+2@handymate.se': 'mikael',
    'demo+3@handymate.se': 'brf',
    'demo+4@handymate.se': 'fastighets',
    'demo+5@handymate.se': 'kristina',
    'demo+6@handymate.se': 'johan',
  }
  for (const k of kunder ?? []) {
    const nyckel = nyckelPerEpost[(k.email as string) ?? '']
    if (nyckel) kundPerKey[nyckel] = { customer_id: k.customer_id as string, phone_number: (k.phone_number as string | null) ?? null }
  }

  const ownerPhone = (cfg?.personal_phone as string | null) ?? null
  const rader = SIMULERADE_SAMTAL.map((s, i) => {
    const kund = kundPerKey[s.kundKey]
    const start = new Date(Date.now() - s.timmarSedan * 60 * 60 * 1000)
    const slut = new Date(start.getTime() + s.sekunder * 1000)
    return {
      recording_id: `rec_demo_sim_${i + 1}_${Date.now()}`,
      business_id: businessId,
      customer_id: kund?.customer_id ?? null,
      source: 'phone',
      direction: 'inbound',
      phone_number: kund?.phone_number ?? ownerPhone,
      from_number: kund?.phone_number ?? ownerPhone,
      to_number: DEMO_SIMULERAT_NUMMER,
      started_at: start.toISOString(),
      ended_at: slut.toISOString(),
      duration_seconds: s.sekunder,
      call_status: s.besvarat ? 'answered' : 'missed',
      transcript_summary: s.sammanfattning,
      // Ingen ljudfil och ingen transkribering finns: recording_url och
      // transcript_text lämnas NULL hellre än att hitta på en URL som 404:ar
      // när presentatören trycker på play.
      recording_fetched: false,
      created_at: start.toISOString(),
    }
  })

  const { error: samtalErr } = await supabase.from('call_recording').insert(rader)
  if (samtalErr) {
    console.error('[simulerad-telefoni] kunde inte skriva simulerade samtal:', samtalErr.message)
    return { nummer: DEMO_SIMULERAT_NUMMER, riktigtNummerBehallet: false, samtal: 0 }
  }

  return { nummer: DEMO_SIMULERAT_NUMMER, riktigtNummerBehallet: false, samtal: rader.length }
}
