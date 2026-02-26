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

  // Fetch active time entries (who is checked in)
  const { data: activeTimers } = await supabase
    .from('time_entry')
    .select('time_entry_id, check_in_time, work_category, customer:customer_id(name, customer_id)')
    .eq('business_id', businessId)
    .is('end_time', null)
    .not('check_in_time', 'is', null)
    .limit(10)

  // Fetch active projects
  const { data: activeProjects } = await supabase
    .from('project')
    .select('project_id, name, status, budget_hours, ai_health_score')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .limit(5)

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
    activeTimers: (activeTimers || []).map((t: any) => ({
      customer: t.customer?.name || 'Okänd',
      since: t.check_in_time,
      category: t.work_category,
    })),
    activeProjects: (activeProjects || []).map((p: any) => ({
      name: p.name,
      healthScore: p.ai_health_score,
    })),
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
    const { question, mode, context: clientContext } = await request.json()

    // Fetch real business context from the database
    const businessContext = await getBusinessContext(authBusiness.business_id, authBusiness.business_name)

    const isJobbuddyMode = mode === 'jobbuddy'

    const systemPrompt = isJobbuddyMode
      ? `Du är "Jobbkompisen" — en AI-assistent för hantverkare i fält.
Du hjälper med att snabbt utföra administrativa uppgifter: tidrapporter, fakturor, offerter, projektuppdateringar.
Svara alltid på svenska, kort och handlingsorienterat.

VIKTIG: Om användaren ber om en åtgärd (skapa faktura, logga tid, etc), inkludera ett "actions"-fält i ditt svar med föreslagna åtgärder.

Varje action ska ha: id (unikt), type (log_time|create_invoice|create_quote|update_project|send_sms|order_material), label (kort), description (detalj), data (relevanta parametrar).

${clientContext?.activeTimer ? `PÅGÅENDE JOBB: Användaren jobbar just nu hos ${clientContext.activeTimer.customer || 'okänd kund'} sedan ${clientContext.activeTimer.duration}. Kategori: ${clientContext.activeTimer.category || 'arbete'}.` : ''}

KONTEXT:
${JSON.stringify(businessContext, null, 2)}`
      : `Du är en AI-assistent för Handymate, ett bokningssystem för hantverkare.
Du hjälper användaren att förstå och hantera deras verksamhet.
Svara alltid på svenska, kort och koncist.
Var hjälpsam och ge konkreta förslag när det är möjligt.

KONTEXT OM VERKSAMHETEN:
${JSON.stringify(businessContext, null, 2)}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: isJobbuddyMode ? 800 : 400,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: isJobbuddyMode
            ? `${question}\n\nSvara med JSON-format: { "answer": "ditt svar", "actions": [...] } där actions är en array av åtgärder du föreslår. Om inga åtgärder behövs, returnera tom array.`
            : question
        }
      ],
    })

    const rawText = response.content[0].type === 'text'
      ? response.content[0].text
      : ''

    // Try to parse structured response for jobbuddy mode
    if (isJobbuddyMode && rawText) {
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          return NextResponse.json({
            answer: parsed.answer || rawText,
            actions: (parsed.actions || []).map((a: any, i: number) => ({
              id: a.id || `action-${Date.now()}-${i}`,
              type: a.type || 'unknown',
              label: a.label || a.type,
              description: a.description || '',
              data: a.data || {},
              status: 'pending',
            })),
          })
        }
      } catch {
        // JSON parsing failed, return as plain text
      }
    }

    return NextResponse.json({
      answer: rawText || 'Kunde inte generera svar.',
      actions: [],
    })
  } catch (error) {
    console.error('AI Copilot error:', error)
    return NextResponse.json(
      { answer: 'Ett fel uppstod. Försök igen.', actions: [] },
      { status: 500 }
    )
  }
}
