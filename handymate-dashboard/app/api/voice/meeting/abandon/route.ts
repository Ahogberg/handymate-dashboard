import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * Mötesassistenten V2 — hantverkaren avbryter ett möte i förtid (t.ex.
 * felstart eller ångrat sig). Städar bort uppladdade ljudsegment ur
 * bucketen och märker jobbet som 'abandoned'. meeting_segment-raderna
 * behålls (audit) — bara storage-objekten tas bort.
 */

const BUCKET = 'meeting-audio'

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
      .select('id, status')
      .eq('id', jobId)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (jobError) {
      console.error('[meeting/abandon] job-lookup error:', jobError.message)
      return NextResponse.json({ error: 'Kunde inte slå upp mötet' }, { status: 500 })
    }
    if (!job) {
      return NextResponse.json({ error: 'Mötet hittades inte' }, { status: 404 })
    }
    if (job.status === 'ready') {
      return NextResponse.json(
        { error: 'Mötet är redan färdigbehandlat' },
        { status: 409 },
      )
    }

    // Städa bort ljudet från bucketen — best effort, blockerar inte
    // avbrytandet om storage-anropen fallerar.
    const prefix = `${business.business_id}/${jobId}`
    try {
      const { data: objects, error: listError } = await supabase.storage.from(BUCKET).list(prefix)
      if (listError) {
        console.error('[meeting/abandon] storage list misslyckades:', listError.message)
      } else if (objects && objects.length > 0) {
        const paths = objects.map(obj => `${prefix}/${obj.name}`)
        const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths)
        if (removeError) {
          console.error('[meeting/abandon] storage remove misslyckades:', removeError.message)
        }
      }
    } catch (storageEx: any) {
      console.error('[meeting/abandon] storage-städning kastade:', storageEx?.message || storageEx)
    }

    const { error: updateError } = await supabase
      .from('meeting_job')
      .update({ status: 'abandoned', updated_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('business_id', business.business_id)

    if (updateError) {
      console.error('[meeting/abandon] update error:', updateError.message)
      return NextResponse.json({ error: 'Mötet kunde inte avbrytas' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[meeting/abandon] error:', error)
    return NextResponse.json({ error: error.message || 'Något gick fel' }, { status: 500 })
  }
}
