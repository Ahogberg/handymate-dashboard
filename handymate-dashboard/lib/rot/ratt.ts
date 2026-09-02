/**
 * ROT-rätten som en sanning (tasks/plan-rot-ratt.md, 2026-09-02).
 *
 * BAKGRUND: branschgenomgången (docs/bransch/) visade att ROT-rätten beror på
 * BOENDEFORMEN (småhus/bostadsrätt) och på jobbets NATUR — men i koden
 * avgjordes den tidigare av en fri boolean per offertrad utan koppling till
 * någon sanning. Fasadmålning i en bostadsrätt och fasadmålning i ett småhus
 * behandlades lika, och rena servicejobb (felsökning, kontroll, översyn)
 * kunde märkas ROT trots att Skatteverket uttryckligen säger nej. Den här
 * modulen är rälsen: en ren uppslagsfunktion, inget nätverk, ingen databas.
 *
 * DEN HÄRA MODULENS ENDA REGEL: aldrig en tyst gissning. Om jobbtypen inte
 * finns i tabellen, eller om boendeformen behövs men inte är känd, eller om
 * just den boendeformen inte är utredd för raden — svaret är ALLTID 'okant'
 * med en fråga till hantverkaren, ALDRIG 'nej' av databrist och ALDRIG 'ja'
 * på en gissning. Bostadsrätt antas ALDRIG bete sig som småhus — se
 * kommentaren i lib/rot/tabell.ts.
 */

/** Boendeformen styr ROT-rätten lika mycket som själva jobbet — se
 *  docs/bransch/README.md, tvärgående fynd #1. 'okand' är det ärliga
 *  utgångsläget: vi frågar hellre än gissar. */
export type Boendeform = 'smahus' | 'bostadsratt' | 'okand'

/** 'inget' betyder att raden uttryckligen varken ger ROT eller RUT (t.ex.
 *  staket/murar, eller nyanläggning av tomt — README, tvärgående fynd #6). */
export type AvdragsTyp = 'rot' | 'rut' | 'gron_teknik' | 'inget'

/** Källbelagd rad ur ett branschpaket (docs/bransch/*.md) — se
 *  lib/rot/tabell.ts för formen och urvalsprincipen. */
export interface RotRad {
  slug: string
  namn: string
  bransch: string
  smahus: AvdragsTyp | 'okant'
  bostadsratt: AvdragsTyp | 'okant'
  /** Kort svensk mening ur radens egen motivering i branschfilen. */
  grund: string
  /** Källkoden ur branschfilen (t.ex. "SKV-ROT"), plus URL om filen har den. */
  kalla: string
  /** true bara för rader som klarat den mekaniska kontrollen
   *  (docs/bransch/granskning/MEKANISK_KONTROLL_2026-09-02.md) och som INTE
   *  är någon av de fyra underkända raderna. Alla rader i ROT_TABELL har
   *  granskad: true — det är själva urvalsvillkoret för att stå med. */
  granskad: boolean
}

/**
 * Beskedet bedomAvdrag ger. Tre — inte två — möjliga utfall, för att en rad
 * kan sakna avdrag helt (varken ROT eller RUT, README tvärgående fynd #6),
 * och för att "vet inte" måste kunna skiljas från "nej" (kärnregeln i denna
 * modul).
 */
export type RottBesked =
  | { utfall: 'ja'; typ: AvdragsTyp; grund: string; kalla: string }
  | { utfall: 'nej'; grund: string; kalla: string }
  | { utfall: 'okant'; fraga: string } // fraga = vad hantverkaren ska tillfrågas

const BOENDEFORM_NAMN: Record<'smahus' | 'bostadsratt', string> = {
  smahus: 'ett småhus',
  bostadsratt: 'en bostadsrätt',
}

/** Slår upp en enskild boendeform-kolumn och avgör ja/nej/okant utifrån dess
 *  AvdragsTyp-värde. 'inget' är ett bekräftat nej (raden har grund+källa,
 *  inte databrist) — se kärnregeln i filkommentaren ovan. */
function avgorFranTyp(varde: AvdragsTyp, rad: RotRad): RottBesked {
  if (varde === 'inget') return { utfall: 'nej', grund: rad.grund, kalla: rad.kalla }
  return { utfall: 'ja', typ: varde, grund: rad.grund, kalla: rad.kalla }
}

/**
 * Normaliserar en jobbtypsnyckel så att både en slug
 * ("electrician-byte-av-elcentral"), en jobbtyp utan branschprefix
 * ("byte-av-elcentral") och hantverkarens egen fritext ("Byte av elcentral")
 * kan träffa samma rad. Anledningen: den enda jobbtypsuppgift kalllarna
 * faktiskt har är `project.job_type` / `quote.job_type` — fri text, inte våra
 * slugs. Utan den här normaliseringen hade tabellen aldrig träffat i skarp
 * drift och modulen varit död kod.
 *
 * EXAKT likhet efter normalisering — aldrig delsträngs- eller fuzzy-matchning.
 * En nästan-träff är en gissning, och gissningar är precis det den här modulen
 * finns för att sluta göra.
 */
export function normaliseraJobbtyp(nyckel: string): string {
  return (nyckel || '')
    .toLowerCase()
    .trim()
    .replace(/[\s_/]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|[-.,;:!?]+$/g, '')
}

type RadTraff =
  | { status: 'traff'; rad: RotRad }
  | { status: 'saknas' }
  /** Samma benämning finns i flera branscher (t.ex. "Felsökning" i både el
   *  och VVS). Att välja en av dem vore en gissning — och citera fel
   *  branschfils motivering på köpet — så det här är ett okänt läge. */
  | { status: 'flertydig' }

/** Uppslagsindex byggt en gång: varje rad läggs in under sin slug, sin slug
 *  utan branschprefix och sitt namn. En nyckel som två OLIKA rader gör
 *  anspråk på markeras flertydig i stället för att den första vinner. */
const RAD_INDEX: Map<string, RotRad | 'flertydig'> = (() => {
  const index = new Map<string, RotRad | 'flertydig'>()
  for (const rad of ROT_TABELL) {
    const nycklar = [rad.slug, rad.slug.startsWith(`${rad.bransch}-`) ? rad.slug.slice(rad.bransch.length + 1) : '', rad.namn]
    for (const nyckel of nycklar) {
      const normaliserad = normaliseraJobbtyp(nyckel)
      if (!normaliserad) continue
      const befintlig = index.get(normaliserad)
      if (!befintlig) index.set(normaliserad, rad)
      else if (befintlig !== 'flertydig' && befintlig.slug !== rad.slug) index.set(normaliserad, 'flertydig')
    }
  }
  return index
})()

function hittaRad(nyckel: string): RadTraff {
  const normaliserad = normaliseraJobbtyp(nyckel)
  if (!normaliserad) return { status: 'saknas' }
  const traff = RAD_INDEX.get(normaliserad)
  if (!traff) return { status: 'saknas' }
  if (traff === 'flertydig') return { status: 'flertydig' }
  return { status: 'traff', rad: traff }
}

/**
 * Avgör om en jobbtyp ger ROT, RUT, grön teknik, inget avdrag alls — eller om
 * vi helt enkelt inte vet, i vilket fall svaret alltid är en fråga till
 * hantverkaren, aldrig ett påstående.
 *
 * Regler, i ordning:
 *  1. Jobbtypen finns inte i tabellen ⇒ okant, med frågan "Ger <jobbtyp> rätt
 *     till ROT? Vi har inget belagt svar." Samma benämning i flera branscher
 *     (flertydig) ger också okant, med en fråga om vilken sorts arbete det är.
 *  2. Boendeformen är okänd OCH raden ger olika svar för småhus och
 *     bostadsrätt ⇒ okant, med frågan om boendeform (avdraget skiljer sig).
 *  3. Boendeformen är känd men just den kolumnen är 'okant' för raden ⇒
 *     okant, med en fråga specifik för den boendeformen (samma kärnregel:
 *     en känd boendeform får aldrig maskera en okänd kolumn som ett svar).
 *  4. Annars: kolumnens AvdragsTyp avgör — 'inget' ger nej (med grund),
 *     annat ger ja (med typ, grund, källa).
 *
 * ALDRIG en tyst default. Den här funktionen returnerar aldrig 'nej' för att
 * den saknar data — det fallet är alltid 'okant'.
 */
export function bedomAvdrag(jobbtypSlug: string, boendeform: Boendeform, _nu: Date = new Date()): RottBesked {
  const traff = hittaRad(jobbtypSlug)

  if (traff.status === 'flertydig') {
    return {
      utfall: 'okant',
      fraga: `Vilken sorts ${jobbtypSlug.trim()} gäller det? Samma benämning finns i flera branscher med olika avdragsrätt.`,
    }
  }
  if (traff.status === 'saknas') {
    return { utfall: 'okant', fraga: `Ger ${jobbtypSlug.trim() || 'arbetet'} rätt till ROT? Vi har inget belagt svar.` }
  }
  const rad = traff.rad

  if (boendeform === 'okand') {
    // Skiljer sig svaret inte åt mellan boendeformerna spelar det ingen roll
    // att vi inte vet vilken det är — svara direkt i stället för att fråga i
    // onödan.
    if (rad.smahus === rad.bostadsratt) {
      // Kan bara vara 'okant' här om båda kolumnerna av misstag saknar
      // uppgift (byggs aldrig av tabellen som den är konstruerad idag, men
      // koden gissar ändå inte om det skulle inträffa).
      if (rad.smahus === 'okant') {
        return { utfall: 'okant', fraga: `Ger ${rad.namn} rätt till ROT? Vi har inget belagt svar.` }
      }
      return avgorFranTyp(rad.smahus, rad)
    }
    return { utfall: 'okant', fraga: 'Är bostaden ett småhus eller en bostadsrätt? Avdraget skiljer sig.' }
  }

  const varde = boendeform === 'smahus' ? rad.smahus : rad.bostadsratt
  if (varde === 'okant') {
    return {
      utfall: 'okant',
      fraga: `Ger ${rad.namn} rätt till avdrag i ${BOENDEFORM_NAMN[boendeform]}? Vi har inget belagt svar för den boendeformen.`,
    }
  }
  return avgorFranTyp(varde, rad)
}

/**
 * true för rader som ALDRIG ger ROT oavsett boendeform — service, kontroll,
 * översyn, felsökning och liknande (README, tvärgående fynd #2). Används av
 * UI:t för att varna om hantverkaren ändå kryssar i ROT för raden.
 *
 * Okänd jobbtyp ger false (inte en gissning om "utan avdrag" — vi vet helt
 * enkelt inte). Att fråga arArbeteUtanAvdrag för en okänd rad är ett
 * användningsfel, inte ett läge den här funktionen ska uttala sig om.
 */
export function arArbeteUtanAvdrag(jobbtypSlug: string): boolean {
  const traff = hittaRad(jobbtypSlug)
  if (traff.status !== 'traff') return false
  return traff.rad.smahus === 'inget'
}

// ROT_TABELL importeras sist så att typerna ovan (Boendeform, AvdragsTyp,
// RotRad, RottBesked) kan användas av tabell.ts utan cirkelimport-problem —
// tabell.ts importerar typerna FRÅN den här filen, den här filen importerar
// bara datan FRÅN tabell.ts.
import { ROT_TABELL } from './tabell'
export { ROT_TABELL }
