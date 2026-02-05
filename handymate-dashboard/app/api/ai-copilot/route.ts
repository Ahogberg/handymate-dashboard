import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedBusiness, checkAiApiRateLimit } from '@/lib/auth'

function getAnthropic() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  })
}

// Demo-context (i verkligheten hämtar vi från Supabase)
const demoContext = {
  business: 'Elexperten Stockholm',
  todayBookings: [
    { customer: 'Anna Svensson', service: 'Elinstallation', time: '09:00', status: 'confirmed' },
    { customer: 'Erik Johansson', service: 'Felsökning - Strömavbrott', time: '11:00', status: 'pending', priority: 'urgent' },
    { customer: 'Maria Lindberg', service: 'Säkringsbyte', time: '14:00', status: 'confirmed' },
  ],
  openCases: [
    { customer: 'Erik Johansson', issue: 'Strömavbrott', priority: 'urgent', waitingHours: 2 },
  ],
  stats: {
    bookingsToday: 8,
    activeCustomers: 124,
    urgentCases: 2,
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const authBusiness = await getAuthenticatedBusiness(request)
    if (!authBusiness) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit check (AI API costs money)
    const rateLimit = checkAiApiRateLimit(authBusiness.business_id)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 })
    }

    const anthropic = getAnthropic()
    const { question } = await request.json()

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: `Du är en AI-assistent för Handymate, ett bokningssystem för hantverkare. 
Du hjälper användaren att förstå och hantera deras verksamhet.
Svara alltid på svenska, kort och koncist.
Var hjälpsam och ge konkreta förslag när det är möjligt.

KONTEXT OM VERKSAMHETEN:
${JSON.stringify(demoContext, null, 2)}`,
      messages: [{ role: 'user', content: question }],
    })

    const answer = response.content[0].type === 'text' 
      ? response.content[0].text 
      : 'Kunde inte generera svar.'

    return NextResponse.json({ answer })
  } catch (error) {
    console.error('AI Copilot error:', error)
    return NextResponse.json(
      { answer: 'Ett fel uppstod. Försök igen.' },
      { status: 500 }
    )
  }
}
