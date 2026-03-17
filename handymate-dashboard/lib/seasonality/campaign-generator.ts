/**
 * Genererar säsongskampanj-förslag → pending_approvals.
 * Max 1 förslag per månad per företag.
 */

import { getServerSupabase } from '@/lib/supabase'
import { getSeasonalTheme } from './industry-themes'

const MONTH_NAMES: Record<number, string> = {
  1: 'januari', 2: 'februari', 3: 'mars', 4: 'april',
  5: 'maj', 6: 'juni', 7: 'juli', 8: 'augusti',
  9: 'september', 10: 'oktober', 11: 'november', 12: 'december',
}

/**
 * Generera kampanjförslag om det inte redan finns ett för denna månad.
 */
export async function generateSeasonalCampaign(
  businessId: string,
  branch: string,
  month: number,
  year: number
): Promise<{ generated: boolean; reason?: string }> {
  const supabase = getServerSupabase()

  // 1. Kolla om kampanj redan genererats denna månad
  const { data: existing } = await supabase
    .from('seasonal_campaigns')
    .select('id')
    .eq('business_id', businessId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()

  if (existing) return { generated: false, reason: 'already_exists' }

  // 2. Hämta tema
  const theme = getSeasonalTheme(branch, month)
  if (!theme) return { generated: false, reason: 'no_theme' }

  // 3. Hämta kunder med telefonnummer
  const { data: customers } = await supabase
    .from('customer')
    .select('customer_id, name, phone_number')
    .eq('business_id', businessId)
    .not('phone_number', 'is', null)
    .limit(200)

  const validCustomers = (customers || []).filter((c: any) => c.phone_number?.trim())
  if (validCustomers.length === 0) return { generated: false, reason: 'no_customers' }

  // 4. Hämta företagsinfo
  const { data: business } = await supabase
    .from('business_config')
    .select('business_name, contact_name')
    .eq('business_id', businessId)
    .single()

  if (!business) return { generated: false, reason: 'no_business' }

  // 5. Generera SMS-text
  const smsText = await generateSmsText(
    business.business_name || '',
    business.contact_name || '',
    branch,
    theme,
    MONTH_NAMES[month] || ''
  )

  // 6. Skapa approval
  const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  await supabase.from('pending_approvals').insert({
    id: approvalId,
    business_id: businessId,
    approval_type: 'seasonal_campaign',
    title: `Säsongskampanj: ${theme.theme}`,
    description: `${validCustomers.length} kunder · ${branch} · ${MONTH_NAMES[month]}`,
    risk_level: 'medium',
    status: 'pending',
    payload: {
      theme: theme.theme,
      angle: theme.angle,
      projectTypes: theme.projectTypes,
      callToAction: theme.callToAction,
      branch,
      month,
      year,
      month_name: MONTH_NAMES[month],
      sms_text: smsText,
      customer_count: validCustomers.length,
      customers: validCustomers.map((c: any) => ({
        customer_id: c.customer_id,
        name: c.name,
        phone_number: c.phone_number,
      })),
    },
    expires_at: expiresAt.toISOString(),
  })

  // 7. Registrera i seasonal_campaigns
  await supabase.from('seasonal_campaigns').insert({
    business_id: businessId,
    year,
    month,
    theme: theme.theme,
    branch,
    approval_id: approvalId,
    customer_count: validCustomers.length,
    status: 'generated',
  })

  return { generated: true }
}

/**
 * Generera SMS med Claude Haiku, fallback till mall.
 */
async function generateSmsText(
  businessName: string,
  contactName: string,
  branch: string,
  theme: { theme: string; angle: string; projectTypes: string[]; callToAction: string },
  monthName: string
): Promise<string> {
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
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `Skriv ett kort, naturligt SMS (max 160 tecken) från ${contactName} på ${businessName}.

Bransch: ${branch}
Säsongstema: ${theme.theme}
Vinkel: ${theme.angle}
Relevanta projekttyper: ${theme.projectTypes.join(', ')}
Uppmaning: ${theme.callToAction}

VIKTIGT: Nämn BARA projekt som är relevanta för ${branch}.
Var personlig och naturlig — inte reklam-aktig.
Skriv på svenska. Bara SMS-texten, inget annat.`,
          }],
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const text = data.content?.[0]?.text
        if (text) return text.trim()
      }
    } catch {
      // Fallback
    }
  }

  // Fallback-mall
  return `Hej! ${theme.angle}. Vi på ${businessName} hjälper gärna till med ${theme.projectTypes[0]}. ${theme.callToAction}! //${contactName}`
}
