import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Lead-adressen (`<firma>@leads.handymate.se`) — provisionering på ETT ställe.
 *
 * Raden i email_inbound_route (sql/v106) är kontraktet för multi-tenant-
 * routningen i app/api/email/inbound: utan den vet vi inte vilket företag ett
 * inkommande mejl tillhör. Logiken fanns bara bakom POST
 * /api/integrations/email-lead, som kunden själv måste hitta i Inställningar —
 * i praktiken skapade en grundare raden manuellt per kund. Det skalar inte.
 *
 * Nu anropas samma funktion också vid finalize (POST /api/onboarding), så
 * varje nytt konto får sin adress utan att någon behöver komma ihåg det.
 *
 * Funktionen kastar aldrig: en saknad tabell (v106 inte körd) eller ett läsfel
 * får aldrig fälla onboardingen.
 */

export const LEAD_DOMAIN = 'leads.handymate.se'

/** Postgres undefined_table (42P01) — v106 inte körd i den här miljön. */
function isMissingTableError(err: any): boolean {
  return err?.code === '42P01' || /relation .* does not exist/i.test(String(err?.message || ''))
}

/**
 * Bygger en URL-säker slug ur företagsnamnet: gemener, å/ä→a, ö→o, allt annat
 * än [a-z0-9] blir bindestreck, max 30 tecken, inga kant-bindestreck. Tomt
 * resultat (ett namn som bara är symboler) faller tillbaka på "foretag" —
 * kollisionshanteringen gör den unik ändå.
 */
export function slugifyBusinessName(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const truncated = normalized.slice(0, 30).replace(/-+$/, '')
  return truncated || 'foretag'
}

/**
 * Genererar en slug som inte krockar med en befintlig rad. Kollision → '-2',
 * '-3', … med basen kapad så adressen håller sig inom 30 tecken. 50 försök är
 * ett skyddsnät mot en oändlig loop, inte ett förväntat scenario.
 */
export async function generateUniqueSlug(
  businessName: string,
  supabase: SupabaseClient,
): Promise<string> {
  const base = slugifyBusinessName(businessName)
  let candidate = base

  for (let attempt = 1; attempt <= 50; attempt++) {
    const { data, error } = await supabase
      .from('email_inbound_route')
      .select('address')
      .eq('address', `${candidate}@${LEAD_DOMAIN}`)
      .maybeSingle()
    if (error) throw error
    if (!data) return candidate

    const suffix = `-${attempt + 1}`
    candidate = `${base.slice(0, 30 - suffix.length)}${suffix}`
  }

  // 50 kollisioner på samma bas är extremt osannolikt — men fail-safe hellre
  // än en oändlig loop.
  return `${base.slice(0, 20)}-${Date.now().toString(36)}`
}

export type ProvisionResult =
  | { ok: true; address: string; active: boolean; created: boolean }
  | { ok: false; reason: 'table_missing' | 'error'; error?: string }

/**
 * Idempotent: finns raden redan returneras den oförändrad (created: false).
 */
export async function provisionInboundRoute(
  supabase: SupabaseClient,
  businessId: string,
  businessName: string | null | undefined,
): Promise<ProvisionResult> {
  try {
    const { data: existing, error: existingError } = await supabase
      .from('email_inbound_route')
      .select('address, active')
      .eq('business_id', businessId)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) {
      return { ok: true, address: existing.address, active: existing.active, created: false }
    }

    const slug = await generateUniqueSlug(businessName || businessId, supabase)
    let address = `${slug}@${LEAD_DOMAIN}`

    let { error: insertError } = await supabase
      .from('email_inbound_route')
      .insert({ address, business_id: businessId, active: true })

    if (insertError?.code === '23505') {
      // Race: någon annan tog samma slug mellan kollisionskollen och inserten.
      // Ett engångsförsök med tidsstämpel löser det utan låst transaktion.
      address = `${slug.slice(0, 20)}-${Date.now().toString(36)}@${LEAD_DOMAIN}`
      const retry = await supabase
        .from('email_inbound_route')
        .insert({ address, business_id: businessId, active: true })
      insertError = retry.error
    }
    if (insertError) throw insertError

    return { ok: true, address, active: true, created: true }
  } catch (err: any) {
    if (isMissingTableError(err)) return { ok: false, reason: 'table_missing' }
    return { ok: false, reason: 'error', error: String(err?.message || err) }
  }
}
