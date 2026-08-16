import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Portal-länk-helper
 *
 * En enda kanonisk länk per kund: /portal/{portal_token}?tab={tab}
 * Skapar portal_token om den saknas. Används av alla utgående SMS/mail
 * som vill skicka kunden in i portalen istället för externa URLer.
 */

/**
 * Löser en portal-token till kundraden bakom den. Konsoliderar sex
 * duplicerade inline-implementationer i app/api/portal/[token]/*-routes
 * (TD-22, tasks/tech-debt.md) till en enda plats — en av dem (/projects)
 * hade redan fixats separat, men bara här loggas felet en gång i stället
 * för potentiellt sex.
 *
 * Behåller den redan bevisade risk-profilen från /projects-fixet: både
 * ett genuint DB-fel (kolumn saknas, RLS, timeout) och en riktig "token
 * finns inte" ger null → 404 till anroparen. Token-URL:er är publika,
 * så en 500 skulle inte skvallra mer än en 404 gör — men felet syns nu
 * i loggen i stället för att tyst ge en tom portal (den ursprungliga
 * TD-22-buggen: /projects läste den obefintliga kolumnen `progress`,
 * PostgREST gav 42703, och routen visade en tom lista utan spår).
 */
export async function getCustomerFromPortalToken(
  supabase: SupabaseClient,
  token: string,
  select: string = 'customer_id, business_id, portal_enabled',
): Promise<Record<string, any> | null> {
  const { data, error } = await supabase
    .from('customer')
    .select(select)
    .eq('portal_token', token)
    .single()

  if (error) {
    console.error('[portal] token lookup error:', error)
  }
  if (!data || !(data as any).portal_enabled) return null
  return data
}

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
