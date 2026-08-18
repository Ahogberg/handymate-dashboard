import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, getAdminSupabase } from '@/lib/admin-auth'
import { bedomTypMognad, type TypeMaturity } from '@/lib/mandates/type-maturity'
import { loadPlatformTypeMaturity } from '@/lib/mandates/platform-maturity'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/mandate-maturity
 *
 * Etapp Y, kvantifierad grind (Mission Mandates V1,
 * tasks/jaunty-pondering-hummingbird.md) — internt instrument, samma
 * isAdmin-idiom och plattformskänslighet som admin/ask-coverage (Etapp L):
 * gated på @handymate.se-epost/ADMIN_EMAILS, INTE på företagets ägar-/admin-
 * roll inom en enskild tenant — instrumentet läser ÖVER ALLA FÖRETAG, ingen
 * enskild tenant äger den här datan. Registreras därför MEDVETET utanför
 * tests/permission-contract.spec.ts:s SENSITIVE_ROUTES-karta, precis som
 * ask-coverage — den kartan gäller tenant-scoped ägar-/adminrutter, inte
 * plattformsövergripande admin-instrument.
 *
 * Svarar per åtgärdstyp med det räknade underlaget
 * (lib/mandates/platform-maturity.ts, aggregerat via lib/mandates/
 * mandate-facit.ts:s byggMandateFacit) OCH bedomTypMognad-resultatet
 * (lib/mandates/type-maturity.ts) — mogen/omogen mot namngivna konstanter,
 * aldrig magkänsla.
 *
 * mogen=true är BEVISET, inte beslutet: att faktiskt öppna en ny typ för
 * fler mandat kräver TRE lås tillsammans — mogen=true, Andreas uttryckliga
 * godkännande, och en migration som vidgar mission_mandate.
 * allowed_action_types CHECK-begränsningen (sql/v150_mission_mandate.sql).
 * Den här rutten öppnar ingenting själv — den bedömer och redovisar.
 */
export async function GET(request: NextRequest) {
  try {
    const adminCheck = await isAdmin(request)
    if (!adminCheck.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const supabase = getAdminSupabase()
    const nowIso = new Date().toISOString()
    const platform = await loadPlatformTypeMaturity(supabase)

    const per_type = platform.per_type.map(underlag => {
      const maturity: TypeMaturity = bedomTypMognad({
        action_type: underlag.action_type,
        utforda: underlag.utforda,
        leveransfel: underlag.leveransfel,
        stopp_inom_7d: underlag.stopp_inom_7d,
        sakerhets_aterkallelser: underlag.aterkallelser,
        forsta_utford_iso: underlag.forsta_utford,
        nowIso,
      })
      return {
        maturity,
        underlag: {
          utforda: underlag.utforda,
          leveransfel: underlag.leveransfel,
          stopp: underlag.stopp_inom_7d,
          ej_bedombart: underlag.ej_bedombart,
          aterkallelser: underlag.aterkallelser,
          forsta_utford: underlag.forsta_utford,
        },
      }
    })

    return NextResponse.json({
      per_type,
      mandates_scanned: platform.mandates_scanned,
      mandates_capped: platform.mandates_capped,
      note:
        'mogen=true är beviset, inte beslutet. Att öppna en typ för fler mandat kräver ' +
        'dessutom Andreas uttryckliga godkännande och en migration som vidgar CHECK-' +
        'begränsningen i mission_mandate.allowed_action_types — mognad ensam öppnar ingenting.',
    })
  } catch (error: any) {
    console.error('[admin/mandate-maturity] error:', error)
    return NextResponse.json({ error: error?.message || 'Kunde inte läsa mandatmognaden' }, { status: 500 })
  }
}
