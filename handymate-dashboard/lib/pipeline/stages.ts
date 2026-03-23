/**
 * V28 — Locked pipeline stages (6 fixed stages)
 * These are the ONLY valid pipeline stages. No CRUD.
 */

export const PIPELINE_STAGES = [
  {
    id: 'new_inquiry' as const,
    label: 'Ny förfrågan',
    color: '#6B7280',
    description: 'Inkommande lead, ej kontaktad',
    isTerminal: false,
  },
  {
    id: 'contacted' as const,
    label: 'Kontaktad',
    color: '#0F766E',
    description: 'Svar skickat via SMS/samtal/mail',
    isTerminal: false,
  },
  {
    id: 'quote_sent' as const,
    label: 'Offert skickad',
    color: '#0D9488',
    description: 'Offert genererad och skickad till kund',
    isTerminal: false,
  },
  {
    id: 'quote_accepted' as const,
    label: 'Offert accepterad',
    color: '#0F766E',
    description: 'Kund har signerat digitalt',
    isTerminal: false,
  },
  {
    id: 'won' as const,
    label: 'Vunnen',
    color: '#22C55E',
    description: 'Affär vunnen — projekt aktivt',
    isTerminal: true,
  },
  {
    id: 'lost' as const,
    label: 'Förlorad',
    color: '#EF4444',
    description: 'Affär avslutad utan jobb',
    isTerminal: true,
  },
] as const

export type PipelineStageId = typeof PIPELINE_STAGES[number]['id']

export const ACTIVE_STAGES = PIPELINE_STAGES.filter(s => !s.isTerminal)
export const TERMINAL_STAGES = PIPELINE_STAGES.filter(s => s.isTerminal)

/** Valid transitions — any active stage can move to any other stage (including backward).
 *  Terminal stages (won/lost) can be reopened back to any active stage. */
export const VALID_TRANSITIONS: Record<PipelineStageId, PipelineStageId[]> = {
  new_inquiry: ['contacted', 'quote_sent', 'quote_accepted', 'won', 'lost'],
  contacted: ['new_inquiry', 'quote_sent', 'quote_accepted', 'won', 'lost'],
  quote_sent: ['new_inquiry', 'contacted', 'quote_accepted', 'won', 'lost'],
  quote_accepted: ['new_inquiry', 'contacted', 'quote_sent', 'won', 'lost'],
  won: ['new_inquiry', 'contacted', 'quote_sent', 'quote_accepted', 'lost'],
  lost: ['new_inquiry', 'contacted', 'quote_sent', 'quote_accepted', 'won'],
}

export function isValidTransition(from: PipelineStageId, to: PipelineStageId): boolean {
  if (from === to) return false
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function getStageById(id: string) {
  return PIPELINE_STAGES.find(s => s.id === id)
}

export const LOST_REASONS = [
  { value: 'price', label: 'Priset för högt' },
  { value: 'timing', label: 'Fel timing' },
  { value: 'competitor', label: 'Valde konkurrent' },
  { value: 'no_response', label: 'Ingen respons' },
  { value: 'other', label: 'Annat' },
] as const
