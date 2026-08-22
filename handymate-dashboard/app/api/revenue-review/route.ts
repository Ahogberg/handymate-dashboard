import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * Revenue Review V1 — läsytan (X1b, 2026-08-09).
 *
 * Roadmapens observabilitetskrav ordagrant: identifierad, granskad,
 * avfärdad (med orsak), utkast — som SEPARATA tal. "Återvunnen SEK"
 * rapporteras aldrig som detektorns belopp: drafted_amount_kr är vad
 * hantverkaren faktiskt lät bli ett utkast, inte vad svepet påstod.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // Intäktsfynd är ekonomi.
    const currentUser = await getCurrentUser(request)
    if (currentUser && !hasPermission(currentUser, 'see_financials')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const { data: kort } = await supabase
      .from('pending_approvals')
      .select('id, status, title, created_at, resolved_at, payload')
      .eq('business_id', business.business_id)
      .eq('approval_type', 'missad_intakt')
      .order('created_at', { ascending: false })
      .limit(200)

    const alla = kort || []
    const p = (k: any) => (k.payload || {}) as Record<string, any>

    const identifierade = alla.filter(k => k.status === 'pending')
    const utkast = alla.filter(k => k.status === 'approved' && p(k).draft_invoice_id)
    const avfardade = alla.filter(k => k.status === 'rejected' && !p(k).auto_stale)
    const inaktuella = alla.filter(k => k.status === 'rejected' && p(k).auto_stale === true)

    return NextResponse.json({
      counts: {
        identifierade: identifierade.length,
        utkast: utkast.length,
        avfardade: avfardade.length,
        inaktuella: inaktuella.length,
        // Summan hantverkaren faktiskt gjorde utkast av — ALDRIG svepets
        // identifierade potential.
        utkast_kr: utkast.reduce((s, k) => s + (Number(p(k).drafted_amount_kr) || 0), 0),
      },
      identifierade: identifierade.map(k => ({
        id: k.id,
        title: k.title,
        created_at: k.created_at,
        kind: p(k).kind,
        project_name: p(k).project_name,
        amount_kr: p(k).amount_kr,
        confidence: p(k).confidence,
        recommended_action: p(k).recommended_action,
        evidence: p(k).evidence,
        preview: p(k).preview || null,
      })),
      avfardade: avfardade.slice(0, 20).map(k => ({
        id: k.id,
        title: k.title,
        reason: p(k).dismissal_reason || null,
        resolved_at: k.resolved_at,
      })),
    })
  } catch (error: any) {
    console.error('[revenue-review GET] error:', error)
    return NextResponse.json({ error: error?.message || 'Något gick fel' }, { status: 500 })
  }
}
