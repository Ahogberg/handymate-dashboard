/**
 * agentPersonas — HÄRLEDD vy av teamet, inte en egen källa.
 *
 * ═══ VARFÖR DEN INTE LÄNGRE ÄGER SIN DATA (spår D1, 2026-08-06) ═══
 *
 * Teamet fanns i fyra kopior: `lib/agents/team.ts`, den här filen, en inlinead
 * karta i `app/dashboard/approvals/page.tsx` och en till i
 * `MorningBriefWidget.tsx`. Kopiorna hade hunnit gå isär på precis det sätt
 * kopior gör:
 *
 * - **Lisa saknades helt i morgonbriefen.** Hantverkarens telefonist syntes
 *   alltså inte i den vy som ska sammanfatta vad teamet gjort.
 * - **Lars var oliv** (#3B6D11) i briefen men smaragd (#059669) överallt
 *   annars, och **Hanna var rosa** (#993556) i briefen men lila (#9333ea)
 *   överallt annars. Samma agent, olika person beroende på var man tittade.
 *
 * Filen finns kvar för att `AGENT_INFO`-formen används av IdagCore och
 * ProjectApprovalsBlock — men den HÄRLEDS nu ur TEAM. En agent som läggs till
 * i teamet dyker upp här av sig själv, och kan aldrig få en annan färg.
 *
 * Persona-färgerna är de enda tillåtna icke-teal-accenterna i UI:t
 * (se docs/HANDYMATE_DESIGN_SYSTEM.md, avsnittet om agentytor).
 */
import { TEAM } from '@/lib/agents/team'

export interface AgentPersona {
  name: string
  role: string
  color: string
  initials: string
  dot: string
}

export const AGENT_INFO: Record<string, AgentPersona> = Object.fromEntries(
  TEAM.map(a => [
    a.id,
    { name: a.name, role: a.role, color: a.color, initials: a.initials, dot: a.dot },
  ]),
)
