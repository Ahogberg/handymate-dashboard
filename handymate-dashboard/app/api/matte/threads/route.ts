import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/matte/threads
 *
 * Lista Matte-konversationer (gemensam historik webb + mobil) över
 * agent_threads/thread_message. Ersätter den gamla matte_conversations-vägen.
 *
 * Visar endast trådar med faktisk DIALOG (minst ett user-meddelande) — utesluter
 * rena automations-/röst-trådar utan konversation. title/preview/count HÄRLEDS
 * från thread_message (ingen schema-migrering).
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const bizId = business.business_id

  const { data: threads } = await supabase
    .from('agent_threads')
    .select('id, current_agent_id, last_message_at, created_at')
    .eq('business_id', bizId)
    .order('last_message_at', { ascending: false })
    .limit(100)

  if (!threads?.length) return NextResponse.json({ conversations: [] })

  // Hämta meddelanden för dessa trådar och härled titel/preview/antal.
  const ids = threads.map(t => t.id)
  const { data: msgs } = await supabase
    .from('thread_message')
    .select('thread_id, role, content, is_handoff_announcement, created_at')
    .in('thread_id', ids)
    .eq('business_id', bizId)
    .order('created_at', { ascending: true })

  const agg = new Map<string, { count: number; firstUser?: string; lastContent?: string }>()
  for (const m of msgs || []) {
    if (m.is_handoff_announcement) continue // metadata, ej del av dialogen
    const e = agg.get(m.thread_id) || { count: 0 }
    e.count++
    if (m.role === 'user' && !e.firstUser) e.firstUser = m.content
    e.lastContent = m.content
    agg.set(m.thread_id, e)
  }

  const conversations = threads
    .map(t => {
      const e = agg.get(t.id)
      if (!e?.firstUser) return null // bara trådar med faktisk dialog
      return {
        id: t.id,
        title: e.firstUser.slice(0, 60),
        last_message_preview: (e.lastContent || '').slice(0, 80),
        message_count: e.count,
        created_at: t.created_at,
        updated_at: t.last_message_at,
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)

  return NextResponse.json({ conversations })
}
