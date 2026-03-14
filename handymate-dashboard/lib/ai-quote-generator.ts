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
export function buildPriceContext(
  priceList: PriceListItem[] | undefined,
  hourlyRate: number,
  templates?: QuoteTemplate[]
): string {
  const lines: string[] = []

  if (priceList && priceList.length > 0) {
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

  lines.push(`\nStandard timpris: ${hourlyRate} kr/tim`)

  if (templates && templates.length > 0) {
    lines.push('\nTILLGÄNGLIGA OFFERTMALLAR (referens för typiska rader):')
    for (const t of templates) {
      lines.push(`- ${t.name}${t.category ? ` (${t.category})` : ''}`)
    }
  }

  return lines.join('\n')
}

export async function analyzeJobImage(
  imageBase64: string,
  branch: string
): Promise<ImageAnalysis> {
  const anthropic = getAnthropic()

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
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

  const [similarQuotes, priceStats, imageAnalysis] = await Promise.all([
    description ? findSimilarQuotes(input.businessId, description) : Promise.resolve([]),
    description ? getAveragePrice(input.businessId, description) : Promise.resolve({ average: 0, min: 0, max: 0, count: 0 }),
    input.imageBase64 ? analyzeJobImage(input.imageBase64, input.branch) : Promise.resolve(null)
  ])

  // Build the full description including image analysis
  const fullDescription = [
    imageAnalysis ? `Bildanalys: ${imageAnalysis.description}` : null,
    input.textDescription ? `Textbeskrivning: ${input.textDescription}` : null,
    input.voiceTranscript ? `Röstbeskrivning: ${input.voiceTranscript}` : null
  ].filter(Boolean).join('\n\n')

  const historicalContext = priceStats.count > 0
    ? `\nHistoriska priser för liknande jobb: Snitt ${priceStats.average} kr, Min ${priceStats.min} kr, Max ${priceStats.max} kr (${priceStats.count} offerter)`
    : ''

  const priceContext = buildPriceContext(input.priceList, input.hourlyRate, input.templates)
  const hasPriceList = (input.priceList?.length || 0) > 0

  const systemPrompt = `Du är en erfaren svensk kalkylator för bygg- och hantverksprojekt.

Bransch: ${input.branch || 'Bygg/Hantverkare'}
${priceContext}${historicalContext}

Analysera beskrivningen (och eventuell bildanalys/ritningsanalys) och ge ett detaljerat offertförslag.

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
11. Max 8 rader — var konkret och specifik

OM RITNING/PLANRITNING ANALYSERATS:
- Använd de identifierade måtten för att beräkna exakta materialkvantiteter
- Beräkna m² för golv, väggar, tak separat
- Räkna in spill (~10% extra på material)
- Identifiera alla installationspunkter (el, vatten, avlopp)

OM FOTO ANALYSERATS:
- Uppskatta mått baserat på proportioner
- Identifiera materialtyper och skick
- Föreslå vad som behöver bytas vs kan behållas

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
    model: 'claude-sonnet-4-20250514',
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

  const missingPriceCount = items.filter(i => i.unitPrice === 0 || i.note?.includes('PRIS SAKNAS')).length
  const laborCost = items.filter(i => i.type === 'labor').reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
  const materialCost = items.filter(i => i.type !== 'labor').reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)

  return {
    jobTitle: parsed.jobTitle || 'Offert',
    jobDescription: parsed.jobDescription || '',
    items,
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
