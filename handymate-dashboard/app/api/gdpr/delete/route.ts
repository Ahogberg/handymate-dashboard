import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * POST /api/gdpr/delete - Begär radering av konto (GDPR Art. 17)
 * Body: { confirm: true, reason?: string }
 * 30-dagars grace period innan faktisk radering.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { confirm, reason } = await request.json()

    if (!confirm) {
      return NextResponse.json({ error: 'Du måste bekräfta raderingen med confirm: true' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Check if already requested
    const { data: config } = await supabase
      .from('business_config')
      .select('deletion_requested_at')
      .eq('business_id', business.business_id)
      .single()

    if (config?.deletion_requested_at) {
      return NextResponse.json({
        message: 'Radering redan begärd',
        deletion_requested_at: config.deletion_requested_at,
        deletion_date: new Date(new Date(config.deletion_requested_at).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
    }

    const now = new Date().toISOString()
    const deletionDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    await supabase
      .from('business_config')
      .update({
        deletion_requested_at: now,
        deletion_reason: reason || null,
      })
      .eq('business_id', business.business_id)

    return NextResponse.json({
      success: true,
      message: 'Radering begärd. Ditt konto och all data raderas efter 30 dagar. Kontakta oss om du ändrar dig.',
      deletion_requested_at: now,
      deletion_date: deletionDate,
    })
  } catch (error: any) {
    console.error('GDPR delete request error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
