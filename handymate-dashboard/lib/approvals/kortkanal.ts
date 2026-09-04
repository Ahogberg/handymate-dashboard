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
 *
 * Beslut 2026-09-04, samma dag: `checklist_forslag` flyttades tillbaka till
 * 'kort'. Utgångsandelen var hög (23/25) men den är inte information — Lars
 * föreslår en branschchecklista för ett NYSS skapat projekt, och att fästa
 * den vid projektet är ett beslut bara ägaren kan ta. Den var också den
 * enda av de fyra som faktiskt godkändes ibland (2 av 25; de andra tre:
 * 1, 0, 0). Att den syns som kort är dessutom vad F13-scenen i
 * lanseringsfilmen bevisar (tests/filming/f13-lagg-dig.spec.ts) och vad
 * brusgrinden i suggest-checklist.ts dedupar mot.
 */

export const KORTKANAL: Record<string, 'kort' | 'digest'> = {
  agent_observation: 'digest',
  dispatch_suggestion: 'digest',
  monthly_review: 'digest',
  // Uttryckligen 'kort' (inte utelämnad) så beslutet syns här, där kartan läses.
  checklist_forslag: 'kort',
}

/** Ren funktion — okänd/oregistrerad typ blir 'kort' (dagens beteende). */
export function kanalFor(approvalType: string): 'kort' | 'digest' {
  return KORTKANAL[approvalType] ?? 'kort'
}
