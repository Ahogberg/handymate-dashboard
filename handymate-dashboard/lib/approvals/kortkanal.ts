/**
 * kortkanal — vilka approval_type blir ett kort, och vilka bara en rad i
 * digesten ("Skött utan dig").
 *
 * Bakgrund (docs/audits/AUTOPILOT_REVISION_2026-09-04.md, avsnitt 4 —
 * "Teamet pratar för mycket, i för många röster"): fyra typer hade i
 * produktionen > 90 % utgångsandel — `agent_observation` (104/105),
 * `dispatch_suggestion` (35/36), `monthly_review` (12/12),
 * `checklist_forslag` (23/25). De kräver inget beslut, de är information —
 * och när information ser ut som ett kort lär sig kunden att kort kan
 * ignoreras, vilket även smittar av sig på korten som FAKTISKT behöver ett
 * beslut (fakturapåminnelsen, Karins deadline).
 *
 * Reversibelt via den här kartan, INTE genom att ta bort kod: att flytta en
 * typ tillbaka till 'kort' är en enradsändring, ingen kodåterställning.
 * Allt som inte står här är implicit 'kort' — en ny approval_type kräver
 * alltså inget tillägg för att förbli ett kort som idag.
 */

export const KORTKANAL: Record<string, 'kort' | 'digest'> = {
  agent_observation: 'digest',
  dispatch_suggestion: 'digest',
  monthly_review: 'digest',
  checklist_forslag: 'digest',
}

/** Ren funktion — okänd/oregistrerad typ blir 'kort' (dagens beteende). */
export function kanalFor(approvalType: string): 'kort' | 'digest' {
  return KORTKANAL[approvalType] ?? 'kort'
}
