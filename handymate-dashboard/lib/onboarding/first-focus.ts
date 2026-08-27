/**
 * "Vad vill du att teamet hjälper dig med först?" (Lager 3 / B6, 2026-08-27).
 *
 * Ersätter årsomsättningsmålet som onboardingfråga. Ett årsmål är ett
 * planeringsverktyg (finns kvar i Inställningar → Ekonomi och på månads-
 * rapporten) — inte något en hantverkare kan formulera i steg 2 innan
 * teamet gjort något. Fem knappar ger Matte ett omedelbart, användbart mål
 * utan att kunden behöver gissa en siffra.
 *
 * Lagras i business_config.onboarding_data.first_focus (JSONB, samma
 * mönster som testsamtalet) — ingen ny kolumn. Läses av:
 *   - buildFirstMissionPrompt (första Matte-frågan förifylls med fokuset)
 *   - next-best-action-goals (bakgrundsrad till rankningen — aldrig en regel)
 */
export type FirstFocusId = 'betalt_snabbare' | 'fler_jobb' | 'skydda_marginalen' | 'mindre_admin' | 'kontroll_projekt'

export interface FirstFocusOption {
  id: FirstFocusId
  /** Knappens text i onboardingen. */
  label: string
  /** Agenten som naturligt äger fokuset — för copy, inte routing. */
  leadAgent: 'karin' | 'hanna' | 'lars' | 'matte'
  /** Meningen Matte-prompten inleds med. */
  promptLine: string
}

export const FIRST_FOCUS_OPTIONS: ReadonlyArray<FirstFocusOption> = [
  { id: 'betalt_snabbare', label: 'Få betalt snabbare', leadAgent: 'karin', promptLine: 'Det viktigaste för mig just nu är att få betalt snabbare.' },
  { id: 'fler_jobb', label: 'Få in fler jobb', leadAgent: 'hanna', promptLine: 'Det viktigaste för mig just nu är att få in fler jobb.' },
  { id: 'skydda_marginalen', label: 'Skydda marginalen', leadAgent: 'lars', promptLine: 'Det viktigaste för mig just nu är att skydda marginalen på jobben.' },
  { id: 'mindre_admin', label: 'Minska administrationen', leadAgent: 'matte', promptLine: 'Det viktigaste för mig just nu är att slippa administration.' },
  { id: 'kontroll_projekt', label: 'Få bättre kontroll på projekten', leadAgent: 'lars', promptLine: 'Det viktigaste för mig just nu är bättre kontroll på projekten.' },
]

export function isFirstFocusId(value: unknown): value is FirstFocusId {
  return typeof value === 'string' && FIRST_FOCUS_OPTIONS.some(o => o.id === value)
}

export function firstFocusOption(id: unknown): FirstFocusOption | null {
  return isFirstFocusId(id) ? FIRST_FOCUS_OPTIONS.find(o => o.id === id) ?? null : null
}

/** Bakgrundsrad för modellkontext: "Ägarens uttalade fokus: få betalt snabbare." — null utan giltigt val. */
export function firstFocusContextLine(id: unknown): string | null {
  const o = firstFocusOption(id)
  return o ? `Ägarens uttalade fokus: ${o.label.toLowerCase()}.` : null
}
