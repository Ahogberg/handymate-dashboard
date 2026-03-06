import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { triggerAgentFireAndForget, makeIdempotencyKey } from '@/lib/agent-trigger'
import { createHash } from 'crypto'

/**
 * Incoming SMS webhook from 46elks.
 *
 * Flow: 46elks POST → store message → trigger AI agent → return 200 OK
 * Agent handles response via send_sms tool (no standalone Claude here).
 *
 * Dedup: If the Supabase sms-webhook also fires for the same message,
 * the idempotency_key on agent_runs prevents double processing.
 */

// Never cache this route
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Log immediately before any parsing so Vercel always records the hit
  console.log('[SMS Incoming] POST received, content-type:', request.headers.get('content-type'))

  try {
    const supabase = getServerSupabase()

    // 46elks sends application/x-www-form-urlencoded.
    // request.formData() can fail silently when Content-Type includes a
    // charset suffix ("…; charset=UTF-8"). Parsing via URLSearchParams is
    // reliable regardless of Content-Type variant.
    const text = await request.text()
    const params = new URLSearchParams(text)
    const from = params.get('from') ?? ''
    const to = params.get('to') ?? ''
    const message = params.get('message') ?? ''

    console.log('[SMS Incoming]', { from, to, message: message.substring(0, 50) })

    if (!from || !message) {
      return new NextResponse('Missing data', { status: 400 })
    }

    // Find business by assigned phone number
    const { data: business } = await supabase
      .from('business_config')
      .select('business_id, business_name')
      .eq('assigned_phone_number', to)
      .single()

    if (!business) {
      // Fallback: find via customer phone → business
      const { data: customerData } = await supabase
        .from('customer')
        .select('business_id')
        .eq('phone_number', from)
        .limit(1)
        .single()

      if (!customerData) {
        console.log('[SMS Incoming] No business found for', to)
        return NextResponse.json({ success: true, handled: false })
      }

      const { data: biz } = await supabase
        .from('business_config')
        .select('business_id, business_name')
        .eq('business_id', customerData.business_id)
        .single()

      if (!biz) {
        return NextResponse.json({ success: true, handled: false })
      }

      Object.assign(business || {}, biz)
      if (!business) {
        return NextResponse.json({ success: true, handled: false })
      }
    }

    // Store inbound message in sms_conversation
    await supabase
      .from('sms_conversation')
      .insert({
        business_id: business.business_id,
        phone_number: from,
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      })

    // Build conversation history for agent context
    const { data: history } = await supabase
      .from('sms_conversation')
      .select('role, content, created_at')
      .eq('business_id', business.business_id)
      .eq('phone_number', from)
      .order('created_at', { ascending: false })
      .limit(10)

    const conversationHistory = (history || [])
      .reverse()
      .map((m: any) => `[${m.role}] ${m.content}`)
      .join('\n')

    // Generate idempotency key from message content
    const msgHash = createHash('sha256')
      .update(`${from}:${to}:${message}:${Math.floor(Date.now() / 60000)}`)
      .digest('hex')
      .substring(0, 16)

    // Trigger the AI agent — it will respond via send_sms tool
    triggerAgentFireAndForget(
      business.business_id,
      'incoming_sms',
      {
        phone_number: from,
        message,
        conversation_history: conversationHistory,
      },
      makeIdempotencyKey('sms', msgHash)
    )

    // Create inbox item for dashboard overview
    await supabase
      .from('inbox_item')
      .insert({
        inbox_item_id: 'inb_' + Math.random().toString(36).substring(2, 11),
        business_id: business.business_id,
        channel: 'sms',
        summary: message.substring(0, 100),
        status: 'new',
        created_at: new Date().toISOString(),
      })

    // Return 200 immediately — agent handles response asynchronously
    // 46elks expects plain-text "OK" (or any 200), not JSON
    return new NextResponse('OK')

  } catch (error: any) {
    console.error('[SMS Incoming] Error:', error)
    return new NextResponse('Internal error', { status: 500 })
  }
}
