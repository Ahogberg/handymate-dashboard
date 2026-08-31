/**
 * Snabboffertens inlärning (etapp D, 2026-08-06).
 *
 * ═══ PROBLEMET ═══
 *
 * Kallstart går till Snabbofferten. Men den som gång på gång tar sig därifrån
 * till editorn eller till en mall säger något med handling, och ska få slippa
 * upprepa det. Efter tredje gången frågar vi EN gång.
 *
 * ═══ HISTORIK (Fas 1, offert-omtaget 2026-08-31) ═══
 *
 * Den här filen höll tidigare även på "sekvensen": efter fem genomförda
 * snabbofferter landade utkastet direkt i en ÖVERSIKT i stället för i steg
 * ett av en tvingad sektionsgranskning (`SKIP_SEQUENCE_AFTER`/
 * `shouldSkipSequence`, plus räknaren `getCompletedCount`/
 * `recordCompletedQuickQuote`). Den granskningssekvensen är borttagen —
 * grundaren konstaterade att den inte fungerade i praktiken, och den femte-
 * offerten-tröskeln var själva beviset: användare börjar undvika tvingade
 * repetitiva steg. Utan sekvensen har räknaren ingen läsare kvar, så den
 * togs bort med den i stället för att bli en övergiven export.
 *
 * Kvar är BARA startläges-inlärningen: en helt orättvänd, fortsatt
 * legitim preferens om VILKEN startskärm (Snabboffert/editor/mall) en
 * kallstart ska landa i.
 *
 * ═══ VARFÖR localStorage OCH INTE DATABASEN ═══
 *
 * Det här är en vana per person och enhet, inte affärsdata. En kolumn hade
 * krävt en migration, en API-rutt och ett beslut om vad som händer när två
 * anställda delar konto. Räknaren får gärna nollställas vid telefonbyte — då
 * får hen se standardflödet igen, vilket är helt rimligt.
 *
 * Beslutsfunktionerna är RENA och tar räknaren som argument, så de kan
 * facit-testas utan webbläsare. Bara läs/skriv rör localStorage.
 */

/** Var kallstart ska landa. 'quick' är standard och behöver aldrig lagras. */
export type StartMode = 'quick' | 'editor' | 'template'

/** De två vägar man kan ta SIG UT ur Snabbofferten. 'quick' räknas inte —
    den är default och kräver inget val av användaren. */
export type EscapeRoute = Exclude<StartMode, 'quick'>

const PREFERRED_KEY = 'handymate.quickQuote.preferredStart'
const ESCAPE_KEY = (mode: EscapeRoute) => `handymate.quickQuote.chose.${mode}`
const ASKED_KEY = (mode: EscapeRoute) => `handymate.quickQuote.asked.${mode}`

/** Efter så här många gånger på samma väg ut frågar vi EN gång. */
export const ASK_PREFERRED_AFTER = 3

/**
 * Ska vi fråga "vill du alltid börja så här?".
 *
 * Exakt likhet, inte >=: frågan ställs vid EN bestämd punkt och aldrig igen.
 * Med >= hade den kommit tillbaka varje gång tills någon svarade, vilket är
 * precis den sortens tjat som får folk att sluta läsa dialoger.
 */
export function shouldAskPreferred(escapeCount: number, alreadyAsked: boolean): boolean {
  return !alreadyAsked && escapeCount === ASK_PREFERRED_AFTER
}

// ── Lagring ────────────────────────────────────────────────────────────
// Allt är fail-soft. localStorage kastar i privat läge i vissa webbläsare och
// när lagringen är full; en trasig vana får aldrig hindra någon från att
// skriva en offert.

function readNumber(key: string): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = window.localStorage.getItem(key)
    const value = raw ? parseInt(raw, 10) : 0
    return Number.isFinite(value) && value >= 0 ? value : 0
  } catch {
    return 0
  }
}

function readString(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* privat läge eller full lagring — vanan går förlorad, offerten gör det inte */
  }
}

// ── Startläget ─────────────────────────────────────────────────────────

/**
 * Var kallstart ska landa. Okänt eller trasigt värde ger 'quick' — riktningen
 * spelar roll: en ny användare som hamnar i editorn har aldrig sett
 * Snabbofferten och vet inte att den finns.
 */
export function getPreferredStart(): StartMode {
  const raw = readString(PREFERRED_KEY)
  return raw === 'editor' || raw === 'template' ? raw : 'quick'
}

export function setPreferredStart(mode: StartMode): void {
  write(PREFERRED_KEY, mode)
}

/** Räknas när hantverkaren tar sig ur Snabbofferten på egen hand. */
export function recordEscape(mode: EscapeRoute): number {
  const next = readNumber(ESCAPE_KEY(mode)) + 1
  write(ESCAPE_KEY(mode), String(next))
  return next
}

export function getEscapeCount(mode: EscapeRoute): number {
  return readNumber(ESCAPE_KEY(mode))
}

export function hasBeenAskedPreferred(mode: EscapeRoute): boolean {
  return readString(ASKED_KEY(mode)) === '1'
}

/** Markerar frågan som ställd — oavsett hur hantverkaren svarade. Ett nej är
    också ett svar och ska inte leda till att vi frågar igen. */
export function markAskedPreferred(mode: EscapeRoute): void {
  write(ASKED_KEY(mode), '1')
}

/** Svensk etikett för vägen, till frågan i gränssnittet. */
export const ESCAPE_LABELS: Record<EscapeRoute, string> = {
  editor: 'i offertskaparen',
  template: 'med en mall',
}
