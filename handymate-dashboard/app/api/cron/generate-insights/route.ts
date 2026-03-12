import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const INSIGHT_EMOJI: Record<string, string> = {
  revenue_forecast: '💰',
  churn_risk: '⚠️',
  upsell_opportunity: '📈',
  seasonal_tip: '🗓️',
  booking_gap: '📅',
  follow_up: '🔔',
  workload_warning: '⚡',
}
export const maxDuration = 60

/**
 * GET /api/cron/generate-insights
 * Runs every Sunday at 06:00 (vercel.json cron).
 * Generates 3-5 predictive insights per active business using Claude.
 */
export async function GET() {
  const supabase = getServerSupabase()

  try {
    // Get all active businesses (had activity in the last 30 days)
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

    const { data: businesses } = await supabase
      .from('business_config')
      .select('business_id, business_name, branch, service_area')
      .not('assigned_phone_number', 'is', null)

    if (!businesses?.length) {
      return NextResponse.json({ message: 'No businesses found', generated: 0 })
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    let totalGenerated = 0

    // Process up to 20 businesses per run to stay within timeout
    const batch = businesses.slice(0, 20)

    for (const biz of batch) {
      try {
        // Gather business stats for context
        const [bookingsRes, customersRes, quotesRes, invoicesRes] = await Promise.all([
          supabase.from('booking').select('status, created_at').eq('business_id', biz.business_id).gte('created_at', since),
          supabase.from('customer').select('created_at, customer_rating').eq('business_id', biz.business_id),
          supabase.from('quotes').select('status, total, created_at').eq('business_id', biz.business_id).gte('created_at', since),
          supabase.from('invoice').select('status, total, due_date').eq('business_id', biz.business_id).gte('created_at', since),
        ])

        const bookings = bookingsRes.data || []
        const customers = customersRes.data || []
        const quotes = quotesRes.data || []
        const invoices = invoicesRes.data || []

        const stats = {
          total_bookings: bookings.length,
          completed_bookings: bookings.filter((b: any) => b.status === 'completed').length,
          total_customers: customers.length,
          new_customers_30d: customers.filter((c: any) => new Date(c.created_at) >= new Date(since)).length,
          quotes_sent: quotes.filter((q: any) => q.status === 'sent' || q.status === 'opened').length,
          quotes_accepted: quotes.filter((q: any) => q.status === 'accepted').length,
          overdue_invoices: invoices.filter((i: any) => i.status === 'overdue').length,
          pending_invoices: invoices.filter((i: any) => i.status === 'sent' || i.status === 'draft').length,
          month: new Date().toLocaleString('sv-SE', { month: 'long' }),
        }

        const prompt = `Du är en affärsanalytiker för ${biz.business_name}, ett ${biz.branch || 'hantverks'}företag i ${biz.service_area || 'Sverige'}.

Baserat på dessa statistik för senaste 30 dagarna:
- Bokningar: ${stats.total_bookings} totalt, ${stats.completed_bookings} slutförda
- Kunder: ${stats.total_customers} totalt, ${stats.new_customers_30d} nya
- Offerter: ${stats.quotes_sent} skickade, ${stats.quotes_accepted} accepterade
- Fakturor: ${stats.overdue_invoices} förfallna, ${stats.pending_invoices} pågående
- Månad: ${stats.month}

Generera 3-4 konkreta, actionbara affärsinsikter. Returnera ENDAST ett JSON-array utan markdown:

[
  {
    "insight_type": "revenue_forecast|churn_risk|upsell_opportunity|seasonal_tip|booking_gap|follow_up|workload_warning",
    "title": "Kort titel (max 60 tecken)",
    "description": "Konkret beskrivning med specifik rekommendation (max 200 tecken)",
    "priority": "low|medium|high"
  }
]`

        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        })

        const text = response.content[0].type === 'text' ? response.content[0].text : ''
        let insights: Array<{ insight_type: string; title: string; description: string; priority: string }> = []

        try {
          const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          insights = JSON.parse(cleaned)
        } catch {
          console.warn(`[generate-insights] Failed to parse insights for ${biz.business_id}`)
          continue
        }

        // Delete old expired insights for this business
        await supabase
          .from('business_insights')
          .delete()
          .eq('business_id', biz.business_id)
          .lt('expires_at', new Date().toISOString())

        // Insert new insights
        const rows = insights.map(ins => ({
          id: `ins_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          business_id: biz.business_id,
          insight_type: ins.insight_type || 'other',
          title: ins.title || 'Insikt',
          description: ins.description || '',
          priority: ins.priority || 'medium',
          generated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        }))

        await supabase.from('business_insights').insert(rows)
        totalGenerated += rows.length

        // C4: Send top 2 high-priority insights as morning report push notification
        const topInsights = rows
          .filter(r => r.priority === 'high')
          .concat(rows.filter(r => r.priority === 'medium'))
          .slice(0, 2)

        if (topInsights.length > 0) {
          const lines = topInsights.map(ins => {
            const emoji = INSIGHT_EMOJI[ins.insight_type] || '💡'
            return `${emoji} ${ins.title} — ${ins.description}`
          })
          const pushBody = `Handymates rekommendationer:\n${lines.join('\n')}`

          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://handymate-dashboard.vercel.app'
          await fetch(`${appUrl}/api/push/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-secret': process.env.CRON_SECRET || '',
            },
            body: JSON.stringify({
              business_id: biz.business_id,
              title: 'Veckans affärsinsikter',
              body: pushBody,
              url: '/dashboard',
            }),
          }).catch(() => {/* non-critical */})
        }

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 500))
      } catch (bizErr) {
        console.error(`[generate-insights] Error for ${biz.business_id}:`, bizErr)
      }
    }

    console.log(`[generate-insights] Generated ${totalGenerated} insights for ${batch.length} businesses`)
    return NextResponse.json({ generated: totalGenerated, businesses: batch.length })
  } catch (error: any) {
    console.error('[generate-insights] Fatal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
