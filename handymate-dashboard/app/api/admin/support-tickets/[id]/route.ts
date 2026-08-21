import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/support-tickets/[id] — ärendet + hela trådhistoriken.
 * Detta är en admin-läsning, inte en Claude-kontext, så vi hämtar hela
 * tråden direkt mot thread_message istället för att gå via
 * loadThreadMessages (som trimmar/summerar för LLM-context).
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const supabase = getAdminSupabase()

  const { data: ticket, error: ticketErr } = await supabase
    .from('support_ticket')
    .select(
      'id, business_id, thread_id, category, status, summary, escalated_at, resolved_at, satisfaction, resolved_by, business_config:business_id (business_name)'
    )
    .eq('id', params.id)
    .single()

  if (ticketErr || !ticket) {
    return NextResponse.json({ error: 'Ärendet hittades inte' }, { status: 404 })
  }

  const { data: messages, error: msgErr } = await supabase
    .from('thread_message')
    .select('id, role, agent, content, created_at')
    .eq('thread_id', ticket.thread_id)
    .order('created_at', { ascending: true })

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 })
  }

  return NextResponse.json({ ticket, messages: messages || [] })
}
