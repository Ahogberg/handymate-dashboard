import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { verifyElksSignature } from '@/lib/elks-signature'

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

    console.log('Recording received:', {
      callId,
      recordingId,
      duration,
      recordingUrl,
      from,
      to
    })

    if (!recordingUrl) {
      console.error('No recording URL received')
      return NextResponse.json({ error: 'No recording URL' }, { status: 400 })
    }

    // Hitta tidigare inspelning/samtal baserat på elks_recording_id
    const { data: existingRecording } = await supabase
      .from('call_recording')
      .select('recording_id, business_id, customer_id')
      .eq('elks_recording_id', callId)
      .single()

    // Om vi inte hittar samtalet, försök hitta business via telefonnummer
    let businessId = existingRecording?.business_id
    let customerId = existingRecording?.customer_id

    if (!businessId) {
      // Försök hitta business baserat på to-nummer (inkommande samtal)
      const phoneToCheck = direction === 'inbound' ? to : from
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
    if (existingRecording?.recording_id) {
      const result = await supabase
        .from('call_recording')
        .update({
          recording_url: recordingUrl,
          duration_seconds: duration
        })
        .eq('recording_id', existingRecording.recording_id)
        .select('recording_id')
        .single()

      recording = result.data
      error = result.error
    } else {
      const result = await supabase
        .from('call_recording')
        .insert({
          business_id: businessId,
          customer_id: customerId,
          elks_recording_id: recordingId,
          recording_url: recordingUrl,
          duration_seconds: duration,
          phone_number: direction === 'inbound' ? from : to,
          direction: direction || 'inbound',
          created_at: new Date().toISOString()
        })
        .select('recording_id')
        .single()

      recording = result.data
      error = result.error
    }

    if (error) {
      console.error('Error saving recording:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    // Trigga transkribering asynkront (fire and forget)
    if (recording?.recording_id) {
      fetch(`${APP_URL}/api/voice/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Den interna kedjan legitimerar sig — transcribe kräver numera
          // antingen den här hemligheten eller en inloggad ägare till
          // inspelningen (routen var tidigare helt öppen).
          ...(process.env.CRON_SECRET ? { 'x-internal-secret': process.env.CRON_SECRET } : {}),
        },
        body: JSON.stringify({ recording_id: recording.recording_id })
      }).catch(err => console.error('Failed to trigger transcription:', err))
    }

    console.log('Recording saved:', recording?.recording_id)
    return NextResponse.json({ success: true, recording_id: recording?.recording_id })

  } catch (error) {
    console.error('Recording webhook error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
