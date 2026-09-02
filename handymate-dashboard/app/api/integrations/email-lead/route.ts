import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { provisionInboundRoute } from '@/lib/email/provision-inbound-route'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * /api/integrations/email-lead — Epic B (lead-intake-sprinten, 2026-08-10).
 *
 * Settings-API för företagets rad i email_inbound_route (sql/v106, kontraktet
 * för multi-tenant-routningen i app/api/email/inbound). Adressen kunden
 * vidarebefordrar sin företagsmail till (t.ex. bee@leads.handymate.se).
 *
 * Tabellen är INTE körd i databasen ännu (v106 väntar på Andreas' körning
 * via Supabase MCP) — båda metoderna måste tåla att den saknas och svara
 * 503 med svensk text, inte krascha med 500.
 */

const MISSING_TABLE_MESSAGE = 'Funktionen aktiveras inom kort'

/** Postgres undefined_table (42P01) — tabellen finns inte ännu (migration
    v106 ej körd). Matchar även på felmeddelandet som reservlösning eftersom
    olika Supabase-klienter inte alltid populerar `code` konsekvent. */
function isMissingTableError(err: any): boolean {
  return err?.code === '42P01' || /relation .* does not exist/i.test(String(err?.message || ''))
}

/** Postgres undefined_column (42703) — v109 (last_received_at) inte körd
    ännu. Samma fail-soft-princip som isMissingTableError. */
function isMissingColumnError(err: any): boolean {
  return err?.code === '42703' || /column .* does not exist/i.test(String(err?.message || ''))
}

function missingTableResponse() {
  return NextResponse.json({ error: 'not_available', message: MISSING_TABLE_MESSAGE }, { status: 503 })
}

/**
 * GET /api/integrations/email-lead
 *
 * Returnerar företagets adress om den finns, annars { address: null } —
 * det senare är inte ett fel, bara "inte aktiverat ännu".
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    try {
      let data: { address: string; active: boolean; created_at: string; last_received_at?: string | null } | null = null
      try {
        const result = await supabase
          .from('email_inbound_route')
          .select('address, active, created_at, last_received_at')
          .eq('business_id', business.business_id)
          .maybeSingle()
        if (result.error) throw result.error
        data = result.data
      } catch (err: any) {
        // v109 (last_received_at) kanske inte är körd än — fall tillbaka på
        // en select utan den kolumnen i stället för att svara 503 helt i
        // onödan för en funktion (adressvisning) som annars fungerar fint.
        if (!isMissingColumnError(err)) throw err
        const fallback = await supabase
          .from('email_inbound_route')
          .select('address, active, created_at')
          .eq('business_id', business.business_id)
          .maybeSingle()
        if (fallback.error) throw fallback.error
        data = fallback.data
      }

      return NextResponse.json({
        address: data?.address || null,
        active: data?.active ?? null,
        last_received_at: data?.last_received_at ?? null,
      })
    } catch (err: any) {
      if (isMissingTableError(err)) return missingTableResponse()
      throw err
    }
  } catch (err: any) {
    console.error('[integrations/email-lead] GET-fel', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}

/**
 * POST /api/integrations/email-lead
 *
 * Skapar företagets adress om den saknas (idempotent — redan aktiverad
 * business får bara tillbaka sin befintliga rad). Kräver manage_settings:
 * att peka om vart företagets kundmail landar är en inställningsändring,
 * inte något varje anställd ska kunna trigga.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !hasPermission(currentUser, 'manage_settings')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()

    // Samma provisionering som finalize kör automatiskt
    // (lib/email/provision-inbound-route.ts) — idempotent, en sanning.
    const result = await provisionInboundRoute(
      supabase,
      business.business_id,
      business.business_name,
    )
    if (!result.ok) {
      if (result.reason === 'table_missing') return missingTableResponse()
      throw new Error(result.error || 'Adressen kunde inte skapas')
    }
    return NextResponse.json({ address: result.address, active: result.active })
  } catch (err: any) {
    console.error('[integrations/email-lead] POST-fel', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
