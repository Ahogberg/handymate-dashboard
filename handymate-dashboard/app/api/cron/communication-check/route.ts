import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { runCommunicationAI } from '@/lib/communication-ai'

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (for Vercel Cron Jobs or manual trigger)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Get all active businesses with communication enabled
    const { data: settings } = await supabase
      .from('communication_settings')
      .select('business_id')
      .eq('auto_enabled', true)

    // Also include businesses without settings (defaults to enabled)
    const { data: allBusinesses } = await supabase
      .from('business_config')
      .select('business_id')
      .limit(100)

    const settingsBusinessIds = new Set((settings || []).map((s: any) => s.business_id))
    const disabledBusinesses = new Set<string>()

    // Find explicitly disabled businesses
    const { data: disabledSettings } = await supabase
      .from('communication_settings')
      .select('business_id')
      .eq('auto_enabled', false)

    for (const ds of disabledSettings || []) {
      disabledBusinesses.add(ds.business_id)
    }

    // Active = has settings with auto_enabled OR has no settings at all (defaults enabled)
    const activeBusinessIds = (allBusinesses || [])
      .map((b: any) => b.business_id)
      .filter((id: string) => !disabledBusinesses.has(id))

    const results: Array<{ businessId: string; evaluated: number; sent: number }> = []

    for (const businessId of activeBusinessIds) {
      try {
        const result = await runCommunicationAI(businessId)
        results.push({
          businessId,
          evaluated: result.evaluated,
          sent: result.sent,
        })
      } catch (err) {
        console.error(`Communication check failed for ${businessId}:`, err)
      }
    }

    return NextResponse.json({
      success: true,
      businesses: results.length,
      totalEvaluated: results.reduce((sum, r) => sum + r.evaluated, 0),
      totalSent: results.reduce((sum, r) => sum + r.sent, 0),
      details: results,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
