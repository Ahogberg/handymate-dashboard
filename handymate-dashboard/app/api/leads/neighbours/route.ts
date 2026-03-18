import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/leads/neighbours — Lista grannkampanjer
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const status = request.nextUrl.searchParams.get('status')

  let query = supabase
    .from('leads_neighbour_campaigns')
    .select('*')
    .eq('business_id', business.business_id)
    .order('created_at', { ascending: false })

  if (status && status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Statistik
  const campaigns = data || []
  const totalSent = campaigns.filter((c: any) => c.status === 'sent').reduce((s: number, c: any) => s + (c.neighbour_count || 0), 0)
  const totalConverted = campaigns.reduce((s: number, c: any) => s + (c.converted_count || 0), 0)
  const totalSpent = campaigns.reduce((s: number, c: any) => s + Number(c.cost_sek || 0), 0)
  const totalRevenue = campaigns.reduce((s: number, c: any) => s + Number(c.revenue_generated || 0), 0)

  return NextResponse.json({
    campaigns,
    stats: { totalSent, totalConverted, totalSpent, totalRevenue },
  })
}

/**
 * POST /api/leads/neighbours — Skapa ny grannkampanj
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Logo required
  const supabase = getServerSupabase()
  const { data: config } = await supabase
    .from('business_config')
    .select('logo_url, business_name, contact_name, phone_number')
    .eq('business_id', business.business_id)
    .single()

  if (!config?.logo_url) {
    return NextResponse.json({ error: 'Logotyp krävs för att skicka brev. Ladda upp under Inställningar.' }, { status: 400 })
  }

  const body = await request.json()
  const { job_id, job_type, source_address, neighbour_count, letter_content } = body

  if (!source_address || !neighbour_count) {
    return NextResponse.json({ error: 'Adress och antal krävs' }, { status: 400 })
  }

  // Generera brev om inget skickades
  let content = letter_content
  if (!content) {
    const { generateNeighbourLetter } = await import('@/lib/leads/neighbour-campaign')
    content = await generateNeighbourLetter({
      businessName: config.business_name || '',
      contactName: config.contact_name || '',
      phone: config.phone_number || '',
      jobType: job_type || '',
      address: source_address,
    })
  }

  const { createNeighbourCampaign } = await import('@/lib/leads/neighbour-campaign')
  const campaign = await createNeighbourCampaign({
    businessId: business.business_id,
    jobId: job_id,
    jobType: job_type || '',
    sourceAddress: source_address,
    neighbourCount: neighbour_count,
    letterContent: content,
  })

  if (!campaign) {
    return NextResponse.json({ error: 'Kunde inte skapa kampanj' }, { status: 500 })
  }

  return NextResponse.json({ campaign: { id: campaign.id, letter_content: content } })
}
