export type SetupStudioPreference = 'studio' | 'classic'

const STORAGE_KEY = 'hm_onboarding_setup_mode'

/**
 * Setup Studio är ett presentationslager, aldrig en behörighetsgrind.
 * Därför är den publika byggflaggan den enda förutsättningen och klassiskt
 * läge vinner fail-safe. Query-parametrarna finns för intern QA och påverkar
 * inga sparade företagsdata.
 */
export function resolveSetupStudioMode(
  featureFlag: string | undefined,
  search: string,
  storedPreference: string | null,
): boolean {
  if (featureFlag !== 'true') return false

  const params = new URLSearchParams(search)
  if (params.get('classic') === '1') return false
  if (params.get('studio') === '1') return true
  return storedPreference !== 'classic'
}

export function readSetupStudioPreference(): SetupStudioPreference | null {
  if (typeof window === 'undefined') return null
  const value = window.sessionStorage.getItem(STORAGE_KEY)
  return value === 'studio' || value === 'classic' ? value : null
}

export function writeSetupStudioPreference(preference: SetupStudioPreference): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(STORAGE_KEY, preference)
}

