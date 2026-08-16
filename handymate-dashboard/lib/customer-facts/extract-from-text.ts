/**
 * Kundfakta-extraktion ur fritext (Customer Memory V1.1, 2026-08-16).
 *
 * ═══ VARFÖR EN EGEN MODUL ═══
 *
 * Röstkanalerna (möte + telefon) extraherar kundfakta inne i den stora
 * analysprompten i app/api/voice/analyze/route.ts. E-post har ingen sådan
 * analysmotor — Mattes intent-agent (lib/matte/intent-agent.ts) är en
 * BESLUTSLOOP per meddelande (vilken åtgärd ska tas), inte en extraktions-
 * yta, och kontextrevisionen noterade uttryckligen att extraktion inte ska
 * bultas in där. Därför en fristående, återanvändbar extraktor som
 * anroparen (lib/gmail/processor.ts) kör som ren berikning.
 *
 * Kontraktet är detsamma som röstgrenarnas, medvetet: bara EXPLICIT sagda
 * saker, ordagrant citat, max 5, aldrig åtkomstkoder. Fynden blir
 * granskningsbara kort i pending_approvals via den delade kortbyggaren
 * (lib/customer-facts/build-card.ts) — aldrig direkta customer_fact-rader.
 *
 * Scope-avgränsning V1.1: bara Gmail-inkommande. Postmark-lead-intaget
 * (app/api/email/inbound/route.ts) kopplas medvetet INTE in — de avsändarna
 * är oftast leads, inte kunder, och fakta är alltid kundnycklade.
 *
 * Misslyckas något returneras [] — extraktion är berikning och får aldrig
 * blockera mejlflödet.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getClaudeModel } from '@/lib/ai/get-model'

export interface ExtractedFact {
  fact_type: 'preference' | 'constraint' | 'commitment' | 'contact'
  content: string
  evidence_quote: string
  confidence: number
}

/**
 * Fångad i en exporterad konstant så anroparens beslutspost (decision_record)
 * stämplar den modell som FAKTISKT användes — samma princip som
 * analysModell-variabeln i voice/analyze.
 */
export const EMAIL_FAKTA_MODELL = getClaudeModel('extraction')

/**
 * Tröskel: texter kortare än så här hoppas över utan AI-anrop. "Ok tack!"
 * och "Vi ses imorgon kl 9" bär i praktiken aldrig ett varaktigt kundfaktum,
 * men hade annars kostat ett Haiku-anrop per mejl — och korta bekräftelser
 * är den vanligaste mejltypen. 80 tecken motsvarar ungefär en hel mening
 * med sammanhang, den kortaste text där ett citerbart faktum ryms.
 */
export const MIN_TEXT_LANGD = 80

const TILLATNA_FACT_TYPES = new Set(['preference', 'constraint', 'commitment', 'contact'])

/**
 * Plockar ut och validerar fakta-listan ur ett AI-svar. Ren funktion —
 * facit-testad direkt i tests/customer-facts.spec.ts. Speglar
 * parseraJsonSvar-mönstret i voice/analyze (svaret är nästan alltid ren
 * JSON, men modellen lägger ibland text runt den ändå), plus fältvalidering:
 * gränserna (tillåtna typer, max 5) är kod, inte prompttillit.
 */
export function parseFaktaSvar(text: string): ExtractedFact[] {
  try {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) return []
      parsed = JSON.parse(match[0])
    }
    const lista = Array.isArray((parsed as { fakta?: unknown })?.fakta)
      ? ((parsed as { fakta: unknown[] }).fakta)
      : []
    return lista
      .filter((f): f is Record<string, unknown> =>
        !!f && typeof f === 'object' &&
        TILLATNA_FACT_TYPES.has((f as Record<string, unknown>).fact_type as string) &&
        typeof (f as Record<string, unknown>).content === 'string' &&
        ((f as Record<string, unknown>).content as string).trim().length > 0 &&
        typeof (f as Record<string, unknown>).evidence_quote === 'string' &&
        ((f as Record<string, unknown>).evidence_quote as string).trim().length > 0
      )
      .slice(0, 5)
      .map((f) => ({
        fact_type: f.fact_type as ExtractedFact['fact_type'],
        content: (f.content as string).trim(),
        evidence_quote: (f.evidence_quote as string).trim(),
        confidence: typeof f.confidence === 'number' ? Math.min(Math.max(f.confidence, 0), 1) : 0.5,
      }))
  } catch {
    return []
  }
}

function byggPrompt(text: string): string {
  return `Du analyserar ett inkommande e-postmeddelande som en kund skrev till ett hantverksföretag.

=== E-POSTMEDDELANDE ===
"""
${text}
"""

=== UPPGIFT ===
Extrahera varaktiga KUNDFAKTA — saker kunden skrev i mejlet som är värda att komma ihåg vid framtida kontakt.

Regler (strikta):
- BARA saker som kunden uttryckligen skrev i mejlet — gissa eller tolka ALDRIG in något.
- Max 5 per mejl.
- Sätt alltid "fact_type" till ett av: "preference" (önskemål/preferens),
  "constraint" (begränsning, t.ex. tillträdestider, allergier), "commitment"
  (löfte, t.ex. "vi hör av oss senast fredag") eller "contact" (kontaktuppgift,
  t.ex. bästa telefonnummer, föredragen kontaktväg).
- "evidence_quote" MÅSTE vara ett ordagrant citat ur mejlet — aldrig en omskrivning.
- SÄKERHET: extrahera ALDRIG åtkomstkoder — portkoder, larmkoder,
  nyckelgömmor, lösenord eller liknande. Sådant får inte lagras, även om det
  skrivs uttryckligen. Hoppa över det helt.

Svara ENDAST med JSON i detta format:
{
  "fakta": [
    {
      "fact_type": "preference|constraint|commitment|contact",
      "content": "Kort beskrivning av faktumet på svenska",
      "evidence_quote": "Ordagrant citat ur mejlet",
      "confidence": 0.0-1.0
    }
  ]
}

Om mejlet inte innehåller något varaktigt kundfaktum: returnera {"fakta": []}. Svara ENDAST med JSON, ingen annan text.`
}

/**
 * Extraherar kundfakta ur en fritext (e-postkanalen i V1.1). Returnerar []
 * vid varje form av fel — anroparen ska aldrig behöva try/catch:a för sin
 * egen överlevnad (men gör det ändå, bältet OCH hängslen).
 *
 * `supabase` behövs för den obligatoriska kostnadsmätningen (cogs-facit:
 * alla LLM-anrop bokförs, och cost-guard är enda tillåtna skrivaren).
 */
export async function extractCustomerFacts(input: {
  text: string
  channel: 'email'
  businessId: string
  /** email_conversations-radens id — blir cost_event-refId och kortkälla. */
  refId: string
  supabase: SupabaseClient
}): Promise<ExtractedFact[]> {
  const text = (input.text || '').trim()
  if (text.length < MIN_TEXT_LANGD) return []
  if (!process.env.ANTHROPIC_API_KEY) return []

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      // Strukturerad JSON-extraktion i bakgrunden (kunden väntar inte) —
      // Haiku räcker, samma modellklass som voice/analyze-extraktionen.
      model: EMAIL_FAKTA_MODELL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: byggPrompt(text) }],
    })

    // COGS: mätningen går genom cost-guard (enda tillåtna llm-skrivaren per
    // cogs-facit, tests/cogs-matare.spec.ts) och får aldrig fälla extraktionen.
    try {
      const { meterDirectLlmCall } = await import('@/lib/agents/shared/cost-guard')
      const { llmCostUsd } = await import('@/lib/costs/meter')
      await meterDirectLlmCall({
        supabase: input.supabase,
        businessId: input.businessId,
        usage: response.usage,
        costUsd: llmCostUsd(response.usage, EMAIL_FAKTA_MODELL),
        refType: 'email_conversation',
        refId: input.refId,
        meta: { prompt: 'emailFactExtraction', channel: input.channel },
      })
    } catch (costErr) {
      console.warn('[customer-facts/extract] kostnadsmätning misslyckades:', costErr)
    }

    const svarstext = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return parseFaktaSvar(svarstext)
  } catch (err) {
    console.warn('[customer-facts/extract] extraktion misslyckades (icke-blockerande):', err)
    return []
  }
}
