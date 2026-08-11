import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * Mötesassistenten V2 — klienten kallar denna när alla 5-minuterssegment
 * är uppladdade. Flyttar jobbet från 'capturing' till 'finalized' så att
 * workern (/api/cron/meeting-worker) får plocka upp det. Cron-jobbet är
 * säkerhetsnätet (var 5:e minut) — vi puttar workern direkt här också så
 * korta möten inte behöver vänta på nästa cron-tick.
 */

const ALREADY_PROCESSED_STATUSES = new Set(['finalized', 'processing', 'ready'])

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const jobId = (body.job_id as string) || ''
    if (!jobId) {
      return NextResponse.json({ error: 'job_id saknas' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    const { data: job, error: jobError } = await supabase
      .from('meeting_job')
      .select('id, status, segment_count')
      .eq('id', jobId)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (jobError) {
      console.error('[meeting/complete] job-lookup error:', jobError.message)
      return NextResponse.json({ error: 'Kunde inte slå upp mötet' }, { status: 500 })
    }
    if (!job) {
      return NextResponse.json({ error: 'Mötet hittades inte' }, { status: 404 })
    }

    // CAS: bara en övergång capturing → finalized får lyckas. Skyddar mot
    // dubbla klientanrop (t.ex. dubbeltryck) som annars skulle trigga
    // workern flera gånger eller skriva över en redan pågående bearbetning.
    const { data: updated, error: updateError } = await supabase
      .from('meeting_job')
      .update({ status: 'finalized', updated_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('business_id', business.business_id)
      .eq('status', 'capturing')
      .select('id')
      .maybeSingle()

    if (updateError) {
      console.error('[meeting/complete] update error:', updateError.message)
      return NextResponse.json({ error: 'Mötet kunde inte avslutas' }, { status: 500 })
    }

    if (!updated) {
      if (ALREADY_PROCESSED_STATUSES.has(job.status)) {
        return NextResponse.json({ success: true, already: true })
      }
      return NextResponse.json(
        { error: 'Mötet är redan avslutat eller under bearbetning' },
        { status: 409 },
      )
    }

    if (job.segment_count <= 0) {
      await supabase
        .from('meeting_job')
        .update({ status: 'abandoned', updated_at: new Date().toISOString() })
        .eq('id', jobId)
      return NextResponse.json({ error: 'Inga ljuddelar laddades upp' }, { status: 422 })
    }

    // Fire-and-forget: putta workern direkt så korta möten processas
    // snabbt. */5-cronen är säkerhetsnätet om detta anrop faller bort.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    fetch(`${appUrl}/api/cron/meeting-worker`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET || ''}` },
    }).catch(err => console.error('[meeting/complete] worker-kick misslyckades:', err))

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[meeting/complete] error:', error)
    return NextResponse.json({ error: error.message || 'Något gick fel' }, { status: 500 })
  }
}
