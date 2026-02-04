import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * PATCH - Uppdatera en inspelning (t.ex. manuell transkribering)
 */
export async function PATCH(request: NextRequest) {
  try {
    const { recording_id, transcript } = await request.json()

    if (!recording_id) {
      return NextResponse.json({ error: 'Missing recording_id' }, { status: 400 })
    }

    const updateData: any = {}

    if (transcript !== undefined) {
      updateData.transcript = transcript
      updateData.transcribed_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('call_recording')
      .update(updateData)
      .eq('recording_id', recording_id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, recording: data })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort en inspelning
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const recording_id = searchParams.get('recording_id')

    if (!recording_id) {
      return NextResponse.json({ error: 'Missing recording_id' }, { status: 400 })
    }

    // Ta bort relaterade AI-förslag först
    await supabase
      .from('ai_suggestion')
      .delete()
      .eq('recording_id', recording_id)

    // Ta bort inspelningen
    const { error } = await supabase
      .from('call_recording')
      .delete()
      .eq('recording_id', recording_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
