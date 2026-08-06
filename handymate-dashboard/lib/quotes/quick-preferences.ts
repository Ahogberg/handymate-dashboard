/**
 * Snabboffertens inlärning (etapp D, 2026-08-06).
 *
 * ═══ PROBLEMET ═══
 *
 * Offert nummer 40 ska inte kräva samma steg som nummer 1. Ett flöde som
 * tvingar fram samma tryck varje gång blir något man börjar undvika — och då
 * är vi tillbaka i "blir galen", bara med en snyggare skärm.
 *
 * Två sorters inlärning bor här:
 *
 * 1. **Sekvensen.** Efter fem genomförda snabbofferter landar utkastet direkt
 *    i ÖVERSIKTEN i stället för i sektion ett. Granskningen blir on-demand;
 *    sektioner som behöver ögon bär amber-chips i kvittot.
 *
 * 2. **Startläget.** Kallstart går till Snabbofferten. Men den som gång på
 *    gång tar sig därifrån till editorn eller till en mall säger något med
 *    handling, och ska få slippa upprepa det. Efter tredje gången frågar vi
 *    EN gång.
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

const COMPLETED_KEY = 'handymate.quickQuote.completed'
const PREFERRED_KEY = 'handymate.quickQuote.preferredStart'
const ESCAPE_KEY = (mode: EscapeRoute) => `handymate.quickQuote.chose.${mode}`
const ASKED_KEY = (mode: EscapeRoute) => `handymate.quickQuote.asked.${mode}`

/** Efter så här många genomförda snabbofferter hoppas sekvensen över. */
export const SKIP_SEQUENCE_AFTER = 5

/** Efter så här många gånger på samma väg ut frågar vi EN gång. */
export const ASK_PREFERRED_AFTER = 3

/**
 * Ska utkastet landa direkt i översikten i stället för i sektion ett?
 *
 * Ren funktion — hela poängen med att bryta ut den är att tröskeln ska gå att
 * pröva utan att simulera en webbläsare.
 */
export function shouldSkipSequence(completedCount: number): boolean {
  return completedCount >= SKIP_SEQUENCE_AFTER
}

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

// ── Sekvensen ──────────────────────────────────────────────────────────

export function getCompletedCount(): number {
  return readNumber(COMPLETED_KEY)
}

/** Räknas EFTER en skickad snabboffert, aldrig när utkastet byggdes. */
export function recordCompletedQuickQuote(): number {
  const next = getCompletedCount() + 1
  write(COMPLETED_KEY, String(next))
  return next
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
