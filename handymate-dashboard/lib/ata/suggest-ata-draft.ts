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
 * AI-ANROP TILLKOM 2026-08-08 (innehållskontraktet, regel 1). Filhuvudet sa
 * tidigare "INGET AI-ANROP i denna fil" — och det var precis problemet:
 * funktionen hette suggest-ata-DRAFT men producerade inget utkast. Kortet bar
 * rå beskrivningstext, och genereringen skedde först VID godkännandet.
 * Hantverkaren tryckte alltså Godkänn på något han inte hade sett.
 *
 * Nu samma ordning som suggest-quote-draft: generera först med samma motor
 * som UI-knappen, lägg raderna i payload.preview, fråga sedan. Genereringen
 * är fail-soft — misslyckas den skapas kortet ändå, utan preview och utan
 * påstått belopp, precis som förut. Ett ÄTA-behov ska inte försvinna för att
 * modellen hade en dålig dag.
 *
 * FAIL-SAFE: kastar aldrig. Returnerar { created, reason } så
 * agentverktyget kan ge ett meningsfullt svar till LLM:en, och
 * matte-kopplingen kan logga utan att störa SMS-svarsflödet.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildDecisionRecord, withDecisionRecord } from '@/lib/ai/decision-record'

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

    // ═══ UTKASTET PRODUCERAS FÖRST, FRÅGAN KOMMER SEDAN (2026-08-08) ═══
    //
    // Trots namnet producerade den här funktionen INGET utkast: den gjorde en
    // dedup-koll och skrev ett kort med rå beskrivningstext. Genereringen
    // skedde först VID godkännandet — hantverkaren tryckte alltså Godkänn på
    // något han inte hade sett.
    //
    // Nu samma ordning som create_quote_draft: generera med samma motor som
    // UI-knappen, avbryt om det inte blir något (hellre inget förslag än ett
    // tomt kort), och lägg raderna i payloaden så kortet kan visa dem.
    //
    // Fail-soft hela vägen: ett fel i genereringen får aldrig hindra att
    // ÄTA-behovet ändå syns — då skrivs kortet utan preview, precis som förut.
    let preview: any = null
    // Beslutsposten (Spår 1.1): sätts bara när genereringen lyckades — en
    // stämpel utan modell vore ett påstående om ett beslut som aldrig togs.
    let genereradModell: string | null = null
    let ataUnderlag: string | null = null
    let projektNamn: string | null = null
    try {
      // Projektet ger både sammanhang till modellen och rätt kund för
      // prislistan. Business-scopat — samma tenantregel som resten.
      // job_type hämtas med — låter lärdome-läsningen (fetchRecentLessons,
      // ai-quote-generator.ts) filtrera på samma jobbtyp i stället för att
      // hoppa över lärdomar helt för alla ÄTA-förslag.
      const { data: project } = await supabase
        .from('project')
        .select('name, customer_id, job_type')
        .eq('business_id', params.businessId)
        .eq('project_id', params.projectId)
        .maybeSingle()
      projektNamn = project?.name ?? null

      const [priceListResult, templatesResult, bizResult] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, unit, sales_price, category')
          .eq('business_id', params.businessId)
          .eq('is_active', true)
          .order('is_favorite', { ascending: false })
          .order('name')
          .limit(100),
        supabase
          .from('quote_templates')
          .select('name, default_items, category')
          .eq('business_id', params.businessId)
          .limit(5),
        supabase
          .from('business_config')
          .select('industry, pricing_settings, default_hourly_rate')
          .eq('business_id', params.businessId)
          .maybeSingle(),
      ])

      const biz = (bizResult.data || {}) as {
        industry?: string | null
        pricing_settings?: { hourly_rate?: number } | null
        default_hourly_rate?: number | null
      }

      const { generateQuoteFromInput } = await import('@/lib/ai-quote-generator')
      // ÄTA:n gäller ett PÅGÅENDE projekt — projektnamnet ger modellen
      // sammanhanget som annars saknas i en lös mening om extraarbete.
      // Hoistad så beslutsposten kan hasha exakt det underlag modellen fick.
      ataUnderlag = [
        project?.name ? `Tilläggsarbete på projektet "${project.name}".` : null,
        description,
        params.customerContext ? `Kundens egna ord: "${params.customerContext}"` : null,
      ].filter(Boolean).join(' ')

      const generated = await generateQuoteFromInput({
        businessId: params.businessId,
        branch: biz.industry || 'Bygg',
        hourlyRate: biz.pricing_settings?.hourly_rate || biz.default_hourly_rate || 650,
        textDescription: ataUnderlag,
        priceList: (priceListResult.data || []).map((p: any) => ({
          id: p.id, name: p.name, unit: p.unit, unit_price: p.sales_price, category: p.category,
        })),
        templates: templatesResult.data || [],
        customerId: project?.customer_id || undefined,
        jobType: project?.job_type || undefined,
      })

      if (generated?.items?.length) {
        preview = {
          job_title: generated.jobTitle,
          job_description: generated.jobDescription,
          items: generated.items,
          total_before_vat: generated.items.reduce(
            (s: number, i: any) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
            0,
          ),
          confidence: generated.confidence,
        }
        genereradModell = generated.model
      }
    } catch (genErr) {
      console.error('[ata/suggest-ata-draft] generering misslyckades (kortet skapas ändå):', genErr)
    }

    const { error: insertErr } = await supabase.from('pending_approvals').insert({
      id: approvalId,
      business_id: params.businessId,
      approval_type: 'create_ata_draft',
      // ÄTA hör till projektteamet — se lib/approvals/routing.ts.
      routing_role: 'project_team',
      // ═══ RUBRIKEN VAR EN AVHUGGEN KOPIA AV BRÖDTEXTEN (regel 2) ═══
      //
      // `ÄTA-förslag: ${description.slice(0,80)}` stod direkt ovanför samma
      // sträng i sin helhet. Nu namnger rubriken ARBETET (modellens jobbtitel)
      // och projektet, så man vet vad och var utan att läsa brödtexten.
      title: preview?.job_title
        ? `ÄTA-förslag: ${preview.job_title}${projektNamn ? ` — ${projektNamn}` : ''}`
        : `ÄTA-förslag${projektNamn ? ` — ${projektNamn}` : ''}`,
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
        // Beloppet: modellens summa om den finns, annars anroparens
        // uppskattning. Ett RÄKNAT belopp slår alltid en gissad parameter.
        ...(typeof preview?.total_before_vat === 'number' && preview.total_before_vat > 0
          ? { amount_estimate: Math.round(preview.total_before_vat) }
          : typeof params.amountEstimate === 'number'
            ? { amount_estimate: params.amountEstimate }
            : {}),
        ...(params.customerContext ? { customer_context: params.customerContext } : {}),
        ...(params.customerId ? { entity: { customerId: params.customerId } } : {}),
        // Utkastet — raderna kortet visar och som godkännandet ska
        // materialisera. Saknas det (generering failade) faller kortet
        // tillbaka på gamla beteendet: rå beskrivning, inget påstått belopp.
        ...(preview ? { preview } : {}),
        ...(projektNamn ? { project_name: projektNamn } : {}),
        // SPÅR 1.1: beslutsposten — modell, promptversion och hash av
        // underlaget. Bara när genereringen lyckades; ett kort utan preview
        // bar inget AI-beslut att stämpla. Ligger under _decision och läses
        // aldrig av gränssnittet.
        ...(genereradModell
          ? withDecisionRecord({}, buildDecisionRecord({
              model: genereradModell,
              prompt: 'ataDraftSuggestion',
              input: ataUnderlag,
              now: new Date(),
            }))
          : {}),
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
