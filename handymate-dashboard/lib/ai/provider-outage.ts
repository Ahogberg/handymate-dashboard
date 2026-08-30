// lib/ai/provider-outage.ts
//
// Född ur P0:n 2026-08-31: Anthropic-krediterna tog slut fredag lunch och
// varje Matte-anrop svarade "Något gick fel — försök igen." i två dygn
// innan någon människa märkte det — kunderna såg ett fel som såg ut som
// vårt, och ingen larmades. (Exakt samma mönster som 46elks-saldot.)
//
// Två uppgifter, båda medvetet små:
//  1. Känna igen leverantörens kreditstopp i ett kastat fel, så catchen
//     kan svara ÄRLIGT ("AI-tjänsten är tillfälligt otillgänglig") i
//     stället för generiskt.
//  2. Larma Handymates eget team via det befintliga interna SMS-larmet —
//     throttlat, så ett kreditstopp ger enstaka larm och inte ett SMS per
//     kundmeddelande.
//
// Throttlens begränsning, med öppna ögon: räknaren bor i modulscope och
// serverless betyder en räknare PER varm instans. Vid kallstartsstorm kan
// alltså fler än ett larm gå ut per fönster. Det är rätt avvägning här —
// mottagarlistan är Handymates egna två nummer, och alternativet (DB-rad
// per larm) är mer maskineri än problemet förtjänar.

import {
  notifyHandymateSupportTeam,
  type SupportAlertDelivery,
} from '@/lib/notifications/handymate-team-alert'

export type ProviderOutageKind = 'credit'

/**
 * Klassificerar ett kastat fel från LLM-anropskedjan. Matchningen är
 * medvetet snäv: Anthropics kreditfel är ett 400 invalid_request_error
 * vars message innehåller "credit balance" (verifierat ordagrant mot det
 * verkliga felet 2026-08-31, request_id req_011CeZmaEwTbTNNkPZcgjXnd).
 * Allt annat är null — en okänd krasch ska INTE låtsas vara ett
 * leverantörsstopp.
 */
export function classifyProviderOutage(error: unknown): ProviderOutageKind | null {
  const message = String((error as { message?: unknown } | null)?.message ?? error ?? '')
  if (message.includes('credit balance') && message.includes('Anthropic')) {
    return 'credit'
  }
  return null
}

/** Kundtexten vid leverantörsstopp — ärlig, utan att låtsas vara ett appfel. */
export const PROVIDER_OUTAGE_REPLY =
  'AI-tjänsten är tillfälligt otillgänglig — teamet är informerat. Försök igen om en stund.'

const THROTTLE_MS = 60 * 60 * 1000 // max ett larm i timmen per varm instans

let lastAlertAt = 0

/** Endast för test — nollställer throttlefönstret. */
export function __resetOutageAlertThrottleForTest(): void {
  lastAlertAt = 0
}

export interface OutageAlertResult {
  attempted: boolean
  delivery?: SupportAlertDelivery
}

/**
 * Skickar det interna driftlarmet, högst en gång per throttlefönster.
 * Fire-and-forget-säker: kastar aldrig (larmvägen får inte förvärra en
 * pågående incident), och rapporterar ärligt om den avstod pga throttle.
 */
export async function alertProviderOutageThrottled(
  kind: ProviderOutageKind,
  dependencies: Parameters<typeof notifyHandymateSupportTeam>[1] & { now?: () => number } = {},
): Promise<OutageAlertResult> {
  const now = dependencies.now ?? Date.now
  const t = now()
  if (t - lastAlertAt < THROTTLE_MS) {
    return { attempted: false }
  }
  lastAlertAt = t

  try {
    const delivery = await notifyHandymateSupportTeam(
      {
        businessName: 'DRIFT',
        category: `llm_${kind}`,
        ticketId: 'anthropic-outage',
        summary:
          kind === 'credit'
            ? 'Anthropic-krediterna är slut — Matte-chatten svarar fel till ALLA kunder. Fyll på i console.anthropic.com.'
            : 'LLM-leverantören är nere — Matte-chatten svarar fel till kunder.',
      },
      dependencies,
    )
    return { attempted: true, delivery }
  } catch (err) {
    // notifyHandymateSupportTeam kastar inte enligt sitt kontrakt, men
    // larmvägen ska vara okastbar även om det kontraktet någon gång brister.
    console.error('[provider-outage] larmvägen kastade (svalt):', err)
    return { attempted: true }
  }
}
