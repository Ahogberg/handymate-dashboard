import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Verifiera att tråden tillhör det autentiserade företaget. */
async function ownThread(supabase: SupabaseClient, bizId: string, id: string) {
  const { data } = await supabase
    .from('agent_threads')
    .select('id, business_id')
    .eq('id', id)
    .maybeSingle()
  return data && data.business_id === bizId ? data : null
}

/**
 * GET /api/matte/threads/[id] — ladda en tråds meddelanden (för webb-modalen).
 * Returnerar role/agent/content så UI kan visa rätt agent-etikett + handoff.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getServerSupabase()
  const owned = await ownThread(supabase, business.business_id, id)
  if (!owned) return NextResponse.json({ error: 'Hittades inte' }, { status: 404 })

  const { data: messages } = await supabase
    .from('thread_message')
    .select('id, role, agent, content, is_handoff_announcement, created_at')
    .eq('thread_id', id)
    .eq('business_id', business.business_id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ messages: messages || [] })
}

/**
 * DELETE /api/matte/threads/[id] — radera tråd (cascade tar thread_message).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getServerSupabase()
  const owned = await ownThread(supabase, business.business_id, id)
  if (!owned) return NextResponse.json({ error: 'Hittades inte' }, { status: 404 })

  await supabase
    .from('agent_threads')
    .delete()
    .eq('id', id)
    .eq('business_id', business.business_id)

  return NextResponse.json({ ok: true })
}
