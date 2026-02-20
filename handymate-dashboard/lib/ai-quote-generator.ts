import Anthropic from '@anthropic-ai/sdk'
import { getServerSupabase } from '@/lib/supabase'

export interface QuoteGenerationInput {
  businessId: string
  branch: string
  hourlyRate: number
  imageBase64?: string
  voiceTranscript?: string
  textDescription?: string
  customerId?: string
  priceList?: Array<{ name: string; unit: string; unit_price: number; category: string }>
}

export interface GeneratedQuoteItem {
  id: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  type: 'labor' | 'material' | 'service'
  confidence: number
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

  const priceListContext = input.priceList && input.priceList.length > 0
    ? `\nHantverkarens prislista:\n${input.priceList.map(p => `- ${p.name}: ${p.unit_price} kr/${p.unit} (${p.category})`).join('\n')}`
    : ''

  const systemPrompt = `Du är en erfaren svensk kalkylator för bygg- och hantverksprojekt.

Bransch: ${input.branch || 'Bygg/Hantverkare'}
Hantverkarens timpris: ${input.hourlyRate} kr/h${historicalContext}${priceListContext}

Analysera beskrivningen (och eventuell bildanalys/ritningsanalys) och ge ett detaljerat offertförslag.

VIKTIGA REGLER:
- Arbete: använd ALLTID hantverkarens timpris (${input.hourlyRate} kr/h)
- Material: ${input.priceList && input.priceList.length > 0 ? 'MATCHA mot hantverkarens prislista ovan när möjligt. Markera priser från prislistan med "fromPriceList": true. Om ingen match finns, använd realistiska marknadspriser.' : 'Använd realistiska marknadspriser i SEK.'}
- Inkludera alltid "Småmaterial" (skruv, borrspets, tejp, etc.) ~100-300 kr
- Var realistisk med tidsuppskattningar (hellre lite för mycket tid än för lite)
- ROT gäller installation/reparation/underhåll i bostad, RUT gäller hemtjänster/städ/trädgård
- Alla priser exkl moms

OM RITNING/PLANRITNING ANALYSERATS:
- Använd de identifierade måtten för att beräkna exakta materialkvantiteter
- Beräkna m² för golv, väggar, tak separat
- Räkna in spill (~10% extra på material)
- Identifiera alla installationspunker (el, vatten, avlopp)

OM FOTO ANALYSERATS:
- Uppskatta mått baserat på proportioner
- Identifiera materialtyper och skick
- Föreslå vad som behöver bytas vs kan behållas

Svara ENDAST med JSON:
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
    {"description": "Arbete - beskrivning", "quantity": 8, "unit": "timmar", "unitPrice": ${input.hourlyRate}, "type": "labor", "confidence": 90, "fromPriceList": false},
    {"description": "Materialnamn", "quantity": 1, "unit": "st", "unitPrice": 3200, "type": "material", "confidence": 70, "fromPriceList": false}
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
    unitPrice: item.unitPrice,
    type: item.type || 'material',
    confidence: item.confidence || parsed.confidence || 70
  }))

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
    }))
  }
}
