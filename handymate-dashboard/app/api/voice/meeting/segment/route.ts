import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { ensureBucket } from '@/lib/storage'

/**
 * Mötesassistenten V2 — tar emot ETT komplett 5-minuters ljudsegment i
 * taget och lägger det i den privata bucketen `meeting-audio`. Workern
 * (/api/cron/meeting-worker) plockar upp och transkriberar segmenten
 * separat efter att mötet finaliserats (eller löpande — se worker-koden).
 *
 * Klienten kan lägga på och retrya samma (job_id, seq) — se idempotens
 * nedan — så ett tappat svar på en lyckad upload aldrig dubbelladdar.
 */

// Segment-uppladdning över mobilnät kan dra ut på tiden — 60s räcker
// gott för en 5-minutersfil men skyddar mot att en hängande request
// blockerar länge över plattformens default-timeout.
export const maxDuration = 60

const BUCKET = 'meeting-audio'
const MAX_BYTES = 25 * 1024 * 1024 // Whispers gräns
const MAX_TOTAL_SECONDS = 90 * 60 + 60 // 90 min + 60s slack mellan klient/server-klocka

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch (parseErr: any) {
      console.error('[meeting/segment] FormData-parse misslyckades:', parseErr?.message || parseErr)
      return NextResponse.json({ error: 'Kunde inte läsa uppladdningen' }, { status: 400 })
    }

    const jobId = (formData.get('job_id') as string) || ''
    const seqRaw = formData.get('seq')
    const durationRaw = formData.get('duration_seconds')
    const file = formData.get('audio') as File | null

    const seq = Number(seqRaw)
    const durationSeconds = Number(durationRaw)

    if (!jobId) {
      return NextResponse.json({ error: 'job_id saknas' }, { status: 400 })
    }
    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'Ingen ljudfil mottagen' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Ljudsegmentet är för stort' }, { status: 413 })
    }
    if (!Number.isInteger(seq) || seq < 0) {
      return NextResponse.json({ error: 'Ogiltigt segmentnummer' }, { status: 400 })
    }
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      return NextResponse.json({ error: 'Ogiltig segmentlängd' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    const { data: job, error: jobError } = await supabase
      .from('meeting_job')
      .select('id, business_id, status, segment_count, total_duration_seconds')
      .eq('id', jobId)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (jobError) {
      console.error('[meeting/segment] job-lookup error:', jobError.message)
      return NextResponse.json({ error: 'Kunde inte slå upp mötet' }, { status: 500 })
    }
    if (!job) {
      return NextResponse.json({ error: 'Mötet hittades inte' }, { status: 404 })
    }
    if (job.status !== 'capturing') {
      return NextResponse.json({ error: 'Mötet är redan avslutat' }, { status: 409 })
    }

    if (job.total_duration_seconds + durationSeconds > MAX_TOTAL_SECONDS) {
      return NextResponse.json({ error: 'Mötet överskrider 90 minuter' }, { status: 413 })
    }

    // Idempotens: klienten kan retrya en upload vars svar tappades bort.
    // Om segmentet redan finns i databasen är det redan räknat — svara
    // OK utan att röra storage eller job-räknarna igen.
    const { data: existingSegment, error: existingError } = await supabase
      .from('meeting_segment')
      .select('id')
      .eq('job_id', jobId)
      .eq('seq', seq)
      .maybeSingle()

    if (existingError) {
      console.error('[meeting/segment] existing-lookup error:', existingError.message)
      return NextResponse.json({ error: 'Kunde inte kontrollera segmentet' }, { status: 500 })
    }
    if (existingSegment) {
      return NextResponse.json({ success: true, already_uploaded: true })
    }

    await ensureBucket(supabase, BUCKET, { public: false })

    const contentType = file.type || 'audio/webm'
    const ext = contentType.includes('mp4') ? 'mp4' : 'webm'
    const storagePath = `${business.business_id}/${jobId}/${seq}.${ext}`

    let buffer: Buffer
    try {
      buffer = Buffer.from(await file.arrayBuffer())
    } catch (bufErr: any) {
      console.error('[meeting/segment] arrayBuffer misslyckades:', bufErr?.message || bufErr)
      return NextResponse.json({ error: 'Kunde inte läsa ljudinnehållet' }, { status: 500 })
    }

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType, upsert: false })

    if (uploadError) {
      console.error('[meeting/segment] Storage upload misslyckades:', {
        message: uploadError.message,
        path: storagePath,
      })
      return NextResponse.json(
        { error: `Uppladdningen av ljudsegmentet misslyckades: ${uploadError.message}` },
        { status: 500 },
      )
    }

    const { error: insertError } = await supabase.from('meeting_segment').insert({
      job_id: jobId,
      seq,
      storage_path: storagePath,
      duration_seconds: durationSeconds,
      status: 'uploaded',
    })

    if (insertError) {
      // Unique violation (job_id, seq) — en samtidig retry hann före oss.
      // Segmentet finns redan registrerat, så vår egen upload är en
      // duplett: städa bort den och svara som idempotent träff.
      if (insertError.code === '23505') {
        await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {})
        return NextResponse.json({ success: true, already_uploaded: true })
      }

      console.error('[meeting/segment] DB insert misslyckades:', insertError.message)
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {})
      return NextResponse.json({ error: 'Segmentet kunde inte sparas' }, { status: 500 })
    }

    // Read-modify-write av räknarna — säkert här eftersom klienten laddar
    // upp segment sekventiellt (en skrivare per jobb).
    const { error: updateError } = await supabase
      .from('meeting_job')
      .update({
        segment_count: job.segment_count + 1,
        total_duration_seconds: job.total_duration_seconds + durationSeconds,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    if (updateError) {
      // Segmentet är redan sparat — logga men fallera inte hela requesten;
      // workern räknar ändå ihop segmenten från meeting_segment vid behov.
      console.error('[meeting/segment] job-uppdatering misslyckades:', updateError.message)
    }

    return NextResponse.json({ success: true, seq })
  } catch (error: any) {
    console.error('[meeting/segment] error:', error)
    return NextResponse.json({ error: error.message || 'Något gick fel' }, { status: 500 })
  }
}
