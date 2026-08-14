import Anthropic from '@anthropic-ai/sdk'
import { getServerSupabase } from '@/lib/supabase'
import { matchGeneratedItem, type MatchableProduct } from '@/lib/products/match-generated-items'
import { WON_QUOTE_STATUSES } from '@/lib/quotes/statuses'
import { rapporteraTystFel, arSchemaSaknas } from '@/lib/observability/driftlarm'
import { meterDirectLlmCall } from '@/lib/agents/shared/cost-guard'
import { llmCostUsd } from '@/lib/costs/meter'

export interface PriceListItem {
  name: string
  unit: string
  unit_price: number
  category: string
  /** Artikelns id i produktbanken (etapp B1, 2026-08-06). Optional eftersom
      äldre anropare (app/api/quotes/generate) bara skickar namn och pris —
      utan id hoppas handtagen över och matchningen faller tillbaka på namn. */
  id?: string
}

export interface QuoteTemplate {
  name: string
  default_items: any
  category?: string
}

export interface QuoteGenerationInput {
  businessId: string
  branch: string
  hourlyRate: number
  imageBase64?: string
  voiceTranscript?: string
  textDescription?: string
  customerId?: string
  priceList?: PriceListItem[]
  templates?: QuoteTemplate[]
  defaultHourlyRate?: number
  customerPriceList?: CustomerPriceList
  /** Jobbtyp (slug, t.ex. project.job_type/quotes.job_type/lead.job_type) —
      styr project_lesson-läsningen (Project Debrief Capture, 2026-08-12).
      Sanningsprincipen (fix 2026-08-12): UTAN jobType hämtas INGA lärdomar
      alls. Prompten påstår "LÄRDOMAR FRÅN TIDIGARE LIKNANDE JOBB" — att
      visa badrumslärdomar i en altanoffert vore fel, inte bara oprecist.
      Hellre inga lärdomar än fel lärdomar. */
  jobType?: string
}

export interface GeneratedQuoteItem {
  id: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  type: 'labor' | 'material' | 'service'
  confidence: number
  note?: string | null
  fromPriceList?: boolean
  /**
   * Artikeln i produktbanken som raden kopplats till (etapp B1, 2026-08-06).
   * Utan den får raden ingen komponent-snapshot, ingen arbetsandel, ingen
   * ROT-split och inget inköpspris — och reservationsmotorn, som matchar på
   * produkt och kategori, triggar knappt alls.
   *
   * Sätts av matchGeneratedItems och är null när ingen SÄKER träff fanns.
   * Null är ett fullgott svar: raden står då kvar som "PRIS SAKNAS", precis
   * som före B1. En felkopplad artikel hade i stället gett fel inköpspris och
   * fel ROT-flagga utan att synas någonstans i gränssnittet.
   */
  linkedProductId?: string | null
  /** Hur träffen gjordes — loggas så träffkvaliteten kan mätas. */
  productMatchType?: 'handle' | 'exact' | 'fuzzy' | null
}

export interface GeneratedQuote {
  jobTitle: string
  jobDescription: string
  items: GeneratedQuoteItem[]
  /** B5 (kodrevision 2026-08-03): AI-föreslagna TILLVAL — genuint relevanta
      tilläggsarbeten kunden kan välja till, ALDRIG påhittade. Tom lista är
      det normala/förväntade svaret, inte ett fel. */
  options: GeneratedQuoteItem[]
  estimatedHours: number
  laborCost: number
  materialCost: number
  totalBeforeVat: number
  suggestedDeductionType: 'none' | 'rot' | 'rut'
  confidence: number
  reasoning: string
  similarHistoricalQuotes: Array<{ id: string; title: string; total: number }>
  /** Bekräftade lärdomar från tidigare liknande jobb (Project Debrief
      Capture, 2026-08-12) — hantverkarens egna svar, inte AI-inferens.
      Tom lista är det normala när inga debrief-svar finns än. */
  lessons: Array<{ lesson_text: string; impact_hint: string | null }>
  /** Bekräftade kundfakta (Customer Facts V1, 2026-08-12) — preferenser och
      förutsättningar godkända av hantverkaren som prompten tog hänsyn till.
      Tom lista är normalt: ingen kund, eller ingen bekräftad fakta än. */
  customerFacts: Array<{ fact_type: 'preference' | 'constraint'; content: string }>
  /** Ägar-dikterade affärsregler prompten fick se ("Lär Handymate", 2026-08-13).
      Tom lista är normalt: inga regler sparade än. Returneras av samma skäl
      som lessons/customerFacts — så anroparen (och UI:t) kan visa VAD som
      faktiskt påverkade offerten, inte bara påstå att det hände. */
  rules: Array<{ observation: string }>
  priceListEmpty: boolean
  missingPriceCount: number
  /**
   * Förslag på vad som INTE ingår (etapp B3, 2026-08-06). Det här är det enda
   * villkorsfältet som genereras av AI:n, och skälet är att det är genuint
   * jobbspecifikt: reservationer, betalvillkor och giltighet kommer från
   * regelmotorer och hantverkarens egna standardtexter, medan "ej inkluderat"
   * beror på exakt vad jobbet omfattar — och är precis det Christoffer säger
   * att han glömmer. Presenteras som FÖRSLAG att bocka i, aldrig som färdig
   * text: en påhittad avgränsning i en offert är ett löfte hantverkaren inte
   * gett.
   */
  notIncludedSuggestions: string[]
  /**
   * Modellen som FAKTISKT producerade svaret (spår 1.1, 2026-08-06).
   *
   * Returneras i stället för att anroparen läser konstanten, så beslutsposten
   * inte kan påstå fel modell om den här filen byter modell utan att
   * anroparen märker det. Se lib/ai/decision-record.ts.
   */
  model: string
}

export interface ImageAnalysis {
  description: string
  identifiedItems: string[]
  suggestedJobType: string
  confidence: number
}

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

/**
 * Project Debrief Capture (2026-08-12): de senaste 3 bekräftade lärdomarna
 * (project_lesson, sql/v121_project_lesson.sql) för businessen, filtrerat
 * på SAMMA jobbtyp.
 *
 * Sanningsprincipen (fix 2026-08-12): utan jobType hämtas INGA lärdomar —
 * tidigare lästes de tre senaste OAVSETT jobbtyp, vilket i praktiken
 * innebar att badrumslärdomar dök upp i altanoffertens prompt under
 * rubriken "LÄRDOMAR FRÅN TIDIGARE LIKNANDE JOBB". Ett felaktigt "liknande"
 * är värre än att inte visa några lärdomar alls, så utan en jobbtyp att
 * matcha mot är svaret en tom lista, inte en gissning.
 *
 * Fail-safe: kastar aldrig. Om tabellen ännu inte finns (v121 inte körd
 * än) eller läsningen av någon annan anledning misslyckas degraderas till
 * en tom lista — offertgenereringen fungerar precis som innan denna
 * feature fanns.
 */
async function fetchRecentLessons(
  businessId: string,
  jobType?: string,
): Promise<Array<{ lesson_text: string; impact_hint: string | null }>> {
  // Ingen jobbtyp att matcha mot → inga lärdomar. Görs INNAN någon query
  // byggs, så beteendet är verifierbart utan DB (se tests/project-debrief.spec.ts).
  if (!jobType) return []

  const supabase = getServerSupabase()
  try {
    const { data, error } = await supabase
      .from('project_lesson')
      .select('lesson_text, impact_hint, created_at')
      .eq('business_id', businessId)
      .eq('job_type', jobType)
      .order('created_at', { ascending: false })
      .limit(3)

    if (error) {
      console.error('[ai-quote-generator] project_lesson-läsning misslyckades (fail-safe, tom lista):', error.message)
      // 42P01/42703 = tabellen/kolumnen finns inte än (v121 ej körd) —
      // förväntat i vissa miljöer, larma inte om det. Andra fel ska synas.
      if (!arSchemaSaknas(error)) {
        await rapporteraTystFel(supabase, businessId, 'ai-quote-generator:fetchRecentLessons', error.message, { jobType })
      }
      return []
    }
    return (data || []).map(row => ({
      lesson_text: (row as any).lesson_text as string,
      impact_hint: ((row as any).impact_hint as string | null) ?? null,
    }))
  } catch (err) {
    console.error('[ai-quote-generator] project_lesson-läsning kastade (fail-safe, tom lista):', err)
    if (!arSchemaSaknas(err)) {
      await rapporteraTystFel(
        supabase,
        businessId,
        'ai-quote-generator:fetchRecentLessons-unexpected',
        err instanceof Error ? err.message : String(err),
        { jobType },
      )
    }
    return []
  }
}

/**
 * Customer Facts V1 (injektionspunkt offert, 2026-08-12): de senast
 * bekräftade kundfakta (customer_fact, sql/v122_customer_fact.sql) som är
 * relevanta i en offertkalkyl — bara preference och constraint. commitment
 * (löften) och contact (kontaktvägar) hör inte hemma i en priskalkyl.
 *
 * Fail-safe: kastar aldrig. Tabellen kan saknas i någon miljö (v122 körs
 * manuellt av Andreas) eller läsningen strula av annan anledning — då
 * degraderas till en tom lista, precis som offertgenereringen fungerade
 * innan denna feature fanns.
 */
async function fetchCustomerFactsForQuote(
  businessId: string,
  customerId: string,
): Promise<Array<{ fact_type: 'preference' | 'constraint'; content: string }>> {
  const supabase = getServerSupabase()
  // Rapporterar till driftlarmet, men aldrig för 42P01/42703 (schema saknas,
  // väntat innan v122 körts — se filhuvudet).
  const larma = (e: unknown, msg: string) =>
    arSchemaSaknas(e) || rapporteraTystFel(supabase, businessId, 'ai-quote-generator:fetchCustomerFactsForQuote', msg, { customerId })
  try {
    const { data, error } = await supabase
      .from('customer_fact')
      .select('fact_type, content, created_at')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .in('fact_type', ['preference', 'constraint'])
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(8)

    if (error) {
      console.error('[ai-quote-generator] customer_fact-läsning misslyckades (fail-safe, tom lista):', error.message)
      larma(error, error.message)
      return []
    }
    return (data || []).map(row => ({
      fact_type: (row as any).fact_type as 'preference' | 'constraint',
      content: (row as any).content as string,
    }))
  } catch (err) {
    console.error('[ai-quote-generator] customer_fact-läsning kastade (fail-safe, tom lista):', err)
    larma(err, err instanceof Error ? err.message : String(err))
    return []
  }
}

/**
 * "Lär Handymate" (Business Twin-backlog #12, 2026-08-13) — konsument-
 * halvan byggs FÖRE capture-halvan, med flit: en regel utan en verklig
 * läsare vore en input utan effekt (se docs/strategy/BUSINESS_TWIN_
 * IDEA_BACKLOG.md #12). De senaste, ägar-dikterade affärsreglerna
 * (business_knowledge, knowledge_type='business_rule', confidence=1 —
 * skiljer dem från agenternas egna lägre-confidence-observationer).
 *
 * Ingen job_type-kolumn finns på business_knowledge (till skillnad från
 * project_lesson) — en regel är en generell policy ("vi tar inte kök
 * under 80 000"), inte en jobbspecifik lärdom, så ALLA aktiva regler
 * hämtas och modellen får själv avgöra relevans för just det här jobbet.
 *
 * Fail-safe: kastar aldrig, degraderar till tom lista.
 */
async function fetchBusinessRules(
  businessId: string,
): Promise<Array<{ observation: string }>> {
  const supabase = getServerSupabase()
  try {
    const { data, error } = await supabase
      .from('business_knowledge')
      .select('observation, created_at')
      .eq('business_id', businessId)
      .eq('knowledge_type', 'business_rule')
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) {
      console.error('[ai-quote-generator] business_knowledge-läsning misslyckades (fail-safe, tom lista):', error.message)
      if (!arSchemaSaknas(error)) {
        await rapporteraTystFel(supabase, businessId, 'ai-quote-generator:fetchBusinessRules', error.message)
      }
      return []
    }
    return (data || []).map(row => ({ observation: (row as any).observation as string }))
  } catch (err) {
    console.error('[ai-quote-generator] business_knowledge-läsning kastade (fail-safe, tom lista):', err)
    if (!arSchemaSaknas(err)) {
      await rapporteraTystFel(
        supabase,
        businessId,
        'ai-quote-generator:fetchBusinessRules-unexpected',
        err instanceof Error ? err.message : String(err),
      )
    }
    return []
  }
}

/**
 * Bygger prisliste-kontext för AI-prompten.
 * Om prislistan är tom returneras en tydlig markering.
 */
/** Customer-specific price list from price_lists_v2 */
export interface CustomerPriceList {
  name: string
  hourly_rate_normal?: number | null
  hourly_rate_ob1?: number | null
  hourly_rate_ob2?: number | null
  hourly_rate_emergency?: number | null
  material_markup_pct?: number | null
  callout_fee?: number | null
  items?: Array<{ name: string; price: number; unit: string; is_rot_eligible?: boolean }>
}

export function buildPriceContext(
  priceList: PriceListItem[] | undefined,
  hourlyRate: number,
  templates?: QuoteTemplate[],
  customerPriceList?: CustomerPriceList
): string {
  const lines: string[] = []

  // Customer-specific price list takes priority if available
  if (customerPriceList) {
    lines.push(`PRISLISTA SOM GÄLLER FÖR DENNA KUND: ${customerPriceList.name}`)
    if (customerPriceList.hourly_rate_normal) lines.push(`Timpris normal: ${customerPriceList.hourly_rate_normal} kr/tim`)
    if (customerPriceList.hourly_rate_ob1) lines.push(`Timpris OB1: ${customerPriceList.hourly_rate_ob1} kr/tim`)
    if (customerPriceList.hourly_rate_ob2) lines.push(`Timpris OB2: ${customerPriceList.hourly_rate_ob2} kr/tim`)
    if (customerPriceList.hourly_rate_emergency) lines.push(`Timpris jour: ${customerPriceList.hourly_rate_emergency} kr/tim`)
    if (customerPriceList.material_markup_pct != null) lines.push(`Materialpåslag: ${customerPriceList.material_markup_pct}%`)
    if (customerPriceList.callout_fee) lines.push(`Startavgift: ${customerPriceList.callout_fee} kr`)

    if (customerPriceList.items && customerPriceList.items.length > 0) {
      lines.push('\nSpecifika rader i denna prislista:')
      for (const item of customerPriceList.items) {
        lines.push(`- ${item.name}: ${item.price} kr/${item.unit}${item.is_rot_eligible ? ' (ROT)' : ''}`)
      }
    }

    lines.push('\nAnvänd ALLTID dessa priser när du skapar offertrader.')
    lines.push('Avvik inte från priserna om inte användaren ber om det.')
  } else if (priceList && priceList.length > 0) {
    // ETAPP B1 (2026-08-06): varje artikel får ett kort handtag ([P1], [P2] …)
    // som modellen ombeds eka tillbaka i "productRef". Handtaget är NYCKELN
    // till att raden kan kopplas till produktbanken och därmed ärva
    // komponent-snapshot, arbetsandel, ROT-split och inköpspris.
    //
    // Handtagens ordning MÅSTE vara densamma som listan som skickas till
    // matchGeneratedItems — därför numreras de här efter samma indexordning
    // som `priceList` kom in i, inte efter kategorigrupperingen nedan.
    const handleOf = new Map<PriceListItem, string>()
    priceList.forEach((item, index) => {
      if (item.id) handleOf.set(item, `P${index + 1}`)
    })
    const useHandles = handleOf.size > 0

    lines.push('HANTVERKARENS PRISLISTA (använd dessa priser exakt):')
    if (useHandles) {
      lines.push('Varje artikel har ett handtag inom hakparentes, t.ex. [P4]. Ange handtaget i fältet "productRef" på raden där du använt artikeln.')
    }
    // Gruppera per kategori
    const byCategory: Record<string, PriceListItem[]> = {}
    for (const item of priceList) {
      const cat = item.category || 'Övrigt'
      if (!byCategory[cat]) byCategory[cat] = []
      byCategory[cat].push(item)
    }
    for (const [category, items] of Object.entries(byCategory)) {
      lines.push(`\n  ${category}:`)
      for (const item of items) {
        const handle = handleOf.get(item)
        lines.push(`  - ${handle ? `[${handle}] ` : ''}${item.name}: ${item.unit_price} kr/${item.unit}`)
      }
    }
  } else {
    lines.push('PRISLISTA: Ej ifylld av hantverkaren. Markera ALLA priser med "PRIS SAKNAS — fyll i manuellt" och sätt unit_price till 0.')
  }

  if (!customerPriceList) {
    lines.push(`\nStandard timpris: ${hourlyRate} kr/tim`)
  }

  if (templates && templates.length > 0) {
    lines.push('\nTILLGÄNGLIGA OFFERTMALLAR (referens för typiska rader):')
    for (const t of templates) {
      lines.push(`- ${t.name}${t.category ? ` (${t.category})` : ''}`)
    }
  }

  return lines.join('\n')
}

/**
 * B4 (kodrevision 2026-08-03): buildPriceContext stödjer redan
 * customerPriceList, men ai-generate/route.ts skickade aldrig in den —
 * AI:n prissatte alltid mot den generella produktbanken, även för kunder
 * med en kundspecifik prislista (price_lists_v2). Samma uppslagsordning
 * som klientens egen prefill (app/dashboard/quotes/new/page.tsx,
 * "Auto-fill personal data + price list on customer change"): kundens
 * direkta price_list_id vinner, annars prislistan för kundens segment,
 * annars företagets default-prislista. Fail-safe: null vid ALLA fel/saknad
 * data (customerPriceList är optional i buildPriceContext) — AI-generering
 * ska aldrig krascha eller sinkas av ett kundprislistuppslag som strular.
 */
export async function resolveCustomerPriceList(
  businessId: string,
  customerId: string | null | undefined,
): Promise<CustomerPriceList | undefined> {
  if (!businessId || !customerId) return undefined
  try {
    const supabase = getServerSupabase()

    const { data: customer } = await supabase
      .from('customer')
      .select('price_list_id, segment_id')
      .eq('customer_id', customerId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (!customer) return undefined

    let priceListId: string | null = customer.price_list_id || null

    if (!priceListId && customer.segment_id) {
      const { data: segList } = await supabase
        .from('price_lists_v2')
        .select('id')
        .eq('business_id', businessId)
        .eq('segment_id', customer.segment_id)
        .limit(1)
        .maybeSingle()
      priceListId = segList?.id || null
    }

    if (!priceListId) {
      const { data: defaultList } = await supabase
        .from('price_lists_v2')
        .select('id')
        .eq('business_id', businessId)
        .eq('is_default', true)
        .limit(1)
        .maybeSingle()
      priceListId = defaultList?.id || null
    }

    if (!priceListId) return undefined

    const { data: priceList } = await supabase
      .from('price_lists_v2')
      .select(`
        name, hourly_rate_normal, hourly_rate_ob1, hourly_rate_ob2, hourly_rate_emergency,
        material_markup_pct, callout_fee,
        items:price_list_items_v2(name, unit, price, is_rot_eligible)
      `)
      .eq('id', priceListId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (!priceList) return undefined

    return {
      name: priceList.name,
      hourly_rate_normal: priceList.hourly_rate_normal,
      hourly_rate_ob1: priceList.hourly_rate_ob1,
      hourly_rate_ob2: priceList.hourly_rate_ob2,
      hourly_rate_emergency: priceList.hourly_rate_emergency,
      material_markup_pct: priceList.material_markup_pct,
      callout_fee: priceList.callout_fee,
      items: (priceList.items || []) as CustomerPriceList['items'],
    }
  } catch (err) {
    console.error('[ai-quote-generator] resolveCustomerPriceList failed:', err)
    return undefined
  }
}

export async function analyzeJobImage(
  imageBase64: string,
  branch: string,
  /** COGS-mätaren (etapp "svansen", 2026-08-14): businessId behövs för att
      kunna bokföra anropets kostnad. Optional av bakåtkompatibilitetsskäl
      (t.ex. framtida anropare utan business-kontext) — utan den skippas
      mätningen tyst, precis som meterDirectLlmCall redan gör vid saknad usage. */
  businessId?: string,
): Promise<ImageAnalysis> {
  const anthropic = getAnthropic()
  const IMAGE_ANALYZE_MODEL = 'claude-sonnet-4-6'

  const response = await anthropic.messages.create({
    model: IMAGE_ANALYZE_MODEL,
    max_tokens: 1000,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: imageBase64
            }
          },
          {
            type: 'text',
            text: `Du är en erfaren svensk kalkylator för ${branch || 'bygg- och hantverksprojekt'}.

Analysera bilden noggrant och identifiera:
1. Vad du ser som behöver åtgärdas
2. Vilka specifika arbeten/material som kan behövas
3. Vilken typ av jobb detta är

Om bilden är en RITNING eller PLANRITNING:
- Läs av mått från ritningen (meter, millimeter)
- Beräkna ytor: golv, väggar, tak (m²)
- Identifiera installationer: el-punkter, VVS, ventilation
- Notera dörrar, fönster och andra öppningar

Om bilden är ett FOTO:
- Uppskatta mått baserat på proportioner och kända referenspunkter
- Identifiera befintligt material och skick
- Föreslå vad som behöver bytas/renoveras

Svara ENDAST med JSON:
{
  "description": "Beskrivning av vad du ser och vad som behöver göras",
  "identifiedItems": ["lista", "på", "identifierade", "saker"],
  "suggestedJobType": "typ av jobb",
  "confidence": 75,
  "measurements": {
    "floor_area_m2": null,
    "wall_area_m2": null,
    "ceiling_area_m2": null,
    "linear_meters": null
  },
  "imageType": "photo eller drawing"
}`
          }
        ]
      }
    ]
  })

  // COGS-boken (etapp "svansen", 2026-08-14) — vision-anropet var tidigare
  // helt omätt. Mäts oavsett om JSON-parsningen nedan lyckas: tokens
  // förbrukades och kostade pengar oavsett svarsform.
  if (businessId) {
    await meterDirectLlmCall({
      supabase: getServerSupabase(),
      businessId,
      usage: response.usage,
      costUsd: llmCostUsd(response.usage, IMAGE_ANALYZE_MODEL),
      refType: 'quote_ai_image_analyze',
      refId: 'qimg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      meta: { branch },
    })
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return {
      description: 'Kunde inte analysera bilden',
      identifiedItems: [],
      suggestedJobType: 'Okänt',
      confidence: 0
    }
  }

  return JSON.parse(jsonMatch[0])
}

export async function findSimilarQuotes(
  businessId: string,
  jobDescription: string,
  limit: number = 5
): Promise<Array<{ quote_id: string; title: string; total: number }>> {
  const supabase = getServerSupabase()

  // Vunna offerter (accepterade/signerade) ger prishistoriken — utkast är
  // aldrig prissatta i skarpt läge och ska inte forma ankaret (se
  // WON_QUOTE_STATUSES i lib/quotes/statuses.ts).
  const { data: quotes } = await supabase
    .from('quotes')
    .select('quote_id, title, description, total, labor_total, material_total')
    .eq('business_id', businessId)
    .in('status', WON_QUOTE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!quotes || quotes.length === 0) return []

  // Simple keyword matching for similarity
  const keywords = jobDescription.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  const scored = quotes.map((q: any) => {
    const text = `${q.title} ${q.description}`.toLowerCase()
    const score = keywords.reduce((sum: number, kw: string) => sum + (text.includes(kw) ? 1 : 0), 0)
    return { ...q, score }
  })

  return scored
    .filter((q: any) => q.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, limit)
    .map((q: any) => ({
      quote_id: q.quote_id,
      title: q.title,
      total: q.total
    }))
}

export async function getAveragePrice(
  businessId: string,
  jobDescription: string
): Promise<{ average: number; min: number; max: number; count: number }> {
  // Samma vunna-filter som findSimilarQuotes — se kommentar där.
  const similar = await findSimilarQuotes(businessId, jobDescription, 20)

  if (similar.length === 0) {
    return { average: 0, min: 0, max: 0, count: 0 }
  }

  const totals = similar.map(q => q.total).filter(t => t > 0)
  if (totals.length === 0) return { average: 0, min: 0, max: 0, count: 0 }

  return {
    average: Math.round(totals.reduce((a, b) => a + b, 0) / totals.length),
    min: Math.min(...totals),
    max: Math.max(...totals),
    count: totals.length
  }
}

export async function generateQuoteFromInput(
  input: QuoteGenerationInput
): Promise<GeneratedQuote> {
  const anthropic = getAnthropic()

  // Gather context in parallel
  const description = [
    input.textDescription,
    input.voiceTranscript
  ].filter(Boolean).join('\n')

  // B2 (kodrevision 2026-08-03): analyzeJobImage(input.imageBase64) kördes
  // TIDIGARE här — men det RÅA bildbytes bifogas ändå direkt i userContent
  // nedan till exakt samma modell (Sonnet). Det innebar två sekventiella
  // Sonnet-anrop som analyserade EXAKT samma bild: ett för att generera en
  // textbeskrivning, ett för själva offertgenereringen som ändå fick se
  // bilden på nytt. Halverad väntetid utan kvalitetsförlust: bild-analys-
  // instruktionerna (ritning/foto, mått) är inbakade i systemPrompt nedan
  // i stället, och modellen analyserar bilden en gång i SAMMA anrop som
  // genererar offerten. analyzeJobImage() lever kvar oförändrad — används
  // fortfarande av ai-generate/route.ts för att beskriva EXTRA bilder
  // (bild 2-5) som text innan de vävs in i textDescription här.
  const [similarQuotes, priceStats, lessons, customerFacts, rules] = await Promise.all([
    description ? findSimilarQuotes(input.businessId, description) : Promise.resolve([]),
    description ? getAveragePrice(input.businessId, description) : Promise.resolve({ average: 0, min: 0, max: 0, count: 0 }),
    fetchRecentLessons(input.businessId, input.jobType),
    input.customerId ? fetchCustomerFactsForQuote(input.businessId, input.customerId) : Promise.resolve([]),
    fetchBusinessRules(input.businessId),
  ])

  const fullDescription = [
    input.textDescription ? `Textbeskrivning: ${input.textDescription}` : null,
    input.voiceTranscript ? `Röstbeskrivning: ${input.voiceTranscript}` : null
  ].filter(Boolean).join('\n\n')

  const imageInstructions = input.imageBase64 ? `

En bild är bifogad till detta meddelande — analysera den DIREKT som en del av offertgenereringen (ingen separat analys görs i ett tidigare steg).

Om bilden är en RITNING eller PLANRITNING:
- Läs av mått från ritningen (meter, millimeter)
- Beräkna ytor: golv, väggar, tak (m²)
- Identifiera installationer: el-punkter, VVS, ventilation
- Notera dörrar, fönster och andra öppningar
- Räkna in spill (~10% extra på material)

Om bilden är ett FOTO:
- Uppskatta mått baserat på proportioner och kända referenspunkter
- Identifiera befintligt material och skick
- Föreslå vad som behöver bytas/renoveras vs kan behållas` : ''

  const historicalContext = priceStats.count > 0
    ? `\nHistoriska priser för liknande jobb: Snitt ${priceStats.average} kr, Min ${priceStats.min} kr, Max ${priceStats.max} kr (${priceStats.count} offerter)`
    : ''

  // Project Debrief Capture (2026-08-12): hantverkarens egna bekräftade
  // lärdomar från tidigare liknande jobb — ingen AI-inferens, bara
  // vidarebefordrade svar. Tom lista när inga debrief-svar finns än.
  const lessonsContext = lessons.length > 0
    ? `\n\nLÄRDOMAR FRÅN TIDIGARE LIKNANDE JOBB (bekräftade av hantverkaren — ta höjd för dessa):\n${lessons
        .map(l => `- ${l.lesson_text}`)
        .join('\n')}`
    : ''

  // Customer Facts V1 (injektionspunkt offert, 2026-08-12): bekräftade
  // preferenser/förutsättningar — svenska etiketter för konsekvens med
  // kundkortets "Det här vet Handymate". Utelämnas helt ur prompten när
  // listan är tom.
  const CUSTOMER_FACT_LABEL_SV: Record<'preference' | 'constraint', string> = {
    preference: 'Preferens',
    constraint: 'Förutsättning',
  }
  const customerFactsContext = customerFacts.length > 0
    ? `\n\nBEKRÄFTADE KUNDFAKTA (godkända av hantverkaren — ta hänsyn där relevant):\n${customerFacts
        .map(f => `- [${CUSTOMER_FACT_LABEL_SV[f.fact_type]}] ${f.content}`)
        .join('\n')}`
    : ''

  // "Lär Handymate" (2026-08-13): ägar-dikterade affärsregler, generella
  // policys snarare än jobbspecifika lärdomar — explicit instruktion att
  // FLAGGA relevans i "reasoning" (inte bara tyst följa dem), så det går
  // att verifiera i efterhand att en regel faktiskt påverkade offerten
  // och inte bara passivt lästes.
  const rulesContext = rules.length > 0
    ? `\n\nÄGARENS AFFÄRSREGLER (dikterade av hantverkaren själv — följ dessa, och om någon är relevant för DETTA jobb: nämn det uttryckligen i "reasoning"):\n${rules
        .map(r => `- ${r.observation}`)
        .join('\n')}`
    : ''

  const priceContext = buildPriceContext(input.priceList, input.hourlyRate, input.templates, input.customerPriceList)
  const hasPriceList = (input.priceList?.length || 0) > 0

  const systemPrompt = `Du är en erfaren svensk kalkylator för bygg- och hantverksprojekt.

Bransch: ${input.branch || 'Bygg/Hantverkare'}
${priceContext}${historicalContext}${lessonsContext}${customerFactsContext}${rulesContext}

Analysera beskrivningen (och en eventuellt bifogad bild — se instruktioner nedan) och ge ett detaljerat offertförslag.
${imageInstructions}

REGLER FÖR PRISSÄTTNING:
1. Arbete: använd ALLTID hantverkarens timpris (${input.hourlyRate} kr/h)
2. Material: ${hasPriceList
    ? 'Använd ENBART priser från prislistan ovan. Markera priser från prislistan med "fromPriceList": true.'
    : 'Prislista saknas — sätt ALLA materialpriser till 0 och markera med "note": "PRIS SAKNAS — fyll i manuellt".'}
3. Om en tjänst eller ett material SAKNAS i prislistan — lägg till raden men sätt priset till 0 och lägg till "note": "PRIS SAKNAS — fyll i manuellt"
4. Gissa ALDRIG ett pris — det är bättre med 0 kr och en markering än ett felaktigt pris
5. Separera ALLTID material och arbete som separata rader
6. ROT-avdrag gäller enbart arbetskostnad (installation/reparation/underhåll i bostad), aldrig material
7. RUT gäller hemtjänster/städ/trädgård
8. Inkludera alltid "Småmaterial" (skruv, borrspets, tejp, etc.) — ${hasPriceList ? 'använd pris från prislistan om det finns, annars 0 kr med markering' : '0 kr med markering'}
9. Alla priser exkl moms
10. Var realistisk med tidsuppskattningar (hellre lite för mycket tid än för lite)
11. STRUKTUR PÅ RADERNA — styr efter innehåll, inte efter antal: en arbetsrad per moment, en materialrad per huvudmaterial, och slå ihop förbrukningsmaterial (skruv, tejp, borrspets) till EN "Småmaterial"-rad. Högst 12 rader i "items". Färre välavgränsade rader är bättre än många små.
12. I fältet "productRef": om du använt en artikel ur prislistan, skriv dess handtag (t.ex. "P4"). Gissa ALDRIG ett handtag — utelämna fältet eller sätt null när du inte använt någon artikel ur listan. Ett felaktigt handtag är värre än inget.
13. I fältet "notIncludedSuggestions": 0-4 KORTA punkter om vad som rimligen INTE ingår i just det här jobbet (t.ex. "Målning efter kaklingen", "Bygglov och myndighetsavgifter", "Bortforsling av rivningsmassor"). Skriv bara sådant som är genuint relevant för beskrivningen — hitta ALDRIG på avgränsningar för att fylla listan. Tom lista ([]) är RÄTT svar när inget särskilt behöver avgränsas.
14. I fältet "options": föreslå 0-3 GENUINT relevanta TILLÄGGSARBETEN kunden kan välja till utöver grundofferten (t.ex. "demontering och bortforsling av gammalt kök" vid ett kökbyte, eller "målning av foder" vid ett fönsterbyte). Samma fältformat som "items". Hitta ALDRIG på tillägg bara för att fylla listan — en tom lista ([]) är RÄTT svar när inget genuint relevant tillägg finns.

Svara ENDAST med JSON (ingen markdown):
{
  "jobTitle": "Kort titel",
  "jobDescription": "Professionell beskrivning till kund (2-3 meningar)",
  "estimatedHours": 8,
  "measurements": {
    "floor_area_m2": null,
    "wall_area_m2": null,
    "ceiling_area_m2": null
  },
  "items": [
    {"description": "Arbete - beskrivning", "quantity": 8, "unit": "timmar", "unitPrice": ${input.hourlyRate}, "type": "labor", "confidence": 90, "fromPriceList": false, "productRef": null, "note": null},
    {"description": "Materialnamn", "quantity": 1, "unit": "st", "unitPrice": 0, "type": "material", "confidence": 70, "fromPriceList": false, "productRef": null, "note": "PRIS SAKNAS — fyll i manuellt"}
  ],
  "options": [
    {"description": "Genuint relevant tilläggsarbete (eller utelämna helt om inget passar)", "quantity": 1, "unit": "st", "unitPrice": 0, "type": "labor", "confidence": 60, "fromPriceList": false, "productRef": null, "note": null}
  ],
  "notIncludedSuggestions": ["Kort punkt om vad som inte ingår (eller [] om inget behöver avgränsas)"],
  "suggestedDeductionType": "rot",
  "confidence": 75,
  "reasoning": "Kort förklaring av bedömningen och använda mått"
}`

  // Build messages with optional image
  const userContent: any[] = []

  if (input.imageBase64) {
    userContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: input.imageBase64
      }
    })
  }

  userContent.push({
    type: 'text',
    text: `Skapa ett offertförslag för:\n\n${fullDescription}`
  })

  // EN källa för modellvalet, så beslutsposten (lib/ai/decision-record.ts)
  // aldrig kan påstå en annan modell än den som faktiskt kördes.
  const MODEL = 'claude-sonnet-4-6'

  const response = await anthropic.messages.create({
    model: MODEL,
    // ETAPP B2 (2026-08-06): höjd från 2000. Radgränsen gick från 8 till 12 och
    // svaret bär nu även productRef och notIncludedSuggestions. Vid trunkering
    // blir JSON:en ogiltig och användaren får det obegripliga felet "Kunde inte
    // generera offertförslag" — utan någon ledtråd om att det var längden.
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }]
  })

  // COGS-boken (etapp "svansen", 2026-08-14) — huvudanropet för offert-
  // generering var tidigare helt omätt. Mäts oavsett om JSON-parsningen
  // nedan lyckas (samma princip som analyzeJobImage ovan): tokens
  // förbrukades och kostade pengar även vid ett trunkerat/oparsbart svar.
  await meterDirectLlmCall({
    supabase: getServerSupabase(),
    businessId: input.businessId,
    usage: response.usage,
    costUsd: llmCostUsd(response.usage, MODEL),
    refType: 'quote_ai_generate',
    refId: 'qgen_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    meta: { branch: input.branch, hasImage: !!input.imageBase64 },
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    // Vanligaste orsaken är att svaret trunkerats (stop_reason 'max_tokens') —
    // då finns ingen avslutande klammer och regexen hittar inget. Tidigare
    // fick användaren bara "Kunde inte generera offertförslag" utan ledtråd.
    console.error('[ai-quote-generator] Inget JSON i svaret. stop_reason:', response.stop_reason, '| längd:', text.length)
    throw new Error(
      response.stop_reason === 'max_tokens'
        ? 'Offertförslaget blev för långt och kunde inte läsas. Försök med en kortare beskrivning.'
        : 'Kunde inte generera offertförslag',
    )
  }

  let parsed: any
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (err: any) {
    console.error('[ai-quote-generator] Ogiltig JSON. stop_reason:', response.stop_reason, '|', err.message)
    throw new Error(
      response.stop_reason === 'max_tokens'
        ? 'Offertförslaget blev för långt och kunde inte läsas. Försök med en kortare beskrivning.'
        : 'Kunde inte tolka offertförslaget',
    )
  }

  // Map items with IDs
  const items: GeneratedQuoteItem[] = (parsed.items || []).map((item: any, i: number) => ({
    id: `item_${Math.random().toString(36).substr(2, 9)}`,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice || 0,
    type: item.type || 'material',
    confidence: item.confidence || parsed.confidence || 70,
    ...(item.note ? { note: item.note } : {}),
    ...(item.fromPriceList !== undefined ? { fromPriceList: item.fromPriceList } : {})
  }))

  // B5: AI-föreslagna tillval — samma radform som items, men räknas ALDRIG
  // in i laborCost/materialCost/totalBeforeVat (kunden har inte valt dem
  // till). Defensiv slice(0, 3) — prompten instruerar 0-3, men modellen är
  // inte en garanti.
  const options: GeneratedQuoteItem[] = (parsed.options || []).slice(0, 3).map((item: any, i: number) => ({
    id: `opt_${Math.random().toString(36).substr(2, 9)}`,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice || 0,
    type: item.type || 'material',
    confidence: item.confidence || parsed.confidence || 60,
    ...(item.note ? { note: item.note } : {}),
    ...(item.fromPriceList !== undefined ? { fromPriceList: item.fromPriceList } : {})
  }))

  // ETAPP B1: koppla raderna till produktbanken INNAN resultatet lämnar
  // generatorn. Görs här och inte hos anroparen så att alla fyra vägar in
  // (UI-knappen, godkännande-kön, ÄTA-förslaget, förslagsmotorn) får
  // kopplingen — en av dem hade annars blivit kvar utan, och det är exakt så
  // de tysta luckorna uppstår.
  type IndexedProduct = MatchableProduct & { promptIndex: number }
  const matchableProducts: IndexedProduct[] = []
  ;(input.priceList || []).forEach((p, index) => {
    if (p.id) {
      matchableProducts.push({ id: p.id, name: p.name, unit: p.unit, category: p.category, promptIndex: index })
    }
  })

  if (matchableProducts.length > 0) {
    // Handtagen numrerades i buildPriceContext efter priceList:ans indexordning.
    // Här måste samma numrering återskapas, annars pekar [P4] på fel artikel —
    // därför byggs handtagsmappen från originalindexet, inte från den filtrerade
    // listans position.
    const handles = new Map<string, MatchableProduct>()
    for (const p of matchableProducts) {
      handles.set(`P${p.promptIndex + 1}`, p)
    }

    const applyMatches = (list: GeneratedQuoteItem[], raw: any[]) => {
      list.forEach((item, i) => {
        const found = matchGeneratedItem(
          { description: item.description, unit: item.unit, productRef: raw[i]?.productRef },
          matchableProducts,
          handles,
        )
        item.linkedProductId = found?.productId ?? null
        item.productMatchType = found?.matchType ?? null
      })
    }
    applyMatches(items, parsed.items || [])
    applyMatches(options, (parsed.options || []).slice(0, 3))

    const hits = items.filter(i => i.linkedProductId).length
    console.log(`[ai-quote-generator] Produktkoppling: ${hits}/${items.length} rader kopplade`)
  }

  const missingPriceCount = items.filter(i => i.unitPrice === 0 || i.note?.includes('PRIS SAKNAS')).length
  const laborCost = items.filter(i => i.type === 'labor').reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const materialCost = items.filter(i => i.type !== 'labor').reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)

  return {
    jobTitle: parsed.jobTitle || 'Offert',
    jobDescription: parsed.jobDescription || '',
    items,
    options,
    estimatedHours: parsed.estimatedHours || 0,
    laborCost,
    materialCost,
    totalBeforeVat: laborCost + materialCost,
    suggestedDeductionType: parsed.suggestedDeductionType || 'none',
    confidence: parsed.confidence || 50,
    reasoning: parsed.reasoning || '',
    similarHistoricalQuotes: similarQuotes.map(q => ({
      id: q.quote_id,
      title: q.title,
      total: q.total
    })),
    lessons,
    customerFacts,
    rules,
    priceListEmpty: !hasPriceList,
    missingPriceCount,
    // B3: defensiv — modellen instrueras till 0-4 korta punkter, men det är
    // en instruktion, inte en garanti. Tomma strängar filtreras bort så
    // gränssnittet aldrig visar en tom bock att kryssa i.
    notIncludedSuggestions: Array.isArray(parsed.notIncludedSuggestions)
      ? parsed.notIncludedSuggestions
          .filter((s: any) => typeof s === 'string' && s.trim().length > 0)
          .map((s: string) => s.trim())
          .slice(0, 4)
      : [],
    model: MODEL,
  }
}
