import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, checkFeatureAccess } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

interface ConversationRow {
  id: string
  session_id: string
  visitor_name: string | null
  visitor_phone: string | null
  visitor_email: string | null
  messages: { role: string; content: string }[]
  message_count: number
  lead_created: boolean
  deal_id: string | null
  created_at: string
  updated_at: string
}

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const featureCheck = checkFeatureAccess(business, 'website_widget')
    if (!featureCheck.allowed) {
      return NextResponse.json({ error: featureCheck.error, feature: featureCheck.feature, required_plan: featureCheck.required_plan }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const period = request.nextUrl.searchParams.get('period') || '30d'

    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
    const since = new Date()
    since.setDate(since.getDate() - days)

    const { data: conversations } = await supabase
      .from('widget_conversation')
      .select('id, session_id, visitor_name, visitor_phone, visitor_email, messages, message_count, lead_created, deal_id, created_at, updated_at')
      .eq('business_id', business.business_id)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })

    const allConvos = (conversations as ConversationRow[] || [])

    // Basic stats
    const totalConversations = allConvos.length
    const totalMessages = allConvos.reduce((sum: number, c: ConversationRow) => sum + (c.message_count || 0), 0)
    const leadsCreated = allConvos.filter((c: ConversationRow) => c.lead_created).length
    const conversionRate = totalConversations > 0 ? Math.round((leadsCreated / totalConversations) * 100) : 0
    const avgMessages = totalConversations > 0 ? Math.round(totalMessages / totalConversations * 10) / 10 : 0

    // Contact collection rate
    const withContact = allConvos.filter((c: ConversationRow) => c.visitor_name || c.visitor_phone || c.visitor_email).length
    const contactRate = totalConversations > 0 ? Math.round((withContact / totalConversations) * 100) : 0

    // Daily trend
    const dailyMap = new Map<string, { conversations: number; leads: number }>()
    for (const c of allConvos) {
      const day = c.created_at.substring(0, 10)
      const entry = dailyMap.get(day) || { conversations: 0, leads: 0 }
      entry.conversations++
      if (c.lead_created) entry.leads++
      dailyMap.set(day, entry)
    }
    const dailyTrend = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Common first messages (what do visitors ask about?)
    const questionMap = new Map<string, number>()
    for (const c of allConvos) {
      const msgs = c.messages || []
      const firstUserMsg = msgs.find((m: { role: string; content: string }) => m.role === 'user')
      if (firstUserMsg) {
        // Normalize: lowercase, trim
        const normalized = firstUserMsg.content.toLowerCase().trim().substring(0, 80)
        questionMap.set(normalized, (questionMap.get(normalized) || 0) + 1)
      }
    }
    const commonQuestions = Array.from(questionMap.entries())
      .map(([question, count]) => ({ question, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // Recent conversations (last 10)
    const recentConversations = allConvos.slice(0, 10).map((c: ConversationRow) => ({
      id: c.id,
      visitor_name: c.visitor_name,
      visitor_phone: c.visitor_phone,
      visitor_email: c.visitor_email,
      message_count: c.message_count,
      lead_created: c.lead_created,
      created_at: c.created_at,
      first_message: (c.messages || []).find((m: { role: string; content: string }) => m.role === 'user')?.content?.substring(0, 100) || '',
    }))

    return NextResponse.json({
      period,
      total_conversations: totalConversations,
      total_messages: totalMessages,
      leads_created: leadsCreated,
      conversion_rate: conversionRate,
      avg_messages_per_conversation: avgMessages,
      contact_collection_rate: contactRate,
      daily_trend: dailyTrend,
      common_questions: commonQuestions,
      recent_conversations: recentConversations,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
