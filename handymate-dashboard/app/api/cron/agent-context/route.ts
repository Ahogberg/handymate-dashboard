import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { generateAgentContext } from '@/lib/agent/context-engine'
import { sendMorningReport } from '@/lib/agent/morning-report'

export const maxDuration = 60

/**
 * GET/POST /api/cron/agent-context
 * Nattlig körning — genererar agent_context + morgonrapport för alla aktiva företag.
 * Körs 05:00 UTC = 07:00 Stockholm.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runAgentContext()
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runAgentContext()
}

async function runAgentContext() {
  const supabase = getServerSupabase()

  // Hämta alla aktiva företag
  const { data: businesses, error } = await supabase
    .from('business_config')
    .select('business_id')

  if (error || !businesses) {
    console.error('[AgentContext Cron] Failed to fetch businesses:', error)
    return NextResponse.json({ error: 'Failed to fetch businesses' }, { status: 500 })
  }

  const results: Array<{
    business_id: string
    context: { success: boolean; tokens_used?: number; error?: string }
    report: { success: boolean; error?: string }
  }> = []

  for (const biz of businesses) {
    // Generera context
    const contextResult = await generateAgentContext(biz.business_id)

    // Skicka morgonrapport (bara om context lyckades)
    let reportResult: { success: boolean; error?: string } = { success: false, error: 'Skipped — context failed' }
    if (contextResult.success) {
      reportResult = await sendMorningReport(biz.business_id)
    }

    results.push({
      business_id: biz.business_id,
      context: contextResult,
      report: reportResult,
    })

    console.log(
      `[AgentContext Cron] ${biz.business_id}: context=${contextResult.success}, report=${reportResult.success}`
    )
  }

  const succeeded = results.filter(r => r.context.success).length
  const totalTokens = results.reduce((sum, r) => sum + (r.context.tokens_used || 0), 0)

  return NextResponse.json({
    total: businesses.length,
    succeeded,
    failed: businesses.length - succeeded,
    total_tokens: totalTokens,
    results,
  })
}
