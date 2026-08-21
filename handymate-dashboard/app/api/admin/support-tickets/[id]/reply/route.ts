import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin } from '@/lib/admin-auth'
import { saveThreadMessage } from '@/lib/agent/thread-messages'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/support-tickets/[id]/reply — sluter loopen.
 *
 * Sparar admins svar direkt i samma thread_message-tråd som hantverkaren
 * använder i Matte-chatten (saveThreadMessage) — inget separat
 * admin-endast meddelandespår, och inget Claude-anrop. Flyttar ärendet
 * till 'in_progress' om det fortfarande stod som 'escalated'.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const message = body?.message
  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message krävs' }, { status: 400 })
  }

  const supabase = getAdminSupabase()

  const { data: ticket, error: fetchErr } = await supabase
    .from('support_ticket')
    .select('id, business_id, thread_id, status')
    .eq('id', params.id)
    .single()

  if (fetchErr || !ticket) {
    return NextResponse.json({ error: 'Ärendet hittades inte' }, { status: 404 })
  }

  await saveThreadMessage({
    threadId: ticket.thread_id,
    businessId: ticket.business_id,
    role: 'assistant',
    agent: 'support',
    content: message.trim(),
  })

  if (ticket.status === 'escalated') {
    const { error: updateErr } = await supabase
      .from('support_ticket')
      .update({ status: 'in_progress' })
      .eq('id', ticket.id)
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
