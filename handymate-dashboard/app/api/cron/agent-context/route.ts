import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { generateAgentContext, updateBusinessPreferences } from '@/lib/agent/context-engine'
import { sendMorningReport } from '@/lib/agent/morning-report'
import { updatePricingIntelligence } from '@/lib/agent/pricing-engine'
import { analyzePriceAdjustments } from '@/lib/agent/price-analysis'
import { calculateCustomerLTV } from '@/lib/customer-ltv'
import { checkWarrantyFollowups } from '@/lib/warranty-followup'

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
    preferences: { success: boolean; error?: string }
    pricing: { success: boolean; jobTypesAnalyzed?: number; error?: string }
    priceAnalysis: { success: boolean; suggestions?: number; error?: string }
    ltv: { success: boolean; updated?: number; reactivations?: number; error?: string }
    warranty: { success: boolean; followupsCreated?: number; error?: string }
  }> = []

  for (const biz of businesses) {
    // Generera context
    const contextResult = await generateAgentContext(biz.business_id)

    // Skicka morgonrapport (bara om context lyckades)
    let reportResult: { success: boolean; error?: string } = { success: false, error: 'Skipped — context failed' }
    if (contextResult.success) {
      reportResult = await sendMorningReport(biz.business_id)
    }

    // Uppdatera inlärda preferenser
    let preferencesResult: { success: boolean; error?: string } = { success: false, error: 'Skipped' }
    try {
      preferencesResult = await updateBusinessPreferences(biz.business_id)
    } catch (err: any) {
      preferencesResult = { success: false, error: err.message }
    }

    // Uppdatera prissättningsintelligens
    let pricingResult: { success: boolean; jobTypesAnalyzed?: number; error?: string } = { success: false, error: 'Skipped' }
    try {
      pricingResult = await updatePricingIntelligence(biz.business_id)
    } catch (err: any) {
      pricingResult = { success: false, error: err.message }
    }

    // Analysera prisjusteringar (estimerad vs faktisk tid)
    let priceAnalysisResult: { success: boolean; suggestions?: number; error?: string } = { success: false, error: 'Skipped' }
    try {
      const res = await analyzePriceAdjustments(biz.business_id)
      priceAnalysisResult = { success: res.success, suggestions: res.suggestions, error: res.error }
    } catch (err: any) {
      priceAnalysisResult = { success: false, error: err.message }
    }

    // Beräkna kundlivstidsvärde
    let ltvResult: { success: boolean; updated?: number; reactivations?: number; error?: string } = { success: false, error: 'Skipped' }
    try {
      ltvResult = await calculateCustomerLTV(biz.business_id)
    } catch (err: any) {
      ltvResult = { success: false, error: err.message }
    }

    // Garantiuppföljning (12 mån efter avslutat jobb)
    let warrantyResult: { success: boolean; followupsCreated?: number; error?: string } = { success: false, error: 'Skipped' }
    try {
      warrantyResult = await checkWarrantyFollowups(biz.business_id)
    } catch (err: any) {
      warrantyResult = { success: false, error: err.message }
    }

    results.push({
      business_id: biz.business_id,
      context: contextResult,
      report: reportResult,
      preferences: preferencesResult,
      pricing: pricingResult,
      priceAnalysis: priceAnalysisResult,
      ltv: ltvResult,
      warranty: warrantyResult,
    })

    console.log(
      `[AgentContext Cron] ${biz.business_id}: context=${contextResult.success}, report=${reportResult.success}, pricing=${pricingResult.success}, ltv=${ltvResult.success}(${ltvResult.updated || 0} updated, ${ltvResult.reactivations || 0} reactivations), warranty=${warrantyResult.success}(${warrantyResult.followupsCreated || 0} created)`
    )
  }

  const succeeded = results.filter(r => r.context.success).length
  const totalTokens = results.reduce((sum, r) => sum + (r.context.tokens_used || 0), 0)

  // Process partner commissions
  let commissionResult = { processed: 0, commissioned: 0, completed: 0, errors: [] as string[] }
  try {
    const { processMonthlyCommissions } = await import('@/lib/partners/commission')
    commissionResult = await processMonthlyCommissions()
    console.log(`[AgentContext Cron] Commissions: ${commissionResult.commissioned} processed, ${commissionResult.completed} completed`)
  } catch (err: any) {
    console.error('[AgentContext Cron] Commission processing failed:', err.message)
  }

  return NextResponse.json({
    total: businesses.length,
    succeeded,
    failed: businesses.length - succeeded,
    total_tokens: totalTokens,
    commissions: commissionResult,
    results,
  })
}
