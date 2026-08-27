/**
 * Next Best Action Engine — prompt-byggare + svar-validator (2026-08-13).
 *
 * Rått fetch-anrop mot Anthropic Messages API, samma lågnivåmönster som
 * lib/autopilot/quote-nudge.ts och lib/agents/shared/thinking-call.ts —
 * men EGEN parse/validering, inte callAgentWithThinking. Den funktionen
 * är hårt formad för AgentObservation[] (en lista observationer); NBA:s
 * uppgift är "rangordna + motivera en given mängd", en annan form helt.
 *
 * Datum och summor räknas ALDRIG av modellen (lib/jarvis/
 * next-best-action-normalize.ts gör det, i egen kod) — modellen får
 * färdigformulerade KÄNT/UPPSKATTAT-fakta och producerar bara den
 * jämförande motiveringen. "En summa är inte en åsikt" (Kvittoprincipen).
 *
 * Svaret valideras STRIKT innan något får skrivas till DB (lib/jarvis/
 * next-best-action.ts) — fel format ⇒ loggat, ingen insert, ALDRIG
 * tvingat/trunkerat till något som ser giltigt ut.
 */

import { fuelAllows } from '@/lib/costs/fuel'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedCandidate } from './next-best-action-normalize'
import { meterDirectLlmCall } from '@/lib/agents/shared/cost-guard'
import { llmCostUsd } from '@/lib/costs/meter'

export const NEXT_BEST_ACTION_MODEL = 'claude-sonnet-4-6'

export interface RankedEntry {
  approval_id: string
  rationale: string
}

export interface NextBestActionModelOutput {
  top_pick_approval_id: string
  reasoning: string
  principles_applied: string[]
  ranked: RankedEntry[]
}

export const NEXT_BEST_ACTION_SYSTEM_PROMPT = `Du är Matte, koordinatorn för Handymates agentteam. Du väger inte
pengar mot pengar rakt av — du väger olika SORTERS värde mot varandra
(pengar, brådska, kundrisk, ansträngning) enligt ägarens egna
prioriteringsprinciper, precis som en erfaren hantverkare skulle göra på
en morgon med flera obesvarade ärenden.

Du får en lista konkurrerande beslut som väntar på ägaren, redan
försedda med KÄNT (ett verkligt, uppmätt faktum) eller UPPSKATTAT (en
prognos/ett estimat) — lita på den märkningen, gissa aldrig ett eget
belopp eller datum. Du får också ägarens egna prioriteringsprinciper,
skrivna i fritext.

Ditt jobb: rangordna alla kandidater, peka ut EN att göra först, och
motivera med de principer som faktiskt avgjorde saken — citera dem
ordagrant i principles_applied. Om ingen princip tydligt avgör en given
rangordning, lämna principles_applied tom snarare än att hitta på en
koppling.

Utöver ägarens skrivna principer väger du alltid in fyra allmänna mönster
som håller oavsett vilket företag det gäller — det här är DITT eget
omdöme, inte ägarens ord:
- Ett ärende som blockerar riktigt arbete inom kort (t.ex. ett beslut som
  krävs innan imorgondagens jobb ute hos kund kan fortsätta) väger tyngre
  än ett som bara väntar, oavsett belopp.
- Enkla, redan klara åtgärder klaras undan först — inte för att de är
  viktigast, utan för att de kostar nästan inget och frigör uppmärksamhet
  till det som kräver mer eftertanke.
- Tunga, obekväma utredningar skjuts ofta bakom en enklare åtgärd, men ska
  aldrig försvinna helt ur sikte — sekvenseras om till en senare plats,
  inte bort.
- Ett stort, redan engagerat ärende (t.ex. en offert kunden öppnat flera
  gånger) väger tyngre än flera små påminnelser.

VIKTIGT: dessa fyra mönster är ditt eget allmänna resonemang, INTE en
skriven princip från ägaren — citera dem ALDRIG i principles_applied.
Det fältet är reserverat uteslutande för ordagranna citat ur ÄGARENS
PRIORITERINGSPRINCIPER nedan. Om ett av mönstren ovan påverkade
rangordningen men ingen skriven princip gjorde det, lämna
principles_applied tom — precis som instruktionen ovan redan säger.

Du kan ibland också få en sektion "ÄGARENS MÅL" — bakgrundsfakta om
omsättningstakt, aldrig en egen princip. Väg bara in den i din motivering
om en av de skrivna principerna faktiskt handlar om takt, mål eller
omsättning; annars ignorera den helt.

Svara ENDAST med ett JSON-objekt, exakt denna form, inget annat:
{
  "top_pick_approval_id": "<id ur listan>",
  "reasoning": "<en kort mening, svenska, varför just detta först>",
  "principles_applied": ["<ordagrant citat ur en princip>", ...],
  "ranked": [
    { "approval_id": "<id>", "rationale": "<kort motivering för denna plats>" },
    ...
  ]
}
"ranked" måste innehålla VARJE kandidat-id exakt en gång, topplatsen
("top_pick_approval_id") först.`

export function buildUserMessage(
  candidates: NormalizedCandidate[],
  principles: string[],
  goalContextLine: string | null = null,
): string {
  const candidateLines = candidates
    .map(c => {
      const belopp =
        c.financial_impact_kr != null && c.financial_impact_kind
          ? `${c.financial_impact_kind}: ${c.financial_impact_kr.toLocaleString('sv-SE')} kr`
          : 'inget belopp'
      const brådska = c.urgency_note || 'ingen tidsfakta'
      const vem = c.project_or_customer || '—'
      return `- id=${c.approval_id} | typ=${c.approval_type} | "${c.title}" | ${belopp} | ${brådska} | ${vem} | skapad för ${c.age_days} dag${c.age_days === 1 ? '' : 'ar'} sedan`
    })
    .join('\n')

  const principleLines = principles.length > 0 ? principles.map(p => `- ${p}`).join('\n') : '(inga principer skrivna än)'

  const goalSection = goalContextLine
    ? `\n\nÄGARENS MÅL (bakgrundsfakta, inte en prioriteringsregel):\n${goalContextLine}`
    : ''

  return `KONKURRERANDE BESLUT SOM VÄNTAR:\n${candidateLines}\n\nÄGARENS PRIORITERINGSPRINCIPER:\n${principleLines}${goalSection}\n\nRangordna kandidaterna och peka ut vilken som ska göras först.`
}

/**
 * Ren. Ingen I/O — validerar ett redan uppparsat modell-svar mot den
 * exakta kandidatmängden. Testbar utan nätverk.
 */
export function validateModelOutput(raw: unknown, candidateIds: string[]): NextBestActionModelOutput | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const idSet = new Set(candidateIds)

  const topPick = obj.top_pick_approval_id
  if (typeof topPick !== 'string' || !idSet.has(topPick)) return null

  const reasoning = obj.reasoning
  if (typeof reasoning !== 'string' || reasoning.trim().length === 0) return null

  const principlesRaw = obj.principles_applied
  if (!Array.isArray(principlesRaw)) return null
  const principles_applied = principlesRaw.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)

  const rankedRaw = obj.ranked
  if (!Array.isArray(rankedRaw) || rankedRaw.length !== candidateIds.length) return null

  const ranked: RankedEntry[] = []
  const seen = new Set<string>()
  for (const entry of rankedRaw) {
    if (!entry || typeof entry !== 'object') return null
    const e = entry as Record<string, unknown>
    const approvalId = e.approval_id
    const rationale = e.rationale
    if (typeof approvalId !== 'string' || !idSet.has(approvalId)) return null
    if (typeof rationale !== 'string' || rationale.trim().length === 0) return null
    if (seen.has(approvalId)) return null // varje kandidat exakt en gång
    seen.add(approvalId)
    ranked.push({ approval_id: approvalId, rationale: rationale.trim() })
  }
  if (seen.size !== idSet.size) return null // täcker alla, inga saknas
  if (ranked[0].approval_id !== topPick) return null // topplatsen ska matcha

  return {
    top_pick_approval_id: topPick,
    reasoning: reasoning.trim(),
    principles_applied,
    ranked,
  }
}

/**
 * IO: anropar Anthropic direkt (samma rå fetch-stil som
 * lib/autopilot/quote-nudge.ts), parsar och validerar strikt. Returnerar
 * null vid VARJE avvikelse — saknad API-nyckel, nätverksfel, inget
 * JSON-objekt i svaret, eller ett svar som inte klarar valideringen.
 * Anroparen (lib/jarvis/next-best-action.ts) tolkar null som "ingen
 * rankning idag", loggar och skriver ingen rad.
 */
export async function callNextBestActionModel(
  candidates: NormalizedCandidate[],
  principles: string[],
  businessId: string,
  supabase: SupabaseClient,
  goalContextLine: string | null = null,
): Promise<NextBestActionModelOutput | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn('[next-best-action] ANTHROPIC_API_KEY saknas')
    return null
  }
  // Bränsle slut ⇒ samma väg som saknad nyckel: anroparen faller tillbaka på
  // sin deterministiska rankning.
  if (!(await fuelAllows(supabase, businessId, 'next_best_action'))) return null

  const candidateIds = candidates.map(c => c.approval_id)

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: NEXT_BEST_ACTION_MODEL,
        max_tokens: 1500,
        system: NEXT_BEST_ACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage(candidates, principles, goalContextLine) }],
      }),
    })

    if (!res.ok) {
      console.error('[next-best-action] Anthropic API-fel:', res.status, await res.text().catch(() => ''))
      return null
    }

    const data: any = await res.json()

    // COGS-boken — Next Best Action-rankningen (Sonnet), tidigare helt
    // omätt. Mäts oavsett om svaret sedan klarar valideringen — Anthropic
    // debiterar oss redan här.
    await meterDirectLlmCall({
      supabase,
      businessId,
      usage: data?.usage,
      costUsd: llmCostUsd(data?.usage, NEXT_BEST_ACTION_MODEL),
      refType: 'next_best_action_ranking',
      refId: `${businessId}_${Date.now()}`,
    })

    const textBlock = (data.content || []).find((b: any) => b.type === 'text')
    const text: string | undefined = textBlock?.text
    if (!text) {
      console.error('[next-best-action] inget textblock i svaret')
      return null
    }

    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      console.error('[next-best-action] inget JSON-objekt i svaret:', text.slice(0, 300))
      return null
    }

    const parsed = JSON.parse(match[0])
    const validated = validateModelOutput(parsed, candidateIds)
    if (!validated) {
      console.error('[next-best-action] svar klarade inte valideringen:', JSON.stringify(parsed).slice(0, 500))
      return null
    }
    return validated
  } catch (err) {
    console.error('[next-best-action] anrop misslyckades:', err instanceof Error ? err.message : err)
    return null
  }
}
