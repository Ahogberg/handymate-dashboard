import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET - Lista inspelningar för ett företag
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const customerId = request.nextUrl.searchParams.get('customerId')

    let query = supabase
      .from('call_recording')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    const { data: recordings, error } = await query

    if (error) throw error

    return NextResponse.json({ recordings: recordings || [] })
  } catch (error: any) {
    console.error('Get recordings error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH - Uppdatera en inspelning (t.ex. manuell transkribering)
 */
export async function PATCH(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
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
      .eq('business_id', business.business_id)
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
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
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
      .eq('business_id', business.business_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
