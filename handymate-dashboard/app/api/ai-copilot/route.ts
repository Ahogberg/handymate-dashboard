import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness, checkAiApiRateLimit } from '@/lib/auth'

function getAnthropic() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  })
}

async function getBusinessContext(businessId: string, businessName: string) {
  const supabase = getServerSupabase()
  const today = new Date().toISOString().split('T')[0]

  // Fetch today's bookings with customer names
  const { data: todayBookings } = await supabase
    .from('booking')
    .select('booking_id, service_type, booking_date, booking_time, status, customer:customer_id(name)')
    .eq('business_id', businessId)
    .eq('booking_date', today)
    .order('booking_time', { ascending: true })
    .limit(20)

  // Fetch active customer count
  const { count: activeCustomers } = await supabase
    .from('customer')
    .select('customer_id', { count: 'exact', head: true })
    .eq('business_id', businessId)

  // Fetch pending/urgent AI suggestions (open cases)
  const { data: pendingSuggestions } = await supabase
    .from('ai_suggestion')
    .select('suggestion_id, suggestion_type, title, description, priority, status, customer:customer_id(name)')
    .eq('business_id', businessId)
    .eq('status', 'pending')
    .order('priority', { ascending: true })
    .limit(10)

  // Fetch overdue invoices count
  const { count: overdueInvoices } = await supabase
    .from('invoice')
    .select('invoice_id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'overdue')

  // Fetch pending quotes count
  const { count: pendingQuotes } = await supabase
    .from('quotes')
    .select('quote_id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .in('status', ['draft', 'sent'])

  const formattedBookings = (todayBookings || []).map((b: any) => ({
    customer: b.customer?.name || 'Okänd kund',
    service: b.service_type,
    time: b.booking_time,
    status: b.status,
  }))

  const urgentCases = (pendingSuggestions || []).filter((s: any) => s.priority === 'high' || s.priority === 'urgent')

  return {
    business: businessName,
    todayBookings: formattedBookings,
    openCases: (pendingSuggestions || []).map((s: any) => ({
      customer: s.customer?.name || 'Okänd kund',
      type: s.suggestion_type,
      title: s.title,
      priority: s.priority,
    })),
    stats: {
      bookingsToday: formattedBookings.length,
      activeCustomers: activeCustomers || 0,
      urgentCases: urgentCases.length,
      overdueInvoices: overdueInvoices || 0,
      pendingQuotes: pendingQuotes || 0,
    },
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

    // Fetch real business context from the database
    const businessContext = await getBusinessContext(authBusiness.business_id, authBusiness.business_name)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: `Du är en AI-assistent för Handymate, ett bokningssystem för hantverkare.
Du hjälper användaren att förstå och hantera deras verksamhet.
Svara alltid på svenska, kort och koncist.
Var hjälpsam och ge konkreta förslag när det är möjligt.

KONTEXT OM VERKSAMHETEN:
${JSON.stringify(businessContext, null, 2)}`,
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
