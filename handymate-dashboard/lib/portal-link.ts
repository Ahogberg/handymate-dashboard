import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Portal-länk-helper
 *
 * En enda kanonisk länk per kund: /portal/{portal_token}?tab={tab}
 * Skapar portal_token om den saknas. Används av alla utgående SMS/mail
 * som vill skicka kunden in i portalen istället för externa URLer.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

export type PortalTab = 'projects' | 'quotes' | 'invoices' | 'messages' | 'review' | 'changes' | 'reports'

/**
 * Returnerar fullständig portal-URL för en kund.
 * Skapar portal_token om saknas och sätter portal_enabled=true.
 * Returnerar null om kunden inte finns.
 */
export async function getOrCreatePortalLink(
  supabase: SupabaseClient,
  customerId: string,
  tab?: PortalTab
): Promise<string | null> {
  const { data: customer } = await supabase
    .from('customer')
    .select('portal_token, portal_enabled')
    .eq('customer_id', customerId)
    .maybeSingle()

  if (!customer) return null

  let token = customer.portal_token
  if (!token) {
    token = crypto.randomUUID()
    await supabase
      .from('customer')
      .update({ portal_token: token, portal_enabled: true })
      .eq('customer_id', customerId)
  } else if (customer.portal_enabled === false) {
    await supabase
      .from('customer')
      .update({ portal_enabled: true })
      .eq('customer_id', customerId)
  }

  const base = `${APP_URL}/portal/${token}`
  return tab ? `${base}?tab=${tab}` : base
}

/**
 * Bygg portal-länk från ett redan känt token (skippar DB-kollen).
 */
export function buildPortalUrl(token: string, tab?: PortalTab): string {
  const base = `${APP_URL}/portal/${token}`
  return tab ? `${base}?tab=${tab}` : base
}
