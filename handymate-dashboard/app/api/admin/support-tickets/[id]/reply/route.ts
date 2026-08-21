import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin, logAdminAction } from '@/lib/admin-auth'
import { scrubPII } from '@/lib/agent/thread-messages'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/support-tickets/[id]/reply — sluter loopen.
 *
 * Sparar admins svar direkt i samma thread_message-tråd som hantverkaren
 * använder i Matte-chatten — inget separat admin-endast meddelandespår,
 * och inget Claude-anrop.
 *
 * Vi använder MEDVETET INTE saveThreadMessage() här. Den funktionen är
 * fire-and-forget (sväljer alla DB-fel internt, loggar bara till console,
 * resolvar alltid void) — rätt för live-chatten där ett loggningsglapp
 * aldrig ska krascha en tur, men fel här: bekräftad leverans är hela
 * poängen med "sluten loop". Om inserten misslyckades tyst skulle admin
 * se "skickat", ärendet lämna eskaleringskön, och hantverkaren aldrig få
 * svaret — precis det mönster den här kodbasen blivit bränd av förut.
 * Vi gör därför inserten direkt, i samma form som saveThreadMessage
 * använder internt (lib/agent/thread-messages.ts), och kontrollerar felet.
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

  const { error: msgErr } = await supabase.from('thread_message').insert({
    thread_id: ticket.thread_id,
    business_id: ticket.business_id,
    role: 'assistant',
    agent: 'support',
    content: scrubPII(message.trim()),
    is_handoff_announcement: false,
    metadata: {},
    images: [],
  })

  if (msgErr) {
    console.error('[admin/support-tickets/reply] insert misslyckades:', msgErr)
    return NextResponse.json({ error: 'Kunde inte spara svaret' }, { status: 500 })
  }

  if (ticket.status === 'escalated') {
    const { error: updateErr } = await supabase
      .from('support_ticket')
      .update({ status: 'in_progress' })
      .eq('id', ticket.id)
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }
  }

  await logAdminAction('support_ticket_reply', admin.userId || 'unknown', ticket.business_id, {
    ticketId: ticket.id,
    adminEmail: admin.email,
  })

  return NextResponse.json({ success: true })
}
