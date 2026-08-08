import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, getAdminSupabase } from '@/lib/admin-auth'
import { recordCost } from '@/lib/costs/record'
import { PRICE_VERSION, currentPriceList } from '@/lib/costs/price-list'
import { smsPartCount, smsCostOre } from '@/lib/costs/meter'

/**
 * GET /api/admin/cost-probe — hälsokoll för COGS-mätaren.
 *
 * ═══ VARFÖR DEN BEHÖVS ═══
 *
 * recordCost är medvetet FAIL-SOFT: den kastar aldrig och sväljer sina fel,
 * för en mätare får inte fälla det den mäter. Priset för det är att en trasig
 * mätare är TYST. Saknas migrationen, är RLS fel, eller heter en kolumn något
 * annat — då händer ingenting alls, och man upptäcker det först när någon
 * undrar varför kostnadsrapporten är tom en månad senare.
 *
 * Vanliga vägar att testa mätaren duger inte:
 *   - SMS kräver saldo hos 46elks; utan saldo failar utskicket, och då ska
 *     ingen kostnad bokföras (bara lyckade utskick kostar).
 *   - Agentkörningen hoppar över sig själv vid för lite data
 *     ("insufficient_data") och gör då inget modellanrop att bokföra.
 *   - Whisper kräver en inkommande inspelning.
 *
 * Sonden skriver därför en egen rad med kostnad NOLL och läser tillbaka den.
 * Noll öre gör raden ofarlig i rapporten; ref_type='probe' gör den
 * identifierbar. Att den läses TILLBAKA är hela poängen — recordCost:s
 * returvärde säger ingenting, eftersom den sväljer.
 *
 * Svaret innehåller också vad prislistan säger just nu, så en felaktig
 * prisversion syns här i stället för i en marginalrapport långt senare.
 */
export async function GET(request: NextRequest) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck.isAdmin) {
    return NextResponse.json(
      { error: 'Unauthorized - Admin access required' },
      { status: 403 }
    )
  }

  const url = new URL(request.url)
  const businessId = url.searchParams.get('business_id') || 'probe'

  const supabase = getAdminSupabase()
  const märke = `probe_${Date.now()}`

  await recordCost({
    supabase,
    businessId,
    // 'probe' ligger utanför CostResource med flit — report.ts itererar bara
    // över de fyra riktiga slagen, så sondens rader kan aldrig förorena en
    // kostnadsrapport hur många gånger den än körs.
    resource: 'probe',
    units: 0,
    costOre: 0,
    refType: 'probe',
    refId: märke,
    meta: { probe: true },
  })

  // Läs tillbaka. Skrev inte recordCost är raden inte här — och DÅ vet vi.
  const { data, error } = await supabase
    .from('cost_event')
    .select('id, business_id, resource, units, cost_ore, price_version, created_at')
    .eq('ref_type', 'probe')
    .eq('ref_id', märke)
    .maybeSingle()

  const p = currentPriceList()

  // Ett exempel som visar delräkningen i praktiken: samma text med och utan
  // emoji ska ge olika antal delar. Rena funktioner, ingen DB.
  const utanEmoji = 'a'.repeat(100)
  const medEmoji = utanEmoji + '😊'

  return NextResponse.json({
    matare_fungerar: !!data,
    ...(data
      ? { skriven_rad: data }
      : {
          fel: error?.message || 'Raden kunde inte läsas tillbaka.',
          trolig_orsak:
            'Kör sql/v100_cogs_matare.sql i Supabase SQL Editor. Är den körd, ' +
            'kontrollera att cost_event har en service_role-policy.',
        }),
    prislista: {
      version: PRICE_VERSION,
      sms_per_del_ore: p.sms_part_ore,
      samtal_mobil_ore_per_min: p.call_mobile_ore_per_min,
      nummerhyra_ore_per_man: p.number_rental_ore_per_month,
      usd_kurs_ore: p.usd_ore,
    },
    delrakning_exempel: {
      utan_emoji: { tecken: utanEmoji.length, delar: smsPartCount(utanEmoji), ore: smsCostOre(utanEmoji) },
      med_emoji: { tecken: medEmoji.length, delar: smsPartCount(medEmoji), ore: smsCostOre(medEmoji) },
      kommentar:
        'Samma text plus en emoji tvingar UCS-2 (70 tecken per del i stället ' +
        'för 160) och dubblar kostnaden. Det var osynligt före mätaren.',
    },
  })
}
