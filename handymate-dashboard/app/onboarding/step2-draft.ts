/**
 * Fynd 3 (nykundsresan-granskning, 2026-07): en refresh INNAN kontot skapats
 * (t.ex. ett 401 på /api/onboarding-anropet i page.tsx medan användaren
 * fortfarande fyller i Step2Business) satte tidigare step tillbaka till 0 och
 * hela state — company_name, org.nr, e-post — försvann utan förvarning.
 *
 * Delad sessionStorage-nyckel + hjälpare mellan Step2Business.tsx (som
 * skriver/läser under ifyllnad) och page.tsx (som vid 401-resume behöver
 * veta OM ett utkast finns för att kunna hoppa till registreringssteget
 * istället för introt). ALDRIG lösenordet — bara de tre fält granskningen
 * pekade ut.
 */

export const STEP2_DRAFT_KEY = 'hm_onboarding_step2_draft'

export interface Step2Draft {
  companyName?: string
  orgNumber?: string
  email?: string
}

export function readStep2Draft(): Step2Draft | null {
  try {
    const raw = sessionStorage.getItem(STEP2_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function hasStep2Draft(): boolean {
  const d = readStep2Draft()
  return !!(d && (d.companyName?.trim() || d.orgNumber?.trim() || d.email?.trim()))
}

export function writeStep2Draft(draft: Step2Draft): void {
  try {
    sessionStorage.setItem(STEP2_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Privat läge / storage otillgänglig — degradera tyst, samma
    // "aldrig fastna"-princip som resten av onboardingen.
  }
}

export function clearStep2Draft(): void {
  try {
    sessionStorage.removeItem(STEP2_DRAFT_KEY)
  } catch {
    /* ignorera */
  }
}
