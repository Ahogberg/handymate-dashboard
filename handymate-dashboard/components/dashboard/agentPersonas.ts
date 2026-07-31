/**
 * agentPersonas — delad agent-metadata (Projektvy Fas 1, 2026-07-31).
 *
 * Extraherad ur IdagCore.tsx (AGENT_INFO) så samma persona-kartan kan
 * återanvändas av ProjectApprovalsBlock.tsx (projekt-detaljvyns
 * godkänn-kort) utan att duplicera färger/initialer/namn. IdagCore.tsx
 * importerar nu härifrån istället för att äga sin egen kopia — ingen
 * annan ändring i IdagCore.
 *
 * Persona-färgerna är de enda tillåtna icke-teal-accenterna i UI:t
 * (se handoff/projektvy/HANDOFF.md och DESIGN-NOTES.md).
 */
export interface AgentPersona {
  name: string
  role: string
  color: string
  initials: string
  dot: string
}

export const AGENT_INFO: Record<string, AgentPersona> = {
  matte: { name: 'Matte', role: 'Chefsassistent', color: 'bg-primary-700', dot: '#0f766e', initials: 'M' },
  karin: { name: 'Karin', role: 'Ekonom', color: 'bg-blue-600', dot: '#2563eb', initials: 'K' },
  hanna: { name: 'Hanna', role: 'Marknadschef', color: 'bg-purple-600', dot: '#9333ea', initials: 'H' },
  daniel: { name: 'Daniel', role: 'Säljare', color: 'bg-amber-600', dot: '#d97706', initials: 'D' },
  lars: { name: 'Lars', role: 'Projektledare', color: 'bg-emerald-600', dot: '#059669', initials: 'L' },
  lisa: { name: 'Lisa', role: 'Kundservice', color: 'bg-sky-500', dot: '#0ea5e9', initials: 'Li' },
}
