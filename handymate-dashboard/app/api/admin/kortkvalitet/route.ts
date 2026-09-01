import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, getAdminSupabase } from '@/lib/admin-auth'
import {
  bedomBrusgrind,
  summeraKort,
  BRUSGRINDADE_TYPER,
  KORTKVALITET_MIN_SAMPLE,
  KORTKVALITET_BRUS_EXPIRED_PCT,
  KORTKVALITET_PAUS_DAGAR,
  type KortRad,
} from '@/lib/approvals/kortkvalitet'

export const dynamic = 'force-dynamic'

const DAYS_DEFAULT = 30
const DAYS_MAX = 180
const ROW_CAP = 20000

/**
 * GET /api/admin/kortkvalitet?days=30
 *
 * Plattformsinstrument (samma isAdmin-idiom och plattformskänslighet som
 * admin/mandate-maturity och admin/ask-coverage — läser ÖVER ALLA FÖRETAG,
 * därför medvetet utanför tests/permission-contract.spec.ts:s tenant-karta).
 *
 * Svarar med räknade fakta per korttyp och per företag+typ (skapade /
 * godkända / avvisade / utgångna / väntande, andel utgångna, bedömning
 * signal/brus/för få) samt brusgrindens nuvarande beslut per företag och
 * brusgrindad typ. Inget här ändrar något — det bedömer och redovisar.
 */
export async function GET(request: NextRequest) {
  try {
    const adminCheck = await isAdmin(request)
    if (!adminCheck.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized - Admin access required' }, { status: 403 })
    }

    const daysRaw = Number(new URL(request.url).searchParams.get('days'))
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(DAYS_MAX, Math.round(daysRaw)) : DAYS_DEFAULT
    const since = new Date(Date.now() - days * 86_400_000).toISOString()
    const nowIso = new Date().toISOString()

    const supabase = getAdminSupabase()

    const [{ data: rows, error: rowsErr }, { data: businesses, error: bizErr }] = await Promise.all([
      supabase
        .from('pending_approvals')
        .select('business_id, approval_type, status, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(ROW_CAP),
      supabase.from('business_config').select('business_id, business_name'),
    ])
    if (rowsErr) throw rowsErr
    if (bizErr) throw bizErr

    const kort = (rows || []) as KortRad[]
    const namn = new Map<string, string>()
    for (const b of (businesses || []) as Array<{ business_id: string; business_name: string | null }>) {
      namn.set(b.business_id, b.business_name || b.business_id)
    }
    const demoBusinessId = process.env.DEMO_BUSINESS_ID || null

    const rapport = summeraKort(kort)

    // Brusgrindens läge per företag × grindad typ, ur samma rader (nyast först).
    const perForetag = new Map<string, KortRad[]>()
    for (const r of kort) {
      const list = perForetag.get(r.business_id) || []
      list.push(r)
      perForetag.set(r.business_id, list)
    }
    const brusgrind: Array<{
      business_id: string
      business_name: string
      is_demo: boolean
      approval_type: string
      tysta: boolean
      skal: string
      oppnar_igen: string | null
      underlag: ReturnType<typeof bedomBrusgrind>['underlag']
    }> = []
    for (const [businessId, list] of Array.from(perForetag.entries())) {
      for (const typ of BRUSGRINDADE_TYPER) {
        const egna = list.filter(r => r.approval_type === typ)
        if (egna.length === 0) continue
        const beslut = bedomBrusgrind(egna, nowIso)
        brusgrind.push({
          business_id: businessId,
          business_name: namn.get(businessId) || businessId,
          is_demo: demoBusinessId !== null && businessId === demoBusinessId,
          approval_type: typ,
          tysta: beslut.tysta,
          skal: beslut.skal,
          oppnar_igen: beslut.oppnar_igen ?? null,
          underlag: beslut.underlag,
        })
      }
    }
    brusgrind.sort((a, b) => Number(b.tysta) - Number(a.tysta) || b.underlag.avgjorda - a.underlag.avgjorda)

    return NextResponse.json({
      days,
      since,
      rows_scanned: kort.length,
      row_cap_hit: kort.length >= ROW_CAP,
      totalt: rapport.totalt,
      per_typ: rapport.per_typ,
      per_foretag_typ: rapport.per_foretag_typ.map(r => ({
        ...r,
        business_name: namn.get(r.business_id) || r.business_id,
        is_demo: demoBusinessId !== null && r.business_id === demoBusinessId,
      })),
      brusgrind,
      konstanter: {
        min_sample: KORTKVALITET_MIN_SAMPLE,
        brus_expired_pct: KORTKVALITET_BRUS_EXPIRED_PCT,
        paus_dagar: KORTKVALITET_PAUS_DAGAR,
        brusgrindade_typer: BRUSGRINDADE_TYPER,
      },
      note:
        'Räknade fakta per typ och företag inom fönstret — aldrig ett kausalitetspåstående. ' +
        'Brusgrinden gäller bara typerna i brusgrindade_typer och bedöms ur de senaste avgjorda korten.',
    })
  } catch (error: any) {
    console.error('[admin/kortkvalitet] error:', error)
    return NextResponse.json({ error: error?.message || 'Kunde inte läsa kortkvaliteten' }, { status: 500 })
  }
}
