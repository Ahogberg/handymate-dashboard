import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/matte/conversations/[id]
 * Hämta konversation med alla meddelanden.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = getServerSupabase()

  const { data: conversation, error: cErr } = await supabase
    .from('matte_conversations')
    .select('id, title, created_at, updated_at')
    .eq('id', id)
    .eq('business_id', business.business_id)
    .maybeSingle()

  if (cErr || !conversation) {
    return NextResponse.json({ error: 'Hittades inte' }, { status: 404 })
  }

  const { data: messages } = await supabase
    .from('matte_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ conversation, messages: messages || [] })
}

/**
 * PATCH /api/matte/conversations/[id]
 * Uppdatera titel/preview.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  if (body.title !== undefined) updates.title = body.title

  const supabase = getServerSupabase()
  const { error } = await supabase
    .from('matte_conversations')
    .update(updates)
    .eq('id', id)
    .eq('business_id', business.business_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

/**
 * DELETE /api/matte/conversations/[id]
 * Ta bort konversation (cascade raderar meddelanden).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = getServerSupabase()
  const { error } = await supabase
    .from('matte_conversations')
    .delete()
    .eq('id', id)
    .eq('business_id', business.business_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
