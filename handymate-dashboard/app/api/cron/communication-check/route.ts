import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { triggerAgentInternal, makeIdempotencyKey } from '@/lib/agent-trigger'

/**
 * GET /api/cron/communication-check - Daily communication check via AI agent.
 * Keeps: Finding active businesses.
 * Delegates: Customer communication evaluation to AI agent.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const today = new Date().toISOString().split('T')[0]

    // Find explicitly disabled businesses
    const { data: disabledSettings } = await supabase
      .from('communication_settings')
      .select('business_id')
      .eq('auto_enabled', false)

    const disabledBusinesses = new Set((disabledSettings || []).map((d: any) => d.business_id))

    // Get all active businesses (excluding disabled)
    const { data: allBusinesses } = await supabase
      .from('business_config')
      .select('business_id')
      .limit(100)

    const activeBusinessIds = (allBusinesses || [])
      .map((b: any) => b.business_id)
      .filter((id: string) => !disabledBusinesses.has(id))

    let agentTriggered = 0
    for (const businessId of activeBusinessIds) {
      const result = await triggerAgentInternal(
        businessId,
        'cron',
        {
          cron_type: 'communication_check',
          instruction: 'Kör daglig kommunikationskontroll. Identifiera kunder som inte kontaktats på länge, offerter utan svar, och bokningar som behöver bekräftelse. Skicka lämpliga uppföljningar via SMS eller email.',
        },
        makeIdempotencyKey('comm', businessId, today)
      )
      if (result.success) agentTriggered++
    }

    return NextResponse.json({
      success: true,
      businesses: activeBusinessIds.length,
      agent_triggered: agentTriggered,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
