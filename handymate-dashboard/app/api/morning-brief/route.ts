import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { generateMorningBrief } from '@/lib/matte/morning-brief'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const today = new Date().toISOString().split('T')[0]

  // Kolla cachad brief
  const { data: cached } = await supabase
    .from('business_preferences')
    .select('value')
    .eq('business_id', business.business_id)
    .eq('key', 'morning_brief_latest')
    .single()

  if (cached?.value) {
    try {
      const brief = JSON.parse(cached.value)
      if (brief.date === today) return NextResponse.json(brief)
    } catch { /* regenerera */ }
  }

  const brief = await generateMorningBrief(business.business_id)
  return NextResponse.json(brief)
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    // Cron: generera för alla aktiva businesses
    const supabase = getServerSupabase()
    const { data: businesses } = await supabase
      .from('business_config')
      .select('business_id')

    const results = await Promise.allSettled(
      (businesses || []).map(b => generateMorningBrief(b.business_id))
    )

    return NextResponse.json({
      generated: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
    })
  }

  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const brief = await generateMorningBrief(business.business_id)
  return NextResponse.json(brief)
}
