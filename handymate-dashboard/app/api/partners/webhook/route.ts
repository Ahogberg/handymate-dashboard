import { NextRequest, NextResponse } from 'next/server'
import { getPartnerFromToken, getPartnerTokenFromRequest } from '@/lib/partners/auth'
import { getServerSupabase } from '@/lib/supabase'
import { createHmac } from 'crypto'

/**
 * PUT /api/partners/webhook — Save webhook configuration
 */
export async function PUT(request: NextRequest) {
  const token = getPartnerTokenFromRequest(request)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const partner = await getPartnerFromToken(token)
  if (!partner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { webhook_url, webhook_events } = body

  // Validate URL format if provided
  if (webhook_url) {
    try {
      new URL(webhook_url)
    } catch {
      return NextResponse.json({ error: 'Ogiltig URL' }, { status: 400 })
    }
  }

  const supabase = getServerSupabase()

  const updateData: Record<string, unknown> = {
    webhook_url: webhook_url || null,
  }

  if (Array.isArray(webhook_events)) {
    const validEvents = ['trial_started', 'converted', 'plan_upgraded', 'churned']
    updateData.webhook_events = webhook_events.filter((e: string) => validEvents.includes(e))
  }

  const { error } = await supabase
    .from('partners')
    .update(updateData)
    .eq('id', partner.id)

  if (error) {
    return NextResponse.json({ error: 'Kunde inte spara webhook-inställningar' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

/**
 * POST /api/partners/webhook — Test webhook (sends a test payload)
 */
export async function POST(request: NextRequest) {
  const token = getPartnerTokenFromRequest(request)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const partner = await getPartnerFromToken(token)
  if (!partner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  const { data: fullPartner } = await supabase
    .from('partners')
    .select('webhook_url, webhook_secret')
    .eq('id', partner.id)
    .single()

  if (!fullPartner?.webhook_url) {
    return NextResponse.json({ error: 'Ingen webhook-URL konfigurerad' }, { status: 400 })
  }

  const payload = {
    event: 'test',
    business_name: 'Testföretag AB',
    plan: 'professional',
    timestamp: new Date().toISOString(),
    test: true,
  }

  const signature = createHmac('sha256', fullPartner.webhook_secret || '')
    .update(JSON.stringify(payload))
    .digest('hex')

  try {
    const res = await fetch(fullPartner.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Handymate-Signature': `sha256=${signature}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    })

    return NextResponse.json({
      success: true,
      status: res.status,
      message: `Webhook skickad — fick HTTP ${res.status}`,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    return NextResponse.json({
      success: false,
      message: `Kunde inte nå webhook-URL: ${message}`,
    }, { status: 502 })
  }
}
