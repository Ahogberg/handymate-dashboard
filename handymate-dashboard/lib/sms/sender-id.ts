/**
 * lib/sms/sender-id.ts (2026-05-28).
 *
 * Sanerar business_name → 46elks-godkänd alfanumerisk avsändar-ID.
 *
 * 46elks-regler (alphanumeric sender ID):
 *   - Endast A-Z, a-z, 0-9
 *   - Max 11 tecken
 *   - Inga mellanslag eller symboler
 *
 * Bug-historia:
 *   2026-05-28 (a): Bee Service kunde inte skicka SMS. Mellanslag på pos 4.
 *   2026-05-28 (b): "Bee Service AB" gav "BeeServiceA" — klipp mitt i "AB".
 *                   Lösning: strippa svenska företagsformer före sanering.
 *
 * Spec (Andreas, 2026-05-28): avsändar-namnet bör vara den person som är
 * ansvarig för aktuell deal/projekt (assigned_to), med företagsnamn som
 * fallback. resolveSenderId() utför slå-upp-i-DB-lookup. Sanitize-helpern
 * används som sista steg + för call-sites utan deal/project-kontext.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Sanerar fri text till 46elks-format. Stripper svenska företagsformer
 * (AB, HB, KB, Aktiebolag, Handelsbolag, Kommanditbolag) före trunkering
 * så "Bee Service AB" → "BeeService" istället för "BeeServiceA".
 *
 * Engelska former (Inc, Corp, Ltd, LLC) också strippade — pilot är svensk
 * men nice-to-have för internationella kunder.
 */
export function sanitizeSenderId(name: string | null | undefined): string {
  let n = (name || '').trim()
  // Strip vanliga företagsformer + ev. ledande mellanslag/komma
  n = n.replace(/[\s,]+(AB|HB|KB|Aktiebolag|Handelsbolag|Kommanditbolag|Inc|Corp|Corporation|Ltd|Limited|LLC)\.?$/i, '')
  const sanitized = n.replace(/[^A-Za-z0-9]/g, '').substring(0, 11)
  return sanitized || 'Handymate'
}

/**
 * Slår upp ansvarig person (assigned_to) för deal/project och returnerar
 * deras förnamn som 46elks-avsändar-ID. Faller tillbaka till business_name
 * om ingen ansvarig finns.
 *
 * Lookup-prioritet:
 *   1. deal.assigned_to → business_users.name → första ordet
 *   2. project_assignment WHERE project_id AND role='lead' → name
 *   3. business_config.business_name (sanitized)
 *
 * Använder förnamn (split(' ')[0]) för naturligare avsändare:
 *   "Christoffer Thanger" → "Christoffer" (11 chars)
 *   "Lars-Erik" → "LarsErik" (8 chars efter sanering)
 *
 * Call-sites bör skicka in den kontext som är relevant. Test-SMS och
 * generella system-SMS kan kalla sanitizeSenderId direkt med business_name.
 */
export async function resolveSenderId(
  supabase: SupabaseClient,
  opts: {
    businessId: string
    dealId?: string | null
    projectId?: string | null
  },
): Promise<string> {
  // 1. Deal assigned_to
  if (opts.dealId) {
    const { data: deal } = await supabase
      .from('deal')
      .select('assigned_to')
      .eq('id', opts.dealId)
      .eq('business_id', opts.businessId)
      .maybeSingle()

    if (deal?.assigned_to) {
      const { data: user } = await supabase
        .from('business_users')
        .select('name')
        .eq('id', deal.assigned_to)
        .maybeSingle()
      if (user?.name) return sanitizeSenderId(user.name.split(' ')[0])
    }
  }

  // 2. Project assignment med role='lead'
  if (opts.projectId) {
    const { data: assignment } = await supabase
      .from('project_assignment')
      .select('business_user_id')
      .eq('project_id', opts.projectId)
      .eq('business_id', opts.businessId)
      .eq('role', 'lead')
      .limit(1)
      .maybeSingle()

    if (assignment?.business_user_id) {
      const { data: user } = await supabase
        .from('business_users')
        .select('name')
        .eq('id', assignment.business_user_id)
        .maybeSingle()
      if (user?.name) return sanitizeSenderId(user.name.split(' ')[0])
    }
  }

  // 3. Fallback business_name
  const { data: biz } = await supabase
    .from('business_config')
    .select('business_name')
    .eq('business_id', opts.businessId)
    .maybeSingle()

  return sanitizeSenderId(biz?.business_name)
}
