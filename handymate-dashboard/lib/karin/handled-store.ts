/**
 * Vad ägaren gjort med en kalenderhändelse — och vad det INTE betyder (2026-08-07).
 *
 * ═══ FELET SOM RÄTTAS (N4) ═══
 *
 * Tidigare fanns exakt ett läge: "hanterad". Deadline-cronen gjorde
 * `if (hanterade.has(e.id)) continue`, och eftersom påminnelserna går ut 14 dagar,
 * 3 dagar och på dagen betydde en bock fjorton dagar i förväg att **du aldrig hörde
 * talas om deadlinen igen** — inte heller på förfallodagen.
 *
 * Ingen aktör sparades, ingen tidpunkt, inget bevis. En momsdeklaration kunde
 * alltså se avklarad ut i gränssnittet utan att någon lämnat in något.
 *
 * ═══ DEN BÄRANDE INVARIANTEN ═══
 *
 * **De sista dagarna före en lagstadgad deadline går inte att tysta.**
 *
 * Oavsett vad ägaren klickat återkommer påminnelsen när det är `SISTA_ANFLYGNING_DAGAR`
 * kvar. Det är den enda regel som gör det säkert att ha en avbockningsknapp alls:
 * det värsta en felklickning kan kosta är en påminnelse för mycket, aldrig en
 * missad deklaration.
 *
 * ═══ TVÅ LÄGEN, INGET TREDJE ═══
 *
 * - `acknowledged` — "jag har sett den". Tystar de tidiga påminnelserna.
 * - `snoozed` — "påminn mig igen efter X". Tystar fram till datumet.
 *
 * Det finns med flit **inget `completed`**. Vi kan inte verifiera att en
 * deklaration är inlämnad — Skatteverket berättar det inte för oss. Ett läge som
 * påstod det hade varit en osanning i det läge där osanningen kostar mest.
 * Uppfyllelse med bevis är ett eget, senare arbete.
 *
 * ═══ VARFÖR business_preferences OCH INTE EN NY TABELL ═══
 *
 * `business_preferences` är en nyckel-värde-tabell med `UNIQUE(business_id, key)`
 * (sql/v2_business_preferences.sql:14) och används redan för morgonbriefens cache.
 * En kvittens är exakt en sådan liten preferens, och lösningen kräver **noll
 * migrationer** — vilket också är skälet till att det här arbetet kan gå parallellt
 * med den migrationslane någon annan äger just nu.
 *
 * ═══ VARFÖR CRONEN INTE BEHÖVER ÄNDRAS ═══
 *
 * `parseHandled()` returnerar fortfarande en `Set<string>` med de id:n som ska
 * tystas **just nu**. Cronen frågar `hanterade.has(e.id)` som förut och får rätt
 * beteende utan en enda rads ändring. Utgången av en snooze och den sista
 * anflygningen räknas ut här inne, inte där ute.
 *
 * Rena funktioner — tests/karin-handled-store.spec.ts.
 */

/** Nyckeln i business_preferences. */
export const HANDLED_KEY = 'karin_handled_events'

/** Hur länge en kvittens sparas efter att datumet passerat. */
const GALLRINGSGRANS_DAGAR = 120

/**
 * Dagar före deadline då ingenting längre går att tysta.
 *
 * Sammanfaller med den mellersta påminnelsetröskeln: den som kommer tre dagar
 * före är den sista som hinner göra nytta.
 */
export const SISTA_ANFLYGNING_DAGAR = 3

export type KvittensLage = 'acknowledged' | 'snoozed'

export interface Kvittens {
  id: string
  state: KvittensLage
  /** Vem som klickade. Null för poster från det gamla formatet. */
  actor: string | null
  /** När det klickades, ISO. Tom sträng för poster från det gamla formatet. */
  at: string
  /** Endast för `snoozed`: påminn igen från och med detta datum (YYYY-MM-DD). */
  until?: string
}

/** Plockar ut datumet ur ett händelse-id. Null när id:t inte bär något. */
export function dateFromEventId(id: string): string | null {
  const m = id.match(/(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function iDag(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function plusDagar(datum: string, dagar: number): string {
  const d = new Date(`${datum}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dagar)
  return d.toISOString().slice(0, 10)
}

/**
 * Läser lagrade kvittenser.
 *
 * Tolererar tre former: det nya objektformatet, det gamla `string[]`-formatet, och
 * skräp. Trasigt innehåll ger en tom lista i stället för ett fel — en kalender som
 * vägrar rendera för att en preferens är korrupt är sämre än en som glömt vad du
 * bockat av.
 *
 * Gamla strängposter läses som `acknowledged` utan aktör och tidpunkt. De blir
 * därmed automatiskt säkrare än de var: den sista anflygningen går inte längre att
 * tysta med dem heller.
 */
export function parseEntries(raw: string | null | undefined): Kvittens[] {
  if (!raw) return []
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(v)) return []

  const ut: Kvittens[] = []
  for (const post of v) {
    if (typeof post === 'string') {
      ut.push({ id: post, state: 'acknowledged', actor: null, at: '' })
      continue
    }
    if (!post || typeof post !== 'object') continue
    const p = post as Record<string, unknown>
    if (typeof p.id !== 'string' || !p.id) continue
    const lage: KvittensLage = p.state === 'snoozed' ? 'snoozed' : 'acknowledged'
    const post2: Kvittens = {
      id: p.id,
      state: lage,
      actor: typeof p.actor === 'string' ? p.actor : null,
      at: typeof p.at === 'string' ? p.at : '',
    }
    if (lage === 'snoozed' && typeof p.until === 'string') post2.until = p.until
    ut.push(post2)
  }
  return ut
}

/**
 * Tystar den här kvittensen en påminnelse just nu?
 *
 * Ordningen är avsiktlig: den sista anflygningen prövas FÖRST och slår allt annat.
 */
export function suppresses(k: Kvittens, now: Date): boolean {
  const forfall = dateFromEventId(k.id)
  const idag = iDag(now)

  if (forfall) {
    // Invarianten. Inom fönstret spelar det ingen roll vad som klickats.
    if (idag >= plusDagar(forfall, -SISTA_ANFLYGNING_DAGAR)) return false
  }

  if (k.state === 'snoozed') {
    // Utan `until` är snoozen meningslös — behandla den som utgången hellre än
    // som evig.
    if (!k.until) return false
    return idag < k.until
  }

  return true
}

/**
 * Id:n som ska tystas just nu.
 *
 * Signaturen är oförändrad med flit: deadline-cronen anropar `parseHandled(raw)`
 * och frågar `.has(id)`. All ny semantik ryms här inne, så den filen behöver inte
 * röras.
 */
export function parseHandled(raw: string | null | undefined, now: Date = new Date()): Set<string> {
  return new Set(parseEntries(raw).filter(k => suppresses(k, now)).map(k => k.id))
}

/**
 * Gallrar bort kvittenser vars datum passerat med god marginal.
 *
 * Id:n utan datum behålls alltid — vi vet inte när de blir inaktuella, och att
 * slänga något vi inte förstår är värre än att bära det.
 */
export function pruneEntries(entries: Kvittens[], today: Date): Kvittens[] {
  const grans = new Date(today)
  grans.setDate(grans.getDate() - GALLRINGSGRANS_DAGAR)
  const gransStr = iDag(grans)

  return entries.filter(k => {
    const d = dateFromEventId(k.id)
    return d === null || d >= gransStr
  })
}

/** Vad ägaren gjorde. `null` betyder ångra — posten tas bort helt. */
export type KvittensAndring =
  | { state: 'acknowledged'; actor: string | null }
  | { state: 'snoozed'; actor: string | null; until: string }
  | null

/**
 * Lägger till, ersätter eller tar bort en kvittens, och gallrar i samma veva.
 *
 * En snooze får aldrig sträcka sig in i den sista anflygningen. Ber någon om det
 * kapas datumet i stället för att avvisas — avsikten "påminn mig senare" är rimlig,
 * det är bara den bortre gränsen som inte är förhandlingsbar.
 */
export function applyKvittens(
  current: Kvittens[],
  eventId: string,
  andring: KvittensAndring,
  now: Date,
): Kvittens[] {
  const utan = current.filter(k => k.id !== eventId)
  if (!andring) return pruneEntries(utan, now).sort((a, b) => a.id.localeCompare(b.id))

  const post: Kvittens = {
    id: eventId,
    state: andring.state,
    actor: andring.actor,
    at: now.toISOString(),
  }

  if (andring.state === 'snoozed') {
    const forfall = dateFromEventId(eventId)
    const tak = forfall ? plusDagar(forfall, -SISTA_ANFLYGNING_DAGAR) : null
    post.until = tak && andring.until > tak ? tak : andring.until
  }

  return pruneEntries([...utan, post], now).sort((a, b) => a.id.localeCompare(b.id))
}

/** Serialiserar för lagring i business_preferences. */
export function serializeEntries(entries: Kvittens[]): string {
  return JSON.stringify(entries)
}
