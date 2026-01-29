import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export interface AIInsight {
  type: 'suggestion' | 'warning' | 'info'
  title: string
  description: string
  action?: {
    label: string
    href: string
  }
}

export async function getAIInsights(context: {
  bookings: any[]
  cases: any[]
  events: any[]
}): Promise<AIInsight[]> {
  const prompt = `Du är en AI-assistent för ett hantverksföretag. Analysera följande data och ge 2-3 korta, actionable insikter på svenska.

BOKNINGAR IDAG:
${JSON.stringify(context.bookings.slice(0, 5), null, 2)}

ÖPPNA ÄRENDEN:
${JSON.stringify(context.cases.slice(0, 5), null, 2)}

SENASTE HÄNDELSER:
${JSON.stringify(context.events.slice(0, 5), null, 2)}

Svara i JSON-format:
[
  {
    "type": "suggestion|warning|info",
    "title": "Kort titel",
    "description": "Beskrivning av insikten"
  }
]

Fokusera på:
- Akuta ärenden som behöver uppmärksamhet
- Bokningar som snart börjar
- Mönster eller problem
- Förslag på förbättringar`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    return []
  } catch (error) {
    console.error('AI insights error:', error)
    return []
  }
}

export async function askCopilot(question: string, context: any): Promise<string> {
  const prompt = `Du är en AI-copilot för Handymate, ett system för hantverkare. Svara på svenska, kort och koncist.

KONTEXT:
${JSON.stringify(context, null, 2)}

FRÅGA: ${question}

Ge ett hjälpsamt svar. Om du föreslår åtgärder, var specifik.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    return response.content[0].type === 'text' ? response.content[0].text : 'Kunde inte generera svar.'
  } catch (error) {
    console.error('Copilot error:', error)
    return 'Ett fel uppstod. Försök igen.'
  }
}
