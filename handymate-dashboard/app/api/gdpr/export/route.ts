import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/gdpr/export - Exportera all affärsdata (GDPR Art. 20)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const bid = business.business_id

    // Fetch all business data in parallel
    const [
      configRes,
      customersRes,
      quotesRes,
      invoicesRes,
      bookingsRes,
      timeEntriesRes,
      recordingsRes,
      projectsRes,
    ] = await Promise.all([
      supabase.from('business_config').select('business_id, business_name, display_name, contact_name, contact_email, phone_number, branch, service_area, industry, billing_plan, created_at').eq('business_id', bid).single(),
      supabase.from('customer').select('*').eq('business_id', bid),
      supabase.from('quotes').select('*').eq('business_id', bid),
      supabase.from('invoice').select('*').eq('business_id', bid),
      supabase.from('booking').select('*').eq('business_id', bid),
      supabase.from('time_entry').select('*').eq('business_id', bid),
      supabase.from('call_recording').select('recording_id, phone_from, phone_to, direction, duration_seconds, transcript_summary, sentiment, created_at').eq('business_id', bid),
      supabase.from('project').select('*').eq('business_id', bid),
    ])

    const exportData = {
      exported_at: new Date().toISOString(),
      business: configRes.data,
      customers: customersRes.data || [],
      quotes: quotesRes.data || [],
      invoices: invoicesRes.data || [],
      bookings: bookingsRes.data || [],
      time_entries: timeEntriesRes.data || [],
      call_recordings: recordingsRes.data || [],
      projects: projectsRes.data || [],
    }

    const json = JSON.stringify(exportData, null, 2)

    return new NextResponse(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="handymate-export-${bid}-${new Date().toISOString().split('T')[0]}.json"`,
      },
    })
  } catch (error: any) {
    console.error('GDPR export error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
