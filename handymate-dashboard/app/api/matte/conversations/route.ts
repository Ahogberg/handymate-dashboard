import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/matte/conversations
 * Lista de 20 senaste konversationerna för företaget.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('matte_conversations')
    .select('id, title, last_message_preview, message_count, created_at, updated_at')
    .eq('business_id', business.business_id)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ conversations: data || [] })
}

/**
 * POST /api/matte/conversations
 * Skapa ny konversation.
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('matte_conversations')
    .insert({
      business_id: business.business_id,
      title: body.title || null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ conversation: data })
}
