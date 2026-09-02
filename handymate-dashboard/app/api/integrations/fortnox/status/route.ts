import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getFortnoxConfig } from '@/lib/fortnox'

/**
 * GET /api/integrations/fortnox/status
 *
 * Returnerar kopplings-status för UI. Inga tokens läcks — bara metadata.
 *
 * force-dynamic är obligatoriskt: routen läser bara request.headers via
 * getAuthenticatedBusiness(request), aldrig cookies()/headers() från
 * next/headers direkt i den här filen. Next.js statiska analys ser bara
 * den egna filens kod, inte vad importerade funktioner gör — utan denna
 * export cachar Next routen som statisk (Full Route Cache) på en URL utan
 * unika query-parametrar, så FÖRSTA anropet efter deploy fryses och
 * returneras till ALLA företag oavsett vem som faktiskt frågar.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const [{ data: metadata, error: metadataError }, config] = await Promise.all([
      supabase
        .from('business_config')
        .select('fortnox_connected, fortnox_last_synced_at')
        .eq('business_id', business.business_id)
        .maybeSingle(),
      getFortnoxConfig(business.business_id),
    ])
    if (metadataError) throw metadataError

    return NextResponse.json({
      connected: !!metadata?.fortnox_connected && !!config?.fortnox_access_token,
      company_name: config?.fortnox_company_name || null,
      connected_at: config?.fortnox_connected_at || null,
      last_synced_at: metadata?.fortnox_last_synced_at || null,
      token_expires_at: config?.fortnox_token_expires_at || null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
