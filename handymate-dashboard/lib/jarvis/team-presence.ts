/**
 * Vem i teamet har gjort något, och vad senast.
 *
 * ═══ VARFÖR BANDET FINNS ═══
 *
 * "Mitt AI-team idag" var det som fick den gamla Idag-vyn att kännas som ett
 * team och inte som en inkorg. Jarvis-vyn tappade den känslan: agenterna syns
 * bara på korten, och en morgon utan beslut visar inga ansikten alls. Då ser
 * det ut som att ingen jobbat — trots att teamet svarat i telefon hela natten.
 *
 * ═══ VARFÖR DEN INTE HÄMTAR NÅGOT ═══
 *
 * Bandet härleds ur data vyn REDAN har: observationerna agenterna skrivit och
 * raderna i Klart idag. Ingen ny fetch, ingen ny tabell. En yta som bara
 * omformar det man redan vet kan aldrig visa något annat än resten av sidan.
 *
 * ═══ VAD DEN ALDRIG GÖR ═══
 *
 * Hittar aldrig på aktivitet. En agent utan spår senaste dygnet står inte i
 * bandet — hellre fyra ansikten som är sanna än sex där två är dekoration.
 *
 * Ren funktion — facit i tests/jarvis-team-presence.spec.ts.
 */
import { TEAM } from '@/lib/agents/team'

export interface NarvaroRad {
  agentId: string
  namn: string
  /** Senaste raden agenten lämnat spår av. Kortas i vyn, inte här. */
  senaste: string
  /** Antal spår senaste dygnet — bär "3 samtal"-känslan utan att räkna fel. */
  antal: number
}

export interface Spar {
  agentId: string
  text: string
  /** ISO eller klockslag — används bara för att sortera, aldrig för att visa. */
  vid?: string
}

/**
 * Bygger bandet ur spåren.
 *
 * Ordningen följer TEAM, inte aktivitet: teamet ska stå i samma ordning varje
 * morgon. Ett band som hoppar om sig är svårare att skumma än ett som är
 * långsamt föråldrat.
 */
export function byggNarvaro(spar: Spar[]): NarvaroRad[] {
  const perAgent = new Map<string, Spar[]>()
  for (const s of spar) {
    if (!s?.agentId || !s.text) continue
    const lista = perAgent.get(s.agentId)
    if (lista) lista.push(s)
    else perAgent.set(s.agentId, [s])
  }

  const ut: NarvaroRad[] = []
  for (const agent of TEAM) {
    const lista = perAgent.get(agent.id)
    if (!lista || lista.length === 0) continue
    // Senaste först. Saknas tidsstämpel behålls inmatningsordningen — den är
    // redan nyast först i vyn.
    const sorterad = [...lista].sort((a, b) => (b.vid || '').localeCompare(a.vid || ''))
    ut.push({
      agentId: agent.id,
      namn: agent.name,
      senaste: sorterad[0].text,
      antal: lista.length,
    })
  }
  return ut
}
