/**
 * Våg 2b (tasks/value-chain-plan.md) — ÄTA-kedjan: kopplar redan byggd
 * infrastruktur (exekveraren i app/api/approvals/[id]/route.ts, case
 * 'create_ata_draft' ~rad 996; signeringsflödet i app/api/ata/*) till en
 * faktisk trigger. Innan denna körning fanns ingen anropare — varken
 * agentverktyg eller Mattes intent-klassificering producerade
 * approval_type 'create_ata_draft', så exekveraren var orphan (samma
 * status som create_quote_draft innan etapp 2a).
 *
 * Delad kärna för TVÅ anropare (samma mönster som lib/quotes/
 * suggest-quote-draft.ts, etapp 2a — ren gate + fail-safe orkestrering):
 *  1. Agentverktyget create_ata_draft (app/api/agent/trigger/tool-router.ts)
 *     — Daniel/Matte föreslår explicit ett ÄTA-utkast under ett pågående
 *     samtal/SMS-ärende.
 *  2. lib/matte/action-executor.ts — när intent-agentens intent är
 *     'quote_addition' OCH ett projekt är identifierat (decision.projectId)
 *     klassas det som ÄTA snarare än en vanlig ny offert.
 *
 * Projekt-koppling (resolveCustomerId, businessId osv.) och beskrivnings-
 * text är anroparspecifikt I/O — den här filen tar redan upplösta
 * parametrar och äger bara dedup + gate + insert, så den ALDRIG behöver
 * veta hur anroparen kom fram till dem.
 *
 * KONTRAKTET MOT EXEKVERAREN (app/api/approvals/[id]/route.ts,
 * case 'create_ata_draft' ~rad 996): vid godkännande POSTAR routen till
 * /api/quotes/ai-generate med
 *   { textDescription: `ÄTA-tillägg: ${payload.description}`,
 *     customerId: payload.entity?.customerId,
 *     businessId }
 * — payload.description MÅSTE alltså finnas och vara en konkret
 * beskrivning av tilläggsarbetet. payload.entity?.customerId är valfri
 * men rekommenderad (styr kundspecifik prislista, se
 * resolveCustomerPriceList i lib/ai-quote-generator.ts).
 *
 * VIKTIG KÄND BEGRÄNSNING (verifierad 2026-08-03 — INTE denna körnings
 * scope att fixa, men bör flaggas): exekveraren sparar INTE offerten den
 * genererar någonstans — /api/quotes/ai-generate returnerar bara ett
 * genererat offert-objekt i HTTP-svaret, det skrivs aldrig till `quotes`-
 * eller `project_change`-tabellen, och approvals/[id]/route.ts persisterar
 * bara utfallet (success/failed) på pending_approvals-raden, inte själva
 * utkastet. Samma begränsning gäller redan idag för 'create_quote_draft'
 * (etapp 2a) — alltså inget NYTT hål som denna körning inför. Men i
 * praktiken betyder det: en godkänd ÄTA-kort-rad skapar INGEN rad i
 * project_change och kopplas INTE automatiskt till signeringsflödet
 * (POST /api/ata, /api/ata/sign/[token]) — hantverkaren måste fortfarande
 * själv skapa den riktiga ÄTA:n manuellt efter att ha sett AI-förslaget.
 * En separat uppföljande körning bör antingen (a) byta exekverarens mål
 * till POST /api/ata, eller (b) visa upp AI-förslaget som startvärde i
 * ÄTA-formuläret. Rapporterat, inte fixat här (utanför 2b:s scope).
 *
 * ROUTING/RISK: routing_role 'project_team' (ÄTA hör till projektteamet —
 * se lib/approvals/routing.ts, samma bucket som checklist_forslag/
 * egenkontroll_avvikelse). risk_level 'low' — samma resonemang som
 * create_quote_draft: inga pengar bundna, inget skickas till kund förrän
 * hantverkaren själv agerar (skapar/skickar den riktiga ÄTA:n).
 *
 * INGET AI-ANROP i denna fil — till skillnad från suggest-quote-draft.ts
 * (som eagerly genererar en preview via generateQuoteFromInput) gör denna
 * funktion BARA en dedup-koll + insert. Ingen cost-guard behövs — ingen ny
 * AI-kostnad introduceras här, exekverarens ai-generate-anrop finns redan
 * sedan tidigare och triggas oavsett anropskälla.
 *
 * FAIL-SAFE: kastar aldrig. Returnerar { created, reason } så
 * agentverktyget kan ge ett meningsfullt svar till LLM:en, och
 * matte-kopplingen kan logga utan att störa SMS-svarsflödet.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────
// shouldSuggestAtaDraft — ren, facit-testbar gate
// ─────────────────────────────────────────────────────────────────

export interface AtaDraftGateInput {
  projectId: string | null | undefined
  description: string | null | undefined
  /** true om det redan finns ett PENDING 'create_ata_draft'-kort för
      samma projekt (payload.project_id). Enkel dedup på projekt räcker —
      ett projekt ska aldrig ha två väntande ÄTA-förslag samtidigt. */
  hasPendingAtaForProject: boolean
}

export type AtaDraftGateReason = 'missing_project' | 'missing_description' | 'duplicate'

/** Minsta längd (trimmad) för att räkna som en meningsfull ÄTA-beskrivning.
    Samma ärlighetsregel som QUOTE_DRAFT_MIN_NOTES_LENGTH i
    suggest-quote-draft.ts — hellre inget förslag än ett skräpförslag. */
export const ATA_DRAFT_MIN_DESCRIPTION_LENGTH = 10

/**
 * Ren gate-funktion (ingen I/O): given projekt + beskrivning + dedup-fakta,
 * ska ett ÄTA-utkast föreslås? Enda sanningskällan för ordningen — även
 * getAtaDraftGateReason (som orkestreringen använder för felmeddelanden)
 * speglar EXAKT samma kontrollordning.
 *
 * Regler (billigast/mest avgörande först):
 *  1. project_id måste finnas — en ÄTA utan projekt är bara en vanlig
 *     offertförfrågan (hanteras redan av create_quote_draft/etapp 2a).
 *  2. Dedup: redan ett pending kort för samma projekt → nej.
 *  3. description måste (trimmad) vara minst ATA_DRAFT_MIN_DESCRIPTION_LENGTH
 *     tecken — annars finns inget meningsfullt underlag för AI-generatorn.
 */
export function shouldSuggestAtaDraft(input: AtaDraftGateInput): boolean {
  return getAtaDraftGateReason(input) === null
}

/** Samma logik som shouldSuggestAtaDraft, men returnerar VARFÖR gaten sa
    nej (null = gaten sa ja) — används för att ge ett begripligt svar till
    LLM:en/loggen istället för ett tyst nej. */
export function getAtaDraftGateReason(input: AtaDraftGateInput): AtaDraftGateReason | null {
  if (!input.projectId) return 'missing_project'
  if (input.hasPendingAtaForProject) return 'duplicate'
  const desc = (input.description || '').trim()
  if (desc.length < ATA_DRAFT_MIN_DESCRIPTION_LENGTH) return 'missing_description'
  return null
}

// ─────────────────────────────────────────────────────────────────
// suggestAtaDraft — orkestrering (fail-safe, kastar ALDRIG)
// ─────────────────────────────────────────────────────────────────

export interface SuggestAtaDraftParams {
  businessId: string
  projectId: string
  description: string
  amountEstimate?: number | null
  /** Fritext för kortets förhandsvisning i kön, t.ex. SMS-citatet som
      föranledde förslaget. Sparas separat från description (som är vad
      exekveraren skickar till AI-generatorn). */
  customerContext?: string | null
  customerId?: string | null
  /** Default 'daniel' (säljansvarig — samma persona som create_quote_draft,
      etapp 2a). */
  routedAgent?: string
}

export interface SuggestAtaDraftResult {
  created: boolean
  approvalId?: string
  reason?: AtaDraftGateReason | 'dedup_lookup_failed' | 'insert_failed' | 'unexpected_error'
}

/**
 * Slår upp dedup-faktan, kör gaten, och om gaten säger ja: skapar ETT
 * pending_approvals-kort med approval_type 'create_ata_draft'.
 *
 * Kastar ALDRIG — se filhuvudet.
 */
export async function suggestAtaDraft(
  supabase: SupabaseClient,
  params: SuggestAtaDraftParams,
): Promise<SuggestAtaDraftResult> {
  try {
    if (!params.businessId || !params.projectId) {
      return { created: false, reason: 'missing_project' }
    }

    // ── Dedup — redan ett pending 'create_ata_draft'-kort för projektet? ──
    const { count, error: pendErr } = await supabase
      .from('pending_approvals')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', params.businessId)
      .eq('approval_type', 'create_ata_draft')
      .eq('status', 'pending')
      .contains('payload', { project_id: params.projectId })

    if (pendErr) {
      console.error('[ata/suggest-ata-draft] kunde inte kolla dedup:', pendErr)
      return { created: false, reason: 'dedup_lookup_failed' }
    }

    const gateInput: AtaDraftGateInput = {
      projectId: params.projectId,
      description: params.description,
      hasPendingAtaForProject: !!count && count > 0,
    }
    const gateReason = getAtaDraftGateReason(gateInput)
    if (gateReason) return { created: false, reason: gateReason }

    // ── Skapa förslags-kortet ──────────────────────────────────────
    const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const description = params.description.trim()

    const { error: insertErr } = await supabase.from('pending_approvals').insert({
      id: approvalId,
      business_id: params.businessId,
      approval_type: 'create_ata_draft',
      // ÄTA hör till projektteamet — se lib/approvals/routing.ts.
      routing_role: 'project_team',
      title: `ÄTA-förslag: ${description.slice(0, 80)}`,
      description,
      status: 'pending',
      // Åldras efter 14 dagar, som create_quote_draft. Utan expires_at
      // matchar underhållscronens `.lt()` aldrig NULL och kortet låg kvar
      // för evigt. Projektet finns kvar; det är förslaget som försvinner.
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      // Inga pengar bundna, inget skickas till kund förrän hantverkaren
      // själv agerar — samma resonemang som create_quote_draft (etapp 2a).
      risk_level: 'low',
      payload: {
        routed_agent: params.routedAgent || 'daniel',
        project_id: params.projectId,
        // Läses EXAKT så här av exekveraren (approvals/[id]/route.ts,
        // case 'create_ata_draft') — se filhuvudet.
        description,
        ...(typeof params.amountEstimate === 'number' ? { amount_estimate: params.amountEstimate } : {}),
        ...(params.customerContext ? { customer_context: params.customerContext } : {}),
        ...(params.customerId ? { entity: { customerId: params.customerId } } : {}),
      },
    })

    if (insertErr) {
      console.error('[ata/suggest-ata-draft] kunde inte skapa förslag:', insertErr, {
        project_id: params.projectId,
      })
      return { created: false, reason: 'insert_failed' }
    }

    return { created: true, approvalId }
  } catch (err) {
    // Fail-safe: får ALDRIG störa flödet (agentverktyg/matte-actionexecutor)
    // som anropar detta. Se filhuvudet.
    console.error('[ata/suggest-ata-draft] oväntat fel (sväljs):', err)
    return { created: false, reason: 'unexpected_error' }
  }
}
