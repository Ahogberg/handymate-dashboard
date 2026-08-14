import { getServerSupabase } from '@/lib/supabase'
import { extractFirstName, halsning } from '@/lib/customers/namn'
import { meterDirectLlmCall } from '@/lib/agents/shared/cost-guard'
import { llmCostUsd } from '@/lib/costs/meter'

const QUOTE_NUDGE_MODEL = 'claude-haiku-4-5-20251001'

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

  // Hämta offert — quotes saknar FK till customer i prod, en embed
  // (`customer:customer(...)`) avvisar HELA queryn (PGRST200) och gjorde
  // att view-nudges aldrig skapades. Hämta kund separat.
  const { data: quote, error: quoteErr } = await supabase
    .from('quotes')
    .select('title, customer_id')
    .eq('quote_id', quoteId)
    .single()

  if (quoteErr || !quote?.customer_id) return

  const { data: customer, error: customerErr } = await supabase
    .from('customer')
    .select('name, phone_number, email')
    .eq('customer_id', quote.customer_id)
    .maybeSingle()

  if (customerErr) {
    console.error('[createQuoteNudge] customer fetch error:', customerErr)
    return
  }
  if (!customer?.phone_number) return

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

  // Generera nudge-SMS. R1/R2: kundtext får BARA förnamn, ALDRIG
  // offertens interna arbetsnamn — referera generiskt till "offerten".
  const customerFirstName = extractFirstName(customer.name)
  let nudgeMessage = `${halsning(customer.name)} Jag såg att du tittade på offerten. Har du några frågor? Hör gärna av dig! //${business?.contact_name || ''}`

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
          model: QUOTE_NUDGE_MODEL,
          max_tokens: 160,
          messages: [{
            role: 'user',
            content: `Skriv ett kort, naturligt SMS (max 160 tecken) till ${customerFirstName || 'kunden'} som har tittat på sin offert ${viewCount} gånger utan att svara. Fråga varsamt om de har frågor. Signera med ${business?.contact_name || ''}. Skriv på svenska. Använd kundens förnamn (eller "Hej!" om inget namn finns). Referera till offerten generiskt — nämn ALDRIG interna arbetsnamn eller titlar. Bara SMS-texten, inget annat.`,
          }],
        }),
      })
      if (res.ok) {
        const data = await res.json()

        // COGS-boken — quote-nudge-SMS-genereringen var tidigare helt omätt.
        if (data.usage) {
          await meterDirectLlmCall({
            supabase,
            businessId,
            usage: data.usage,
            costUsd: llmCostUsd(data.usage, QUOTE_NUDGE_MODEL),
            refType: 'quote_nudge_sms',
            refId: quoteId,
            meta: { viewCount },
          })
        }

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
      agent_id: 'daniel',
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
