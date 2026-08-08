import type { AgentId } from '@/lib/agent/capabilities'
import type { DemoManifest, DemoStoryEntityKey } from '@/lib/demo/manifest'

export const DEMO_STORY_VERSION = 'v1' as const
export const DEMO_STORY_STORAGE_KEY = 'hm_demo_story_step'

export type DemoLiveAction = 'open' | 'ask_matte' | 'recap'
export type DemoAmountSource =
  | { kind: 'quote'; entityKey: 'stale_quote' }
  | { kind: 'pengar'; category: 'marginalrisk' | 'forfallet' }

export interface DemoStep {
  stepId: string
  agent: AgentId
  title: string
  talkingPoint: string
  entityKey: DemoStoryEntityKey
  targetRoute: string
  expectedEvidence: readonly string[]
  expectedOutcome: string
  liveAction: DemoLiveAction
  amountSource?: DemoAmountSource
}

export interface DemoStory {
  storyId: 'handymate-value-day'
  version: typeof DEMO_STORY_VERSION
  steps: DemoStep[]
}

type DemoStepDefinition = Omit<DemoStep, 'targetRoute'> & {
  targetRoute: (entityId: string) => string
}

const DEFINITIONS = [
  {
    stepId: 'matte-brief',
    agent: 'matte',
    title: 'Matte samlar dagen',
    talkingPoint: 'Börja i Mattes morgonbrief: här syns vad som behöver uppmärksamhet och varför.',
    entityKey: 'morning_brief',
    targetRoute: () => '/dashboard',
    expectedEvidence: ['Morgonbrief', 'Agenternas aktuella fynd'],
    expectedOutcome: 'Prospektet förstår att Matte prioriterar arbetsdagen.',
    liveAction: 'open',
  },
  {
    stepId: 'daniel-revenue',
    agent: 'daniel',
    title: 'Daniel hittar intäkten',
    talkingPoint: 'Daniel visar offerten värd {amount} som fortfarande väntar på svar.',
    entityKey: 'stale_quote',
    targetRoute: entityId => `/dashboard/quotes/${encodeURIComponent(entityId)}`,
    expectedEvidence: ['Riktig skickad offert', 'Offertens aktuella totalsumma'],
    expectedOutcome: 'Prospektet ser en konkret försäljningsmöjlighet som annars riskerar att kallna.',
    liveAction: 'open',
    amountSource: { kind: 'quote', entityKey: 'stale_quote' },
  },
  {
    stepId: 'lars-margin',
    agent: 'lars',
    title: 'Lars skyddar marginalen',
    talkingPoint: 'Lars visar projektets marginalrisk på {amount} och vilket underlag som driver den.',
    entityKey: 'margin_project',
    targetRoute: entityId => `/dashboard/projects/${encodeURIComponent(entityId)}`,
    expectedEvidence: ['Riktigt projekt', 'Marginalrisk från Pengar på bordet'],
    expectedOutcome: 'Prospektet ser hur Handymate varnar innan marginalen försvinner.',
    liveAction: 'open',
    amountSource: { kind: 'pengar', category: 'marginalrisk' },
  },
  {
    stepId: 'karin-cash',
    agent: 'karin',
    title: 'Karin får pengarna hem',
    talkingPoint: 'Karin visar förfallna kundfordringar på {amount} och vägen till en riktig påminnelse.',
    entityKey: 'overdue_invoice',
    targetRoute: entityId => `/dashboard/invoices/${encodeURIComponent(entityId)}`,
    expectedEvidence: ['Riktig förfallen faktura', 'Riktigt påminnelseunderlag'],
    expectedOutcome: 'Prospektet ser att redan intjänade pengar inte tappas bort i administrationen.',
    liveAction: 'open',
    amountSource: { kind: 'pengar', category: 'forfallet' },
  },
  {
    stepId: 'live-matte',
    agent: 'matte',
    title: 'Fråga Matte live',
    talkingPoint: 'Ställ en egen fråga om projektet i Jobbkompisen. Svaret ska komma från riktiga data.',
    entityKey: 'live_matte_project',
    targetRoute: entityId => `/dashboard/projects/${encodeURIComponent(entityId)}`,
    expectedEvidence: ['Projektet öppet i produktionsvyn', 'Ett live-svar från Matte och rätt specialist'],
    expectedOutcome: 'Prospektet upplever Matte som den naturliga ingången till specialistteamet.',
    liveAction: 'ask_matte',
  },
  {
    stepId: 'value-recap',
    agent: 'matte',
    title: 'Samla värdet',
    talkingPoint: 'Avsluta med värdebeviset: identifierad potential och bekräftat värde visas var för sig.',
    entityKey: 'value_recap',
    targetRoute: () => '/dashboard/pengar',
    expectedEvidence: ['Kategorier från Pengar på bordet', 'Bekräftat värde från attributionskärnan'],
    expectedOutcome: 'Prospektet ser pengar, marginalskydd och minskad administration utan dubbelräkning.',
    liveAction: 'recap',
  },
] as const satisfies readonly DemoStepDefinition[]

export function buildDemoStory(manifest: DemoManifest): DemoStory {
  return {
    storyId: 'handymate-value-day',
    version: DEMO_STORY_VERSION,
    steps: DEFINITIONS.map(definition => ({
      ...definition,
      expectedEvidence: [...definition.expectedEvidence],
      targetRoute: definition.targetRoute(manifest[definition.entityKey]),
    })),
  }
}
