/**
 * Auto-offertutkast från kvalificerad lead — Våg 2a (tasks/value-chain-plan.md,
 * "Störst hål i produkten": kärnlöftet "AI-back-office" faller idag på att
 * hantverkaren själv måste öppna /dashboard/quotes/new och trycka
 * AI-knappen. Motorn (lib/ai-quote-generator.ts) läser produktbank v67 +
 * mallar + historiska offerter — men enda anroparen är UI-knappen
 * (app/dashboard/quotes/new/page.tsx). Den här filen kopplar samma motor
 * till godkännande-kön: när en lead kvalificeras tillräckligt högt ska ett
 * offertutkast dyka upp som kort utan att hantverkaren behöver be om det.
 *
 * Ren kärna (shouldSuggestQuoteDraft) + fail-safe orkestrering
 * (suggestQuoteDraftForLead) — samma mönster som
 * lib/egenkontroll/suggest-time-entry.ts (etapp 2a i easoft-gap-plan.md)
 * och lib/egenkontroll/suggest-checklist.ts (etapp 1d).
 *
 * Schema, verifierat mot faktisk kod (inte antaget):
 *  - `leads.status` har CHECK-constraint (sql/leads_pipeline.sql:32-34):
 *    'new' | 'contacted' | 'qualified' | 'quote_sent' | 'won' | 'lost'.
 *    'qualified' sätts INTE av qualifyLead() (agentverktyget, tool-router.ts)
 *    — den funktionen skriver bara score/urgency/job_type/estimated_value,
 *    aldrig status. Status→'qualified' sätts av updateLeadStatus()
 *    (agentverktyget update_lead_status) och av PATCH /api/leads (manuell
 *    kvalificering i pipeline-UI:t). Se filhuvudena i respektive call site
 *    för var suggestQuoteDraftForLead faktiskt anropas — en avsiktlig
 *    avvikelse från en första läsning av planen, som pekade primärt på
 *    qualify_lead. qualify_lead anropas ändå (score kan knuffa en REDAN
 *    'qualified'-lead över tröskeln senare).
 *  - `leads.score` — INT 0-100 (samma fil, CHECK valid_score).
 *  - `leads.notes` — fritext, enda fältet som håller en beskrivning av vad
 *    kunden vill ha (leads saknar en separat "description"-kolumn).
 *    Ärlighetsregeln (planens ord): en lead utan tillräcklig text ger
 *    ALDRIG ett utkast — hellre inget förslag än ett skräpförslag.
 *  - `quotes.lead_id` — TEXT, finns sedan sql/v37_golden_path.sql. Direkt
 *    koppling lead→offert, ingen omväg via deal behövs för dedup.
 *  - `pending_approvals` — dedup mot redan existerande PENDING
 *    'create_quote_draft'-kort för samma lead_id (payload.lead_id).
 *
 * KONTRAKTET MOT EXEKVERAREN (app/api/approvals/[id]/route.ts,
 * case 'create_quote_draft' ~rad 978, delad med 'quote_request'/
 * 'quote_addition'): vid godkännande POSTAR routen till
 * /api/quotes/ai-generate med
 *   { textDescription: payload.description || payload.job_description
 *       || payload.customer_reply_pending,
 *     customerId: payload.entity?.customerId,
 *     businessId }
 * — dvs exekveraren GENERERAR OM offerten från text vid godkännande-
 * ögonblicket (samma AI-anrop, ny körning), den återanvänder INTE en
 * eventuell tidigare genererad offert. payload.description måste därför
 * vara den RÅA lead-texten (notes, ev. job_type-prefix) — INTE den redan
 * AI-skrivna kundvända beskrivningen vi själva genererar här för kortets
 * förhandsvisning (payload.preview).
 *
 * JURIDIK/AUTONOMI: skapar ALDRIG en offert direkt — bara ett förslag i
 * godkännande-kön. Hantverkaren godkänner alltid. routing_role: 'any' —
 * ett offertutkast är inte känsligt (inga pengar bundna, inget skickas till
 * kund) så ingen specifik behörighets-bucket behövs (jämför
 * tidrapport_forslag/checklist_forslag som också är 'any'/branschneutrala).
 * INGEN förtjänad autonomi kopplas till denna typ (separat beslut krävs,
 * se planens "Stående regler").
 *
 * COST-GUARD (bakgrund): AI-anropet till generateQuoteFromInput är en
 * bakgrunds-observation i cost-guardrail-mening (ingen pågående
 * kundkontakt, ingen hantverkare som väntar) — samma
 * checkCostGuards-helper som egenkontrollens fotoanalys
 * (lib/egenkontroll/analyze-and-queue.ts) använder.
 *
 * FAIL-SAFE (kritiskt, samma löfte som suggestTimeEntriesForBusiness):
 * suggestQuoteDraftForLead() kastar ALDRIG mot anroparen — hela kroppen
 * ligger i ett try/catch som bara console.error:ar. Anropas fire-and-forget
 * (.catch) från de ställen där en lead faktiskt kvalificeras — får aldrig
 * blockera eller sinka det svaret.
 */

import { getServerSupabase } from '@/lib/supabase'
import { checkCostGuards, type CostGuardBusiness } from '@/lib/agents/shared/cost-guard'
import { generateQuoteFromInput, type PriceListItem, type QuoteTemplate } from '@/lib/ai-quote-generator'
import { buildDecisionRecord, withDecisionRecord } from '@/lib/ai/decision-record'

// ─────────────────────────────────────────────────────────────────
// Trösklar
// ─────────────────────────────────────────────────────────────────

/**
 * Score-tröskel för att föreslå ett utkast. Planen specificerar bara
 * "score över tröskel" utan tal — 50 är ett medvetet, dokumenterat val:
 * halva max-poängen i lead_scoring_rules-seeden (sql/leads_pipeline.sql,
 * seed_lead_scoring_rules — t.ex. urgency_mentioned 25 + specific_job 15 +
 * in_service_area 10 = 50). En lead som bara triggar EN svag regel (t.ex.
 * "budget nämnd", 15p) ska inte generera ett utkast; en lead med flera
 * starka signaler ska.
 */
export const QUOTE_DRAFT_SCORE_THRESHOLD = 50

/**
 * Minsta längd (trimmad) på leads.notes för att räkna som "tillräcklig
 * text för ett meningsfullt utkast" (ärlighetsregeln — planens ord: hellre
 * inget förslag än ett skräpförslag). 15 tecken utesluter tomt/enstaka ord
 * ("Badrum", "Ring mig") men tillåter korta men konkreta beskrivningar.
 */
export const QUOTE_DRAFT_MIN_NOTES_LENGTH = 15

// ─────────────────────────────────────────────────────────────────
// shouldSuggestQuoteDraft — ren, facit-testbar gate
// ─────────────────────────────────────────────────────────────────

/** Delmängd av lead-fält + dedup-fakta som gaten behöver. Dedup-frågorna
    (finns redan offert / redan pending kort) kräver DB-uppslag — caller
    (suggestQuoteDraftForLead) ansvarar för att slå upp dem innan gaten
    körs, så själva gate-funktionen förblir ren (ingen I/O, inget
    Supabase). */
export interface LeadForQuoteDraftGate {
  status: string | null
  score: number | null
  notes: string | null
  /** true om quotes.lead_id redan har minst en rad för denna lead
      (oavsett offertens status — draft/sent/accepted/lost räknas alla,
      hantverkaren har redan agerat manuellt). */
  hasExistingQuote: boolean
  /** true om det redan finns ett PENDING 'create_quote_draft'-kort för
      denna lead. */
  hasPendingDraftApproval: boolean
}

/**
 * Ren gate-funktion: givet lead-data + dedup-fakta, ska ett offertutkast
 * föreslås? Ingen I/O.
 *
 * Regler (i kontrollordning, billigast/mest avgörande först):
 *  1. Dedup: redan offert eller redan ett pending kort → nej.
 *  2. Status måste vara exakt 'qualified' (leads_pipeline.sql valid_status)
 *     — 'new'/'contacted' är för tidigt, 'quote_sent'/'won'/'lost' har
 *     redan passerat offertsteget (eller ska inte ha ett).
 *  3. Score måste vara ett giltigt tal ≥ QUOTE_DRAFT_SCORE_THRESHOLD.
 *  4. notes måste (trimmad) vara minst QUOTE_DRAFT_MIN_NOTES_LENGTH tecken
 *     — annars finns inget meningsfullt underlag för AI-generatorn
 *     (ärlighetsregeln).
 */
export function shouldSuggestQuoteDraft(
  lead: LeadForQuoteDraftGate | null | undefined,
): boolean {
  if (!lead) return false
  if (lead.hasExistingQuote) return false
  if (lead.hasPendingDraftApproval) return false
  if (lead.status !== 'qualified') return false
  if (typeof lead.score !== 'number' || !Number.isFinite(lead.score)) return false
  if (lead.score < QUOTE_DRAFT_SCORE_THRESHOLD) return false
  const notes = (lead.notes || '').trim()
  if (notes.length < QUOTE_DRAFT_MIN_NOTES_LENGTH) return false
  return true
}

// ─────────────────────────────────────────────────────────────────
// suggestQuoteDraftForLead — orkestrering (fail-safe, kastar ALDRIG)
// ─────────────────────────────────────────────────────────────────

/**
 * Hämtar leaden, kör dedup-uppslagen + gaten, och om gaten säger ja:
 * anropar generateQuoteFromInput (lib/ai-quote-generator.ts, samma motor
 * som UI-knappen på /dashboard/quotes/new) och skapar ETT
 * pending_approvals-kort med approval_type 'create_quote_draft'.
 *
 * Fire-and-forget, anropas (.catch-wrappat av caller) från de ställen där
 * en lead faktiskt kvalificeras — se filhuvudet för vilka.
 */
export async function suggestQuoteDraftForLead(businessId: string, leadId: string): Promise<void> {
  try {
    if (!businessId || !leadId) return
    const supabase = getServerSupabase()

    // ── 1. Leaden ────────────────────────────────────────────────
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('lead_id, business_id, name, status, score, notes, job_type, urgency, estimated_value, customer_id')
      .eq('lead_id', leadId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (leadErr) {
      console.error('[quotes/suggest-quote-draft] kunde inte hämta lead:', leadErr)
      return
    }
    if (!lead) return

    // ── 2. Dedup 1 — redan en offert kopplad till leaden? ─────────
    const { count: quoteCount, error: quoteErr } = await supabase
      .from('quotes')
      .select('quote_id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('lead_id', leadId)

    if (quoteErr) {
      console.error('[quotes/suggest-quote-draft] kunde inte kolla befintliga offerter:', quoteErr)
      return
    }

    // ── 3. Dedup 2 — redan ett pending förslagskort? ──────────────
    const { count: pendingCount, error: pendErr } = await supabase
      .from('pending_approvals')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('approval_type', 'create_quote_draft')
      .eq('status', 'pending')
      .contains('payload', { lead_id: leadId })

    if (pendErr) {
      console.error('[quotes/suggest-quote-draft] kunde inte kolla dedup mot pending kort:', pendErr)
      return
    }

    // ── 4. Ren gate ────────────────────────────────────────────────
    const gateOk = shouldSuggestQuoteDraft({
      status: lead.status,
      score: lead.score,
      notes: lead.notes,
      hasExistingQuote: !!quoteCount && quoteCount > 0,
      hasPendingDraftApproval: !!pendingCount && pendingCount > 0,
    })
    if (!gateOk) return

    // ── 5. Cost-guard (bakgrund) ───────────────────────────────────
    const { data: bizRow, error: bizErr } = await supabase
      .from('business_config')
      .select('business_id, agents_globally_paused, agent_cost_cap_usd_daily, subscription_plan, industry, pricing_settings, default_hourly_rate')
      .eq('business_id', businessId)
      .maybeSingle()

    if (bizErr || !bizRow) {
      console.error('[quotes/suggest-quote-draft] kunde inte hämta business_config:', bizErr)
      return
    }

    const skip = await checkCostGuards(supabase, bizRow as CostGuardBusiness, 'quote_draft_forslag')
    if (skip) {
      console.log('[quotes/suggest-quote-draft] hoppar — cost-guard', {
        business_id: businessId,
        lead_id: leadId,
        ...skip,
      })
      return
    }

    // ── 6. Produktbank + mallar (samma mönster som app/api/quotes/ ──
    // ai-generate/route.ts — fallback-priskontexten läses ur products,
    // se kommentaren där om produktbanks-konsolideringen v67).
    // B3 (kodrevision 2026-08-03): samma .limit(50)-utan-.order()-mönster
    // kopierades hit från ai-generate/route.ts — samma fix, samma
    // sortering (favoriter → namn, se usePriceListLookup.ts).
    const [priceListResult, templatesResult] = await Promise.all([
      supabase
        .from('products')
        // ETAPP B1 (2026-08-06): id krävs för produktkopplingen — se
        // lib/products/match-generated-items.ts.
        .select('id, name, unit, sales_price, category')
        .eq('business_id', businessId)
        .eq('is_active', true)
        .order('is_favorite', { ascending: false })
        .order('name')
        .limit(100),
      supabase
        .from('quote_templates')
        .select('name, default_items, category')
        .eq('business_id', businessId)
        .limit(5),
    ])

    const priceList: PriceListItem[] = (priceListResult.data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      unit_price: p.sales_price,
      category: p.category,
    }))
    const templates: QuoteTemplate[] = templatesResult.data || []

    const bizConfig = bizRow as {
      industry?: string | null
      pricing_settings?: { hourly_rate?: number } | null
      default_hourly_rate?: number | null
    }
    const branch = bizConfig.industry || 'Bygg'
    const hourlyRate = bizConfig.pricing_settings?.hourly_rate || bizConfig.default_hourly_rate || 650

    // Rå lead-text — ÄTALLTID vad som skickas vidare till exekveraren
    // (payload.description), aldrig den AI-skrivna kundvända varianten.
    const textDescription = [
      lead.job_type ? `Jobbtyp: ${lead.job_type}.` : null,
      lead.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .trim()

    // ── 7. AI-generering (samma motor som UI-knappen) ───────────────
    let generated
    try {
      generated = await generateQuoteFromInput({
        businessId,
        branch,
        hourlyRate,
        textDescription,
        priceList,
        templates,
        customerId: lead.customer_id || undefined,
      })
    } catch (genErr) {
      // Ärlighetsregeln: kan AI:n inte generera ett utkast (t.ex. saknad
      // API-nyckel, malformad respons) — inget förslag, ingen krasch.
      console.error('[quotes/suggest-quote-draft] generateQuoteFromInput kastade:', genErr)
      return
    }

    if (!generated || !generated.items || generated.items.length === 0) {
      // Skräpsvar (tom rad-lista) — hellre inget förslag.
      return
    }

    // ── 8. Skapa förslags-kortet ──────────────────────────────────
    const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const leadName = lead.name || 'leaden'

    const { error: insertErr } = await supabase.from('pending_approvals').insert({
      id: approvalId,
      business_id: businessId,
      approval_type: 'create_quote_draft',
      // Inte känsligt — inga pengar bundna, inget skickas till kund förrän
      // hantverkaren själv skickar offerten efteråt.
      routing_role: 'any',
      title: `Offertutkast redo för ${leadName} — ${generated.jobTitle}`,
      description: generated.jobDescription || textDescription.slice(0, 200),
      status: 'pending',
      risk_level: 'low',
      payload: {
        routed_agent: 'daniel',
        lead_id: leadId,
        // Läses EXAKT så här av exekveraren (approvals/[id]/route.ts,
        // case 'create_quote_draft') — se filhuvudet.
        description: textDescription,
        ...(lead.customer_id ? { entity: { customerId: lead.customer_id } } : {}),
        job_type: lead.job_type,
        estimated_value: lead.estimated_value,
        // ETAPP B4 (2026-08-06): det HÄR är nu vad exekveraren materialiserar.
        //
        // Tidigare bar payloaden bara `description` (rå fritext) och den här
        // previewen — och exekveraren körde en HELT NY AI-generering på
        // fritexten. Hantverkaren såg alltså rader och en summa från
        // generering A, godkände, och fick generering B sparad: andra rader,
        // andra priser, ibland en annan ROT/RUT-typ. Kortets rubrik kom från A
        // medan offerten kom från B. Ett godkännande som inte betyder "spara
        // det jag ser" är inte ett godkännande.
        //
        // Fälten nedan är exakt vad executeApprovalPayload behöver för att
        // skapa offerten utan att fråga modellen igen. `description` ligger
        // kvar som reserv: saknas previewen (äldre kort som ligger i kön när
        // det här deployas) faller exekveraren tillbaka på omgenerering.
        // SPÅR 1.1 (2026-08-06): beslutsposten — vilken modell och vilken
        // promptversion som producerade förslaget, plus en hash av underlaget.
        // Utan den går det inte att svara på om vår AI blir bättre; med den
        // kan accept-graden grupperas per promptversion.
        //
        // Ligger under _decision och läses aldrig av gränssnittet, som plockar
        // payloadens fält vid namn (verifierat i approvals/page.tsx).
        ...withDecisionRecord({}, buildDecisionRecord({
          model: generated.model,
          prompt: 'quoteDraftSuggestion',
          input: textDescription,
          now: new Date(),
        })),
        preview: {
          job_title: generated.jobTitle,
          job_description: generated.jobDescription,
          items: generated.items,
          options: generated.options,
          suggested_deduction_type: generated.suggestedDeductionType,
          not_included_suggestions: generated.notIncludedSuggestions,
          total_before_vat: generated.totalBeforeVat,
          confidence: generated.confidence,
          reasoning: generated.reasoning,
        },
      },
    })

    if (insertErr) {
      console.error('[quotes/suggest-quote-draft] kunde inte skapa förslag:', insertErr, {
        lead_id: leadId,
      })
    }
  } catch (err) {
    // Fail-safe: får ALDRIG störa flödet (agentverktyg/PATCH-route) som
    // anropar detta fire-and-forget. Se filhuvudet.
    console.error(
      '[quotes/suggest-quote-draft] oväntat fel (sväljs, fire-and-forget):',
      err,
    )
  }
}
