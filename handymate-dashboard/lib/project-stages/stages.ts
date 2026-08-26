/**
 * Projektets systemsteg — EN källa (2026-08-26, projektöversikten Del B).
 *
 * Tidigare fanns stegtabellen på tre ställen som handsynkades: SQL-seeden
 * (sql/v39_project_stages.sql), motorns SYSTEM_STAGES (automation-engine.ts)
 * och UI:ts FLOW_SYSTEM_STAGES (components/pipeline/unified/flow-constants.ts).
 * Den här modulen är REN (ingen Supabase, ingen React) så både servern och
 * klienten kan importera den. SQL-seeden är fortfarande databasens sanning;
 * facit-testet låser att tabellen här speglar den.
 */

export interface ProjectSystemStage {
  id: SystemStageId
  name: string
  short: string
  color: string
  icon: string
  position: number
}

export const SYSTEM_STAGES = {
  CONTRACT_SIGNED:   'ps-01',
  MEETING_BOOKED:    'ps-02',
  JOB_STARTED:       'ps-03',
  MILESTONE_REACHED: 'ps-04',
  FINAL_INSPECTION:  'ps-05',
  INVOICE_SENT:      'ps-06',
  INVOICE_PAID:      'ps-07',
  REVIEW_RECEIVED:   'ps-08',
} as const

export type SystemStageId = (typeof SYSTEM_STAGES)[keyof typeof SYSTEM_STAGES]

export const PROJECT_SYSTEM_STAGES: ProjectSystemStage[] = [
  { id: 'ps-01', name: 'Kontrakt signerat',  short: 'Kontrakt',   color: '#0F766E', icon: '✍️', position: 1 },
  { id: 'ps-02', name: 'Startmöte bokat',    short: 'Startmöte',  color: '#0284C7', icon: '📅', position: 2 },
  { id: 'ps-03', name: 'Jobb påbörjat',      short: 'Pågående',   color: '#7C3AED', icon: '🔨', position: 3 },
  { id: 'ps-04', name: 'Delmål uppnått',     short: 'Delmål',     color: '#B45309', icon: '🎯', position: 4 },
  { id: 'ps-05', name: 'Slutbesiktning',     short: 'Besiktning', color: '#DC2626', icon: '🔍', position: 5 },
  { id: 'ps-06', name: 'Faktura skickad',    short: 'Fakturerat', color: '#0369A1', icon: '📄', position: 6 },
  { id: 'ps-07', name: 'Faktura betald',     short: 'Betald',     color: '#16A34A', icon: '💰', position: 7 },
  { id: 'ps-08', name: 'Recension mottagen', short: 'Recension',  color: '#059669', icon: '⭐', position: 8 },
]

export function getSystemStage(id: string | null | undefined): ProjectSystemStage | undefined {
  if (!id) return undefined
  return PROJECT_SYSTEM_STAGES.find(s => s.id === id)
}

export function isSystemStageId(id: string | null | undefined): id is SystemStageId {
  return !!id && /^ps-\d\d$/.test(id) && PROJECT_SYSTEM_STAGES.some(s => s.id === id)
}

/** Etikett för ett projekt UTAN steg — ärligt i stället för att låtsas ps-01. */
export const NO_STAGE_LABEL = 'Inget steg ännu'
