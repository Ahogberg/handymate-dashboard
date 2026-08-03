import Anthropic from '@anthropic-ai/sdk'
import { getServerSupabase } from '@/lib/supabase'

export interface PriceListItem {
  name: string
  unit: string
  unit_price: number
  category: string
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
  priceListEmpty: boolean
  missingPriceCount: number
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
    lines.push('HANTVERKARENS PRISLISTA (använd dessa priser exakt):')
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
        lines.push(`  - ${item.name}: ${item.unit_price} kr/${item.unit}`)
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
  branch: string
): Promise<ImageAnalysis> {
  const anthropic = getAnthropic()

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
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
): Promise<Array<{ quote_id: string; title: string; total: number; items: any[] }>> {
  const supabase = getServerSupabase()

  // Get accepted/sent quotes for this business to find pricing patterns
  const { data: quotes } = await supabase
    .from('quotes')
    .select('quote_id, title, description, total, items, labor_total, material_total')
    .eq('business_id', businessId)
    .in('status', ['accepted', 'sent', 'draft'])
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
      total: q.total,
      items: q.items
    }))
}

export async function getAveragePrice(
  businessId: string,
  jobDescription: string
): Promise<{ average: number; min: number; max: number; count: number }> {
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
  const [similarQuotes, priceStats] = await Promise.all([
    description ? findSimilarQuotes(input.businessId, description) : Promise.resolve([]),
    description ? getAveragePrice(input.businessId, description) : Promise.resolve({ average: 0, min: 0, max: 0, count: 0 }),
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

  const priceContext = buildPriceContext(input.priceList, input.hourlyRate, input.templates, input.customerPriceList)
  const hasPriceList = (input.priceList?.length || 0) > 0

  const systemPrompt = `Du är en erfaren svensk kalkylator för bygg- och hantverksprojekt.

Bransch: ${input.branch || 'Bygg/Hantverkare'}
${priceContext}${historicalContext}

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
11. Max 8 rader i "items" — var konkret och specifik
12. I fältet "options": föreslå 0-3 GENUINT relevanta TILLÄGGSARBETEN kunden kan välja till utöver grundofferten (t.ex. "demontering och bortforsling av gammalt kök" vid ett kökbyte, eller "målning av foder" vid ett fönsterbyte). Samma fältformat som "items". Hitta ALDRIG på tillägg bara för att fylla listan — en tom lista ([]) är RÄTT svar när inget genuint relevant tillägg finns.

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
    {"description": "Arbete - beskrivning", "quantity": 8, "unit": "timmar", "unitPrice": ${input.hourlyRate}, "type": "labor", "confidence": 90, "fromPriceList": false, "note": null},
    {"description": "Materialnamn", "quantity": 1, "unit": "st", "unitPrice": 0, "type": "material", "confidence": 70, "fromPriceList": false, "note": "PRIS SAKNAS — fyll i manuellt"}
  ],
  "options": [
    {"description": "Genuint relevant tilläggsarbete (eller utelämna helt om inget passar)", "quantity": 1, "unit": "st", "unitPrice": 0, "type": "labor", "confidence": 60, "fromPriceList": false, "note": null}
  ],
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

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }]
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    throw new Error('Kunde inte generera offertförslag')
  }

  const parsed = JSON.parse(jsonMatch[0])

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
    priceListEmpty: !hasPriceList,
    missingPriceCount
  }
}
