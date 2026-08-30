import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { verifyElksSignature } from '@/lib/elks-signature'
import { callRecordingId } from '@/lib/voice/call-processing'

export const maxDuration = 300

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

/**
 * Webhook från 46elks när en inspelning är klar
 * 46elks skickar: callid, recordingid, duration, wav (URL till inspelningen)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerSupabase()

    // ═══ SIGNATUREN SAKNADES HELT (2026-08-08) ═══
    //
    // Routen litade på en overifierad payload för både tenantuppslag och
    // inspelnings-URL. En förfalskad POST kunde alltså lägga in en
    // inspelningsrad i valfritt företag och därmed starta kedjan
    // recording → transcribe → Lisa-agentkörning utifrån. Samma HMAC som
    // voice/incoming och sms/incoming redan använde.
    const rawBody = await request.text()
    if (process.env.ELKS_SKIP_SIGNATURE !== 'true') {
      const req = new NextRequest(request.url, { method: 'POST', headers: request.headers, body: rawBody })
      if (!verifyElksSignature(req, rawBody)) {
        console.error('[voice/recording] Ogiltig 46elks-signatur, avvisar webhook')
        return new NextResponse('Unauthorized', { status: 401 })
      }
    }

    // Body:n är redan läst för signaturen — parsa samma sträng i stället för
    // att anropa formData() (som skulle läsa en tömd ström).
    const formData = new URLSearchParams(rawBody)

    const callId = formData.get('callid') as string
    const recordingId = formData.get('recordingid') as string
    const duration = parseInt(formData.get('duration') as string) || 0
    const recordingUrl = formData.get('wav') as string
    const from = formData.get('from') as string
    const to = formData.get('to') as string
    const direction = formData.get('direction') as string

    if (!recordingUrl || !callId) {
      console.error('No recording URL received')
      return NextResponse.json({ error: 'No recording URL' }, { status: 400 })
    }

    // Hitta tidigare inspelning/samtal baserat på elks_recording_id
    const { data: existingRecording, error: existingError } = await supabase
      .from('call_recording')
      .select('*')
      .eq('elks_recording_id', callId)
      .maybeSingle()
    if (existingError) throw existingError
    // Provider retry must never resurrect data that was already purged.
    if (existingRecording?.raw_deleted_at) return NextResponse.json({ success: true, ignored: 'expired' })

    // Om vi inte hittar samtalet, försök hitta business via telefonnummer
    let businessId = existingRecording?.business_id
    let customerId = existingRecording?.customer_id

    if (!businessId) {
      // Försök hitta business baserat på to-nummer (inkommande samtal)
      const phoneToCheck = direction === 'outbound' ? from : to
      const { data: business } = await supabase
        .from('business_config')
        .select('business_id')
        .eq('assigned_phone_number', phoneToCheck)
        .single()

      businessId = business?.business_id
    }

    if (!businessId) {
      console.error('Could not determine business for recording')
      return NextResponse.json({ error: 'Could not determine business' }, { status: 400 })
    }

    let recording
    let error

    // Om vi har en befintlig inspelning, uppdatera den. Annars skapa ny.
    if (existingRecording?.transcript) {
      // Do not put an audio pointer back after transcription/retention.
      recording = { recording_id: existingRecording.recording_id }
    } else if (existingRecording?.recording_id) {
      const result = await supabase
        .from('call_recording')
        .update({
          recording_url: recordingUrl,
          duration_seconds: duration
        })
        .eq('recording_id', existingRecording.recording_id)
        .eq('business_id', businessId)
        .is('raw_deleted_at', null)
        .select('recording_id')
        .single()

      recording = result.data
      error = result.error
    } else {
      // KÄLLGRANSKAT FYND (Golden Path Fas 2, 2026-08-13): recording_id är
      // NOT NULL utan DEFAULT — se app/api/admin/demo-seed-meeting/route.ts
      // för hela fyndet (call_recording hade NOLL rader i produktion).
      const result = await supabase
        .from('call_recording')
        .upsert({
          recording_id: callRecordingId(businessId, callId),
          business_id: businessId,
          customer_id: customerId,
          source: 'phone',
          elks_recording_id: callId,
          recording_url: recordingUrl,
          duration_seconds: duration,
          phone_number: direction === 'outbound' ? to : from,
          from_number: from,
          to_number: to,
          direction: direction || 'inbound',
          created_at: new Date().toISOString()
        }, { onConflict: 'recording_id', ignoreDuplicates: true })
        .select('recording_id')
        .single()

      recording = result.data
      error = result.error
    }

    if (error) {
      console.error('Error saving recording:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    // Await the chain: a returned success means the handoff was accepted, not
    // a fire-and-forget promise that serverless may discard.
    if (recording?.recording_id) {
      const downstream = await fetch(`${APP_URL}/api/voice/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Den interna kedjan legitimerar sig — transcribe kräver numera
          // antingen den här hemligheten eller en inloggad ägare till
          // inspelningen (routen var tidigare helt öppen).
          ...(process.env.CRON_SECRET ? { 'x-internal-secret': process.env.CRON_SECRET } : {}),
        },
        body: JSON.stringify({ recording_id: recording.recording_id })
      })
      if (!downstream.ok) return NextResponse.json({ error: 'Inspelningen är sparad men efterarbetet behöver ett nytt försök.' }, { status: 503 })
    }

    console.log('Recording saved:', recording?.recording_id)
    return NextResponse.json({ success: true, recording_id: recording?.recording_id })

  } catch (error) {
    console.error('Recording webhook error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
