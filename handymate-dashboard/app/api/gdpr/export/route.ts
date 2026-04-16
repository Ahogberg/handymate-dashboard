import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/gdpr/export - Exportera all affärsdata (GDPR Art. 20)
 *
 * Default: personnummer redigeras till YYYYMMDD-**** för att minimera
 * känsligt läckage. Använd ?include_sensitive=true för fullständig export
 * (krävs för ROT/RUT-arkivering och Skatteverket-ansökningar).
 */
function redactPersonalNumber(pn: string | null | undefined): string | null {
  if (!pn) return pn || null
  const clean = pn.replace(/[^0-9]/g, '')
  if (clean.length < 8) return '****'
  // Behåll födelsedatum (YYYYMMDD eller YYMMDD), dölj sista 4
  const prefix = clean.length >= 10 ? clean.slice(0, clean.length - 4) : clean.slice(0, 6)
  return `${prefix}-****`
}

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const includeSensitive = request.nextUrl.searchParams.get('include_sensitive') === 'true'

    const supabase = getServerSupabase()
    const bid = business.business_id

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
      supabase.from('business_config').select('business_id, business_name, display_name, contact_name, contact_email, phone_number, branch, service_area, industry, subscription_plan, created_at').eq('business_id', bid).single(),
      supabase.from('customer').select('*').eq('business_id', bid),
      supabase.from('quotes').select('*').eq('business_id', bid),
      supabase.from('invoice').select('*').eq('business_id', bid),
      supabase.from('booking').select('*').eq('business_id', bid),
      supabase.from('time_entry').select('*').eq('business_id', bid),
      supabase.from('call_recording').select('recording_id, phone_from, phone_to, direction, duration_seconds, transcript_summary, sentiment, created_at').eq('business_id', bid),
      supabase.from('project').select('*').eq('business_id', bid),
    ])

    // Redigera personnummer om ej opt-in
    const customers = (customersRes.data || []).map((c: any) => {
      if (includeSensitive) return c
      return {
        ...c,
        personal_number: redactPersonalNumber(c.personal_number),
      }
    })

    const quotes = (quotesRes.data || []).map((q: any) => {
      if (includeSensitive) return q
      return {
        ...q,
        personnummer: redactPersonalNumber(q.personnummer),
      }
    })

    const invoices = (invoicesRes.data || []).map((i: any) => {
      if (includeSensitive) return i
      return {
        ...i,
        personnummer: redactPersonalNumber(i.personnummer),
      }
    })

    const exportData = {
      exported_at: new Date().toISOString(),
      sensitive_data_included: includeSensitive,
      notice: includeSensitive
        ? 'Denna export innehåller personnummer. Hantera enligt GDPR.'
        : 'Personnummer är redigerade. Använd ?include_sensitive=true för ROT/RUT-arkivering.',
      business: configRes.data,
      customers,
      quotes,
      invoices,
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
    return NextResponse.json({ error: 'Export misslyckades' }, { status: 500 })
  }
}
