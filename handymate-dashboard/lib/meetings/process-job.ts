/**
 * Mötesassistenten V2 — workern som transkriberar segment och sätter ihop
 * det färdiga mötestranskriptet (sql/v119_meeting_v2.sql).
 *
 * ═══ FLÖDET ═══
 *
 *   1. Claima jobbet (CAS: bara ett 'finalized'/'processing'-jobb som inte
 *      redan är claimat av en annan (nyligen startad) körning får plockas).
 *   2. Transkribera varje 'uploaded'-segment via Whisper verbose_json.
 *      Lyckas det: spara text + whisper_segments, radera ljudfilen direkt
 *      (RETENTIONSREGELN — ljudet är en transient buffert, bara texten
 *      består). Misslyckas det: räkna upp retry_count; två misslyckanden
 *      och segmentet ges upp som 'failed'.
 *   3. När alla segment är i ett slutgiltigt läge ('transcribed'/'failed'):
 *      sätt ihop transkriptet med den rena assembleTranscript, skapa en
 *      call_recording-rad och trigga samma analys som tidigare (V1:s nu
 *      raderade app/api/voice/site-visit/route.ts gjorde detta synkront;
 *      V2 gör det fire-and-forget från workern).
 *
 * Ärlighetsregeln ärvs från assembleTranscript: ett segment som aldrig
 * lyckades syns som ett explicit hål i transkriptet, aldrig en tyst lucka.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { assembleTranscript, type TranscriptSegment } from './assemble-transcript'
import { recordCost } from '@/lib/costs/record'
import { whisperCostOre } from '@/lib/costs/meter'

const BUCKET = 'meeting-audio'

// Efter denna gräns ges ett segment upp permanent (status='failed') i
// stället för att lämnas som 'uploaded' för nästa worker-tick.
const MAX_RETRY_COUNT = 2

// Ett 'finalized'/'processing'-jobb får bara claimas om claimed_at antingen
// saknas eller är äldre än detta — skyddar mot att två worker-körningar
// (cron-tick + fire-and-forget-kicken från /meeting/complete) processar
// samma jobb samtidigt.
const CLAIM_STALE_MINUTES = 10

// 'capturing'-jobb äldre än detta har klienten (app-krasch, stängd flik)
// aldrig avslutat — städas som övergivna av cleanupStaleMeetingJobs.
const STALE_CAPTURING_HOURS = 24

interface MeetingJobRow {
  id: string
  business_id: string
  customer_id: string | null
  booking_id: string | null
  total_duration_seconds: number
}

interface MeetingSegmentRow {
  id: string
  seq: number
  storage_path: string | null
  duration_seconds: number | null
  status: 'uploaded' | 'transcribed' | 'failed'
  transcript: string | null
  whisper_segments: Array<{ start: number; end: number; text: string }> | null
  error: string | null
  retry_count: number
}

const SEGMENT_SELECT =
  'id, seq, storage_path, duration_seconds, status, transcript, whisper_segments, error, retry_count'

/**
 * Processar ETT mötesjobb: claimar det, transkriberar väntande segment,
 * och — om alla segment är klara — sätter ihop transkriptet och startar
 * analysen.
 */
export async function processMeetingJob(
  supabase: SupabaseClient,
  jobId: string,
): Promise<{ processed: boolean; ready?: boolean; error?: string }> {
  if (!process.env.OPENAI_API_KEY) {
    return { processed: false, error: 'OPENAI_API_KEY saknas — transkribering är inte konfigurerad' }
  }

  // ── 1. CAS-claim ──────────────────────────────────────────────────────
  const staleThreshold = new Date(Date.now() - CLAIM_STALE_MINUTES * 60_000).toISOString()
  const nowIso = new Date().toISOString()

  const { data: claimed, error: claimError } = await supabase
    .from('meeting_job')
    .update({ status: 'processing', claimed_at: nowIso, updated_at: nowIso })
    .eq('id', jobId)
    .in('status', ['finalized', 'processing'])
    .or(`claimed_at.is.null,claimed_at.lt.${staleThreshold}`)
    .select('id, business_id, customer_id, booking_id, total_duration_seconds')
    .maybeSingle()

  if (claimError) {
    console.error('[meeting-worker] claim misslyckades:', jobId, claimError.message)
    return { processed: false, error: claimError.message }
  }
  if (!claimed) {
    // Jobbet finns inte, ägs redan av en annan (nyligen startad) körning,
    // eller är i ett status som inte ska processas. Inget av det är fel.
    return { processed: false }
  }

  const job = claimed as MeetingJobRow

  // ── 2. Transkribera väntande segment ────────────────────────────────
  const { data: segments, error: segError } = await supabase
    .from('meeting_segment')
    .select(SEGMENT_SELECT)
    .eq('job_id', jobId)
    .order('seq', { ascending: true })

  if (segError) {
    const msg = `Kunde inte läsa segment: ${segError.message}`
    await supabase
      .from('meeting_job')
      .update({ status: 'failed', error: msg, updated_at: new Date().toISOString() })
      .eq('id', jobId)
    return { processed: true, ready: false, error: msg }
  }

  const pending = ((segments || []) as MeetingSegmentRow[]).filter(s => s.status === 'uploaded')

  for (const segment of pending) {
    try {
      await transcribeSegment(supabase, job.business_id, segment)
    } catch (segEx: any) {
      // En enskild segmentkrasch ska inte döda hela jobbet — resten av
      // segmenten fortsätter behandlas, det här ges en ny chans nästa tick.
      console.error('[meeting-worker] segment kastade oväntat:', segment.id, segEx?.message || segEx)
      await bumpRetry(supabase, segment, segEx?.message || 'Okänt fel vid transkribering')
    }
  }

  // ── 3. Är hela jobbet klart? ─────────────────────────────────────────
  const { data: refreshed, error: refreshError } = await supabase
    .from('meeting_segment')
    .select(SEGMENT_SELECT)
    .eq('job_id', jobId)
    .order('seq', { ascending: true })

  if (refreshError) {
    return { processed: true, ready: false, error: refreshError.message }
  }

  const finalSegments = (refreshed || []) as MeetingSegmentRow[]
  const stillPending = finalSegments.some(s => s.status === 'uploaded')

  if (stillPending) {
    // Jobbet lämnas i 'processing' — nästa worker-tick (efter att
    // claimed_at blivit stale) tar över och försöker de kvarvarande
    // segmenten igen.
    return { processed: true, ready: false }
  }

  const transcribedCount = finalSegments.filter(s => s.status === 'transcribed').length

  if (transcribedCount === 0) {
    const msg = 'Ingen ljuddel kunde transkriberas'
    await supabase
      .from('meeting_job')
      .update({ status: 'failed', error: msg, updated_at: new Date().toISOString() })
      .eq('id', jobId)
    return { processed: true, ready: false, error: msg }
  }

  // ── 4. Sätt ihop transkriptet och skapa call_recording ──────────────
  const transcriptSegments: TranscriptSegment[] = finalSegments.map(s => ({
    seq: s.seq,
    status: s.status,
    transcript: s.transcript,
    durationSeconds: s.duration_seconds,
    whisperSegments: s.whisper_segments,
  }))
  const assembled = assembleTranscript(transcriptSegments)

  // KÄLLGRANSKAT FYND (Golden Path Fas 2, 2026-08-13): recording_id är
  // NOT NULL utan DEFAULT — se app/api/admin/demo-seed-meeting/route.ts
  // för hela fyndet (bekräftat: call_recording hade NOLL rader i
  // produktion, denna insert kraschade tyst-ish (fångas nedan, men
  // meeting_job markerades bara 'failed' — inget möte har någonsin
  // faktiskt sparats sedan V2 lanserades).
  const { data: recording, error: insertError } = await supabase
    .from('call_recording')
    .insert({
      recording_id: 'rec_' + Math.random().toString(36).substr(2, 9),
      business_id: job.business_id,
      customer_id: job.customer_id,
      booking_id: job.booking_id,
      source: 'site_visit',
      transcript: assembled.text,
      transcript_summary: null,
      transcribed_at: new Date().toISOString(),
      duration_seconds: job.total_duration_seconds,
      direction: null,
      phone_number: null,
      recording_url: null,
    })
    .select('recording_id')
    .single()

  if (insertError || !recording) {
    const msg = `Transkriptet kunde inte sparas: ${insertError?.message || 'okänt fel'}`
    console.error('[meeting-worker] call_recording-insert misslyckades:', jobId, insertError?.message)
    await supabase
      .from('meeting_job')
      .update({ status: 'failed', error: msg, updated_at: new Date().toISOString() })
      .eq('id', jobId)
    return { processed: true, ready: false, error: msg }
  }

  // Fire-and-forget analys — samma mönster som telefonivägen använder.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  fetch(`${appUrl}/api/voice/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.CRON_SECRET || '',
    },
    body: JSON.stringify({ recording_id: recording.recording_id }),
  }).catch(err => console.error('[meeting-worker] analys-trigger misslyckades:', err))

  await supabase
    .from('meeting_job')
    .update({
      status: 'ready',
      recording_id: recording.recording_id,
      error: assembled.missingSegments > 0 ? `${assembled.missingSegments} avsnitt saknas` : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  return { processed: true, ready: true }
}

/** Transkriberar ett enskilt segment via Whisper och uppdaterar raden. */
async function transcribeSegment(
  supabase: SupabaseClient,
  businessId: string,
  segment: MeetingSegmentRow,
): Promise<void> {
  if (!segment.storage_path) {
    await bumpRetry(supabase, segment, 'Segmentet saknar sökväg till ljudfilen')
    return
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(segment.storage_path)

  if (downloadError || !blob) {
    console.error('[meeting-worker] nedladdning misslyckades:', segment.id, downloadError?.message)
    await bumpRetry(supabase, segment, downloadError?.message || 'Nedladdning av ljudfilen misslyckades')
    return
  }

  const ext = segment.storage_path.toLowerCase().endsWith('.mp4') ? 'mp4' : 'webm'
  const whisperForm = new FormData()
  whisperForm.append('file', blob, `${segment.seq}.${ext}`)
  whisperForm.append('model', 'whisper-1')
  whisperForm.append('language', 'sv')
  whisperForm.append('response_format', 'verbose_json')

  let whisperRes: Response
  try {
    whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: whisperForm,
    })
  } catch (fetchErr: any) {
    console.error('[meeting-worker] Whisper-anropet kastade:', segment.id, fetchErr?.message)
    await bumpRetry(supabase, segment, fetchErr?.message || 'Whisper-anropet misslyckades')
    return
  }

  if (!whisperRes.ok) {
    const errText = await whisperRes.text().catch(() => '')
    console.error('[meeting-worker] Whisper-fel:', segment.id, whisperRes.status, errText)
    await bumpRetry(supabase, segment, `Whisper ${whisperRes.status}: ${errText.slice(0, 200)}`)
    return
  }

  const result = await whisperRes.json().catch(() => null)
  const text: string = typeof result?.text === 'string' ? result.text : ''
  const whisperSegments = Array.isArray(result?.segments)
    ? result.segments.map((s: { start: number; end: number; text: string }) => ({
        start: s.start,
        end: s.end,
        text: s.text,
      }))
    : null

  const { error: updateError } = await supabase
    .from('meeting_segment')
    .update({
      status: 'transcribed',
      transcript: text,
      whisper_segments: whisperSegments,
      error: null,
    })
    .eq('id', segment.id)

  if (updateError) {
    // Transkriberingen lyckades men kunde inte skrivas — behandla som ett
    // misslyckande så segmentet får en ny chans i stället för att tyst
    // fastna i 'uploaded' utan att någon retry räknas.
    console.error('[meeting-worker] segment-uppdatering misslyckades:', segment.id, updateError.message)
    await bumpRetry(supabase, segment, `DB-uppdatering misslyckades: ${updateError.message}`)
    return
  }

  // Whisper-kostnaden bokförs — samma mätare som telefoni-/platsbesöksvägen.
  const durationSeconds = segment.duration_seconds || 0
  if (durationSeconds > 0) {
    await recordCost({
      supabase,
      businessId,
      resource: 'whisper',
      units: durationSeconds,
      costOre: whisperCostOre(durationSeconds),
      refType: 'meeting_segment',
      refId: segment.id,
    })
  }

  // RETENTIONSREGELN: ljudet är en transient buffert — bara texten består.
  // Best effort: en misslyckad radering blockerar aldrig transkriberingen,
  // den loggas bara.
  const { error: removeError } = await supabase.storage.from(BUCKET).remove([segment.storage_path])
  if (removeError) {
    console.warn('[meeting-worker] radering av ljudfil misslyckades (loggas bara):', segment.id, removeError.message)
  }
}

/** Räknar upp retry_count; ger upp permanent (status='failed') vid taket. */
async function bumpRetry(
  supabase: SupabaseClient,
  segment: MeetingSegmentRow,
  errorMessage: string,
): Promise<void> {
  const nextRetryCount = (segment.retry_count || 0) + 1
  const giveUp = nextRetryCount >= MAX_RETRY_COUNT

  const { error } = await supabase
    .from('meeting_segment')
    .update({
      retry_count: nextRetryCount,
      error: errorMessage,
      ...(giveUp ? { status: 'failed' as const } : {}),
    })
    .eq('id', segment.id)

  if (error) {
    console.error('[meeting-worker] retry-uppdatering misslyckades:', segment.id, error.message)
  }
}

/**
 * Hämtar väntande mötesjobb (max 10 per körning) och processar dem i tur
 * och ordning. Anropas av cronen (app/api/cron/meeting-worker/route.ts).
 */
export async function processPendingMeetingJobs(
  supabase: SupabaseClient,
): Promise<{ jobs: number; ready: number; errors: string[] }> {
  const { data: jobs, error } = await supabase
    .from('meeting_job')
    .select('id')
    .in('status', ['finalized', 'processing'])
    .order('created_at', { ascending: true })
    .limit(10)

  if (error) {
    console.error('[meeting-worker] jobb-lista misslyckades:', error.message)
    return { jobs: 0, ready: 0, errors: [error.message] }
  }

  const jobList = jobs || []
  let ready = 0
  const errors: string[] = []

  for (const j of jobList) {
    const result = await processMeetingJob(supabase, j.id)
    if (result.ready) ready++
    if (result.error) errors.push(`${j.id}: ${result.error}`)
  }

  return { jobs: jobList.length, ready, errors }
}

/**
 * Städar bort mötesjobb som klienten aldrig avslutade (app-krasch, stängd
 * flik) — 'capturing' i mer än 24 timmar. Raderar uppladdat ljud ur
 * bucketen (meeting_segment-raderna behålls, samma princip som
 * app/api/voice/meeting/abandon/route.ts) och märker jobbet 'abandoned'.
 *
 * Returnerar antal städade jobb.
 */
export async function cleanupStaleMeetingJobs(supabase: SupabaseClient): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_CAPTURING_HOURS * 60 * 60 * 1000).toISOString()

  const { data: staleJobs, error } = await supabase
    .from('meeting_job')
    .select('id, business_id')
    .eq('status', 'capturing')
    .lt('updated_at', staleBefore)

  if (error) {
    console.error('[meeting-worker] stale-lista misslyckades:', error.message)
    return 0
  }

  let cleaned = 0

  for (const job of (staleJobs || []) as Array<{ id: string; business_id: string }>) {
    const prefix = `${job.business_id}/${job.id}`
    try {
      const { data: objects, error: listError } = await supabase.storage.from(BUCKET).list(prefix)
      if (listError) {
        console.error('[meeting-worker] storage-list misslyckades (stale):', job.id, listError.message)
      } else if (objects && objects.length > 0) {
        const paths = objects.map(obj => `${prefix}/${obj.name}`)
        const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths)
        if (removeError) {
          console.error('[meeting-worker] storage-remove misslyckades (stale):', job.id, removeError.message)
        }
      }
    } catch (storageEx: any) {
      console.error('[meeting-worker] storage-städning kastade (stale):', job.id, storageEx?.message || storageEx)
    }

    const { error: updateError } = await supabase
      .from('meeting_job')
      .update({ status: 'abandoned', updated_at: new Date().toISOString() })
      .eq('id', job.id)

    if (updateError) {
      console.error('[meeting-worker] stale-jobb kunde inte märkas abandoned:', job.id, updateError.message)
      continue
    }
    cleaned++
  }

  return cleaned
}
