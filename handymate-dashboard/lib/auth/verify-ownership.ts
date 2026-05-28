import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Cross-business ownership-verifiering för entity-IDs som kommer från
 * request-body. Skydd mot att en authenticated user länkar/refererar
 * till en annan businesses customer/project/deal/etc genom att skicka
 * dess ID i request-body.
 *
 * Använd FÖRE .insert()/.update() när någon av dessa fält accepteras
 * från body:
 *   customer_id, project_id, deal_id, quote_id, invoice_id,
 *   booking_id, lead_id, template_id, m.fl.
 *
 * Lärdom från audit-2026-05-20 + tidigare TD-71/TD-77: samma läckage-
 * mönster förekommer på 5-10+ routes. En helper undviker att glömma
 * checken på enskild ny route.
 *
 * @example
 *   const check = await verifyOwnership(supabase, business.business_id, [
 *     { table: 'project', idColumn: 'project_id', idValue: body.project_id, label: 'projekt' },
 *     { table: 'customer', idColumn: 'customer_id', idValue: body.customer_id, label: 'kund' },
 *   ])
 *   if (!check.ok) {
 *     return NextResponse.json(
 *       { error: `Du har inte tillgång till: ${check.missing.join(', ')}` },
 *       { status: 403 },
 *     )
 *   }
 */

export interface OwnershipCheck {
  table: string
  idColumn: string
  idValue: string | null | undefined
  label: string
}

export interface OwnershipResult {
  ok: boolean
  missing: string[]
}

/**
 * Verifiera att en lista med entity-IDs alla tillhör businessId.
 * IDs som är null/undefined ignoreras (optional foreign keys).
 *
 * Säkerhetsregel: om en check returnerar 0 rows = inte ägd ELLER finns inte =
 * båda behandlas som "förbjudet". Vi avslöjar inte vilketdera (skyddar mot
 * enumeration).
 */
export async function verifyOwnership(
  supabase: SupabaseClient,
  businessId: string,
  checks: OwnershipCheck[],
): Promise<OwnershipResult> {
  const missing: string[] = []

  for (const check of checks) {
    if (check.idValue == null || check.idValue === '') continue

    const { data } = await supabase
      .from(check.table)
      .select(check.idColumn)
      .eq(check.idColumn, check.idValue)
      .eq('business_id', businessId)
      .maybeSingle()

    if (!data) {
      missing.push(check.label)
    }
  }

  return { ok: missing.length === 0, missing }
}
