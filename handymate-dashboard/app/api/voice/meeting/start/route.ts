import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { verifyOwnership } from '@/lib/auth/verify-ownership'

/**
 * Mötesassistenten V2 (sql/v119_meeting_v2.sql) — start av ett 90-
 * minutersmöte. Skapar bara jobb-raden; själva ljudet börjar strömma
 * in segment för segment via /api/voice/meeting/segment.
 */

const RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const customerId = (body.customer_id as string) || null
    const bookingId = (body.booking_id as string) || null

    const supabase = getServerSupabase()

    // Cross-tenant-skydd: customer_id/booking_id kommer från klienten och
    // inserten sker med service role — verifiera ägarskap före användning.
    const ownership = await verifyOwnership(supabase, business.business_id, [
      { table: 'customer', idColumn: 'customer_id', idValue: customerId, label: 'kund' },
      { table: 'booking', idColumn: 'booking_id', idValue: bookingId, label: 'bokning' },
    ])
    if (!ownership.ok) {
      return NextResponse.json(
        { error: `Ogiltig koppling: ${ownership.missing.join(', ')}` },
        { status: 403 },
      )
    }

    const { data: job, error: insertError } = await supabase
      .from('meeting_job')
      .insert({
        business_id: business.business_id,
        customer_id: customerId,
        booking_id: bookingId,
        status: 'capturing',
      })
      .select('id')
      .single()

    if (insertError || !job) {
      console.error('[meeting/start] insert error:', insertError?.message)
      return NextResponse.json({ error: 'Mötet kunde inte startas' }, { status: 500 })
    }

    return NextResponse.json({ job_id: job.id })
  } catch (error: any) {
    console.error('[meeting/start] error:', error)
    return NextResponse.json({ error: error.message || 'Något gick fel' }, { status: 500 })
  }
}

/**
 * GET — återhämtningslista. Om appen kraschar eller stängs mitt i ett
 * möte kan klienten fråga efter öppna ("capturing") jobb från senaste
 * dygnet och erbjuda att återuppta eller avsluta dem.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const since = new Date(Date.now() - RECOVERY_WINDOW_MS).toISOString()

    const { data: jobs, error } = await supabase
      .from('meeting_job')
      .select('id, created_at, segment_count, customer_id')
      .eq('business_id', business.business_id)
      .eq('status', 'capturing')
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) {
      console.error('[meeting/start] GET error:', error.message)
      return NextResponse.json({ error: 'Kunde inte hämta öppna möten' }, { status: 500 })
    }

    return NextResponse.json({ open_jobs: jobs || [] })
  } catch (error: any) {
    console.error('[meeting/start] GET error:', error)
    return NextResponse.json({ error: error.message || 'Något gick fel' }, { status: 500 })
  }
}
