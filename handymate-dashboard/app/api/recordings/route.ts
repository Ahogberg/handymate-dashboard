import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'

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

    const user = await getCurrentUser(request, business.business_id)
    if (!user || !isOwnerOrAdmin(user) || business._impersonation) {
      return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const { recording_id, transcript } = await request.json()

    if (typeof recording_id !== 'string' || typeof transcript !== 'string') {
      return NextResponse.json({ error: 'Inspelning och transkript krävs.' }, { status: 400 })
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
      .is('raw_deleted_at', null)
      .eq('call_processing', '{}')
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) return NextResponse.json({ error: 'Transkriptet kan inte ändras efter påbörjad analys eller gallring, eller så saknas inspelningen.' }, { status: 409 })

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

    const user = await getCurrentUser(request, business.business_id)
    if (!user || !isOwnerOrAdmin(user) || business._impersonation) {
      return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const { searchParams } = new URL(request.url)
    const recording_id = searchParams.get('recording_id')

    if (!recording_id) {
      return NextResponse.json({ error: 'Missing recording_id' }, { status: 400 })
    }

    // Resolve ownership BEFORE child deletion. Phone tombstones must survive
    // callbacks; deleting one row is not erasure at the recording provider.
    const existing = await supabase.from('call_recording').select('recording_id, source')
      .eq('business_id', business.business_id).eq('recording_id', recording_id).maybeSingle()
    if (existing.error) throw existing.error
    if (!existing.data) return NextResponse.json({ error: 'Inspelningen hittades inte.' }, { status: 404 })
    if (existing.data.source === 'phone') return NextResponse.json({
      error: 'Telefonsamtal gallras enligt lagringspolicyn. Kontakta supporten för en tidigare radering även hos inspelningsleverantören.',
    }, { status: 409 })

    const suggestions = await supabase
      .from('ai_suggestion')
      .delete()
      .eq('recording_id', recording_id)
      .eq('business_id', business.business_id)
    if (suggestions.error) throw suggestions.error

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
