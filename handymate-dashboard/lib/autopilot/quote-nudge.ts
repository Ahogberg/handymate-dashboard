import { getServerSupabase } from '@/lib/supabase'

/**
 * Skapar en nudge-approval när en offert visats 3+ gånger utan svar.
 * Anropas från tracking-endpointen via fireEvent.
 */
export async function createQuoteNudge(
  businessId: string,
  quoteId: string,
  viewCount: number
): Promise<void> {
  const supabase = getServerSupabase()

  // Hämta offert + kund
  const { data: quote } = await supabase
    .from('quotes')
    .select('title, customer_id, customer:customer(name, phone_number, email)')
    .eq('quote_id', quoteId)
    .single()

  if (!quote?.customer) return

  const customer = quote.customer as any
  if (!customer.phone_number) return

  // Kolla om en nudge redan skapats för denna offert
  const { count } = await supabase
    .from('pending_approvals')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('approval_type', 'quote_nudge')
    .contains('payload', { quote_id: quoteId })

  if ((count || 0) > 0) return // Redan skapad

  // Hämta business-info för SMS
  const { data: business } = await supabase
    .from('business_config')
    .select('business_name, contact_name')
    .eq('business_id', businessId)
    .single()

  // Generera nudge-SMS
  let nudgeMessage = `Hej ${customer.name}! Jag såg att du tittade på offerten för "${quote.title}". Har du några frågor? Hör gärna av dig! //${business?.contact_name || ''}`

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 160,
          messages: [{
            role: 'user',
            content: `Skriv ett kort, naturligt SMS (max 160 tecken) till ${customer.name} som har tittat på offerten för "${quote.title}" ${viewCount} gånger utan att svara. Fråga varsamt om de har frågor. Signera med ${business?.contact_name || ''}. Skriv på svenska. Bara SMS-texten, inget annat.`,
          }],
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const text = data.content?.[0]?.text
        if (text) nudgeMessage = text.trim()
      }
    } catch { /* fallback */ }
  }

  // Skapa approval
  const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  await supabase.from('pending_approvals').insert({
    id: approvalId,
    business_id: businessId,
    approval_type: 'quote_nudge',
    title: `💡 Nudge — ${customer.name}`,
    description: `Öppnat offerten ${viewCount}x utan att svara`,
    status: 'pending',
    risk_level: 'medium',
    payload: {
      quote_id: quoteId,
      to: customer.phone_number,
      message: nudgeMessage,
      customer_name: customer.name,
      view_count: viewCount,
    },
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  })

  // Push-notis
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    await fetch(`${appUrl}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        title: `💡 ${customer.name} har tittat ${viewCount}x`,
        body: `Offerten "${quote.title}" — föreslå en nudge?`,
        data: { url: '/dashboard/approvals' },
      }),
    })
  } catch { /* non-blocking */ }
}
