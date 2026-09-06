/**
 * Första-uppdraget-beat — handoff-bryggan mellan onboardingens sista steg
 * (app/onboarding/components/Step6LiveTour.tsx) och Matte-chatten på
 * riktiga dashboarden (tasks/jaunty-pondering-hummingbird.md, Etapp R).
 *
 * ReaktiveringsInsikt-mönstret (setPendingPrompt + setActiveTab('chat') +
 * setIsOpen(true), ALDRIG auto-send — se components/jarvis/ReaktiveringsInsikt.tsx)
 * förutsätter JobbuddyProvider. Den providern finns BARA i
 * app/dashboard/layout.tsx — onboardingens egen layout (app/onboarding/layout.tsx)
 * saknar den, så useJobbuddy() hade kastat om Step6LiveTour anropat den direkt.
 *
 * Lösningen speglar app/onboarding/step2-draft.ts:s etablerade
 * sessionStorage-mönster: Step6LiveTour SKRIVER prompten precis innan den
 * navigerar till /dashboard, och components/jarvis/FirstMissionHandoff.tsx
 * LÄSER+NOLLAR den en gång när dashboarden monteras och kör då exakt
 * ReaktiveringsInsikt-mekaniken. Konsumeras alltid EXAKT en gång — en
 * sidladdning på /dashboard utan en väntande prompt gör ingenting.
 */

import { firstFocusOption } from '@/lib/onboarding/first-focus'

export const FIRST_MISSION_PROMPT_KEY = 'hm_first_mission_prompt'

/**
 * Bygger prompten Matte-chatten förifylls med. Ren funktion, inga
 * sidoeffekter — facit-testbar utan DOM/sessionStorage.
 *
 * ÄRLIGHETSREGEL: lovar aldrig ett färdigt facit — frågan är öppen ("vad är
 * viktigast"), inte ett confirm_mission-tvång. Ett osatt/0-mål ger den
 * generiska, målfria frågan i stället för att låtsas ett mål finnas.
 */
export function buildFirstMissionPrompt(revenueTargetAnnualSek?: number, firstFocus?: unknown): string {
  // Fokuset vinner (Lager 3 / B6, 2026-08-27): "Vad vill du att teamet
  // hjälper dig med först?" är det onboardingen numera frågar. Årsmålet
  // finns kvar för konton som satt det i Inställningar.
  const fokus = firstFocusOption(firstFocus)
  if (fokus) {
    return `${fokus.promptLine} Vad är det viktigaste vi kan göra den här veckan?`
  }
  if (typeof revenueTargetAnnualSek === 'number' && Number.isFinite(revenueTargetAnnualSek) && revenueTargetAnnualSek > 0) {
    const formatted = Math.round(revenueTargetAnnualSek).toLocaleString('sv-SE')
    return `Vi siktar på ${formatted} kr i år. Vad är det viktigaste vi kan göra den här veckan för att komma närmare?`
  }
  return 'Vad är det viktigaste vi kan göra den här veckan?'
}

/** En prompt tillhör ETT företag och gäller i högst en timme. Gamla globala
 * strängar konsumeras aldrig: de kan komma från ett annat konto. */
const MAX_AGE_MS = 60 * 60 * 1000
export function writeFirstMissionPrompt(prompt: string, businessId: string): boolean {
  if (!businessId || !prompt.trim()) return false
  try {
    sessionStorage.setItem(FIRST_MISSION_PROMPT_KEY, JSON.stringify({ businessId, prompt, createdAt: Date.now() }))
    return true
  } catch { return false }
}

export function clearFirstMissionPrompt(): void {
  try { sessionStorage.removeItem(FIRST_MISSION_PROMPT_KEY) } catch { /* best effort */ }
}

export function readAndClearFirstMissionPrompt(businessId: string): string | null {
  try {
    const value = sessionStorage.getItem(FIRST_MISSION_PROMPT_KEY)
    if (!value) return null
    sessionStorage.removeItem(FIRST_MISSION_PROMPT_KEY)
    const saved = JSON.parse(value)
    const age = Date.now() - saved.createdAt
    if (saved.businessId !== businessId || !Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return null
    return typeof saved.prompt === 'string' && saved.prompt.trim() ? saved.prompt : null
  } catch { return null }
}
