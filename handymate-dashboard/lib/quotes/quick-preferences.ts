/**
 * Snabboffertens inlärning (etapp D, 2026-08-06).
 *
 * ═══ PROBLEMET ═══
 *
 * Offert nummer 40 ska inte kräva samma steg som nummer 1. Ett flöde som
 * tvingar fram fyra granskningssteg varje gång blir något man börjar undvika
 * — och då är vi tillbaka i "blir galen", bara med en snyggare skärm.
 *
 * ═══ VAD SOM LÄRS IN ═══
 *
 * Efter fem genomförda snabbofferter landar utkastet direkt i ÖVERSIKTEN i
 * stället för i sektion ett. Granskningen blir on-demand: sektioner som
 * behöver ögon bär amber-chips i kvittot, och varje chip är en ingång dit.
 * Ingenting tas bort — sekvensen finns kvar, den slutar bara vara startläget.
 *
 * ═══ VARFÖR localStorage OCH INTE DATABASEN ═══
 *
 * Det här är en vana per person och enhet, inte affärsdata. En kolumn hade
 * krävt en migration, en API-rutt och ett beslut om vad som händer när två
 * anställda delar konto. Räknaren får gärna nollställas när någon byter
 * telefon — då får hen se sekvensen igen, vilket är helt rimligt.
 *
 * Beslutsfunktionerna är RENA och tar räknaren som argument, så de kan
 * facit-testas utan webbläsare. Bara läs/skriv rör localStorage.
 */

const COMPLETED_KEY = 'handymate.quickQuote.completed'
const PREFERRED_KEY = 'handymate.quickQuote.preferred'
const ASKED_KEY = 'handymate.quickQuote.askedPreferred'

/** Efter så här många genomförda snabbofferter hoppas sekvensen över. */
export const SKIP_SEQUENCE_AFTER = 5

/** Efter så här många frågar vi EN gång om det ska bli standardvägen. */
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
export function shouldAskPreferred(completedCount: number, alreadyAsked: boolean): boolean {
  return !alreadyAsked && completedCount === ASK_PREFERRED_AFTER
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

function readFlag(key: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
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

export function getCompletedCount(): number {
  return readNumber(COMPLETED_KEY)
}

/** Räknas EFTER en skickad snabboffert, aldrig när utkastet byggdes. */
export function recordCompletedQuickQuote(): number {
  const next = getCompletedCount() + 1
  write(COMPLETED_KEY, String(next))
  return next
}

/** Hantverkaren har valt Snabbofferten som standardväg. */
export function isPreferredStart(): boolean {
  return readFlag(PREFERRED_KEY)
}

export function setPreferredStart(preferred: boolean): void {
  write(PREFERRED_KEY, preferred ? '1' : '0')
  write(ASKED_KEY, '1')
}

export function hasBeenAskedPreferred(): boolean {
  return readFlag(ASKED_KEY)
}

export function markAskedPreferred(): void {
  write(ASKED_KEY, '1')
}
