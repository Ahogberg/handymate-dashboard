import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { canActOnApproval, type ApprovalRoutingRow } from '@/lib/approvals/routing'
import { arTestdataApproval } from '@/lib/testdata'
import { internalPushHeaders } from '@/lib/notifications/push-internal'

export const dynamic = 'force-dynamic'

/**
 * GET /api/approvals — List pending approvals
 * POST /api/approvals — Create a new approval request
 */

// Statusarna som räknas som "hanterade" — motsvarar activeTab==='resolved'
// i app/dashboard/approvals/page.tsx (Etapp 3a, migrerad från direkt
// Supabase-query till denna route).
const RESOLVED_STATUSES = ['approved', 'rejected', 'expired', 'auto_approved']

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Etapp 3a (multi-employee-parity-plan.md): denna route hade ingen
    // identitets-/routing-koll alls tidigare (och användes inte av någon
    // klient) — nu grunden för att de tre dashboard-ytorna (approvals/
    // page.tsx, IdagCore.tsx, ProjectApprovalsBlock.tsx) hämtar härifrån
    // istället för direkt Supabase-query med anon-key.
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const status = request.nextUrl.searchParams.get('status') || 'pending'
    const approvalType = request.nextUrl.searchParams.get('approval_type')
    const recordingId = request.nextUrl.searchParams.get('recording_id')
    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 0, 1), 200) : 100

    let query = supabase
      .from('pending_approvals')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })
      .limit(limit)

    // status=resolved är en samlingsterm för "inte längre pending" — samma
    // statusuppsättning som approvals/page.tsx tidigare frågade direkt mot
    // Supabase med .in('status', [...]) för sin "Hanterade"-flik.
    if (status === 'resolved') {
      query = query.in('status', RESOLVED_STATUSES)
    } else if (status === 'execution_failed') {
      // Fas 0-härdning (exec-chain-arvet): pseudo-status för godkända rader
      // vars exekvering misslyckades. Utan denna vy är ett fel som klienten
      // missade (mobilkrasch, stängd flik) osynligt för alltid — raden är
      // 'approved' och syns inte i någon kö. 'retrying' tas med: en
      // strandad omkörning (server dog) ska också gå att se och köra om
      // (retry-endpointen släpper igenom den efter 10 min).
      const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      query = query
        .eq('status', 'approved')
        .in('payload->execution_result->>outcome', ['failed', 'retrying'])
        .gte('resolved_at', sevenDaysAgoIso)
    } else {
      query = query.eq('status', status)
    }

    if (approvalType) {
      query = query.eq('approval_type', approvalType)
    }
    if (recordingId) query = query.contains('payload', { recording_id: recordingId })

    const { data, error } = await query

    if (error) throw error

    // Routing-filter (Etapp 3a): hämta behörigheter EN gång (currentUser
    // ovan) och filtrera listan i minnet — inte N DB-anrop per approval.
    // canActOnApproval kortsluter till `true` direkt för 'any'-bucketen
    // (idag alla rader, se lib/approvals/routing.ts) så detta är i
    // praktiken en no-op tills Etapp 3b börjar sätta specifika buckets.
    // Testdata-filter (2026-08-10): e2e-flödena skriver riktiga rader i
    // pending_approvals, och de har bevisligen nått hemskärmen. Gömda vid
    // läsning — aldrig raderade härifrån (lib/testdata.ts).
    const rows = ((data || []) as ApprovalRoutingRow[])
      .filter((row) => !arTestdataApproval(row as any))
    const permits = await Promise.all(rows.map((row) => canActOnApproval(supabase, currentUser, row)))
    const visible = rows.filter((_, i) => permits[i])

    return NextResponse.json({ approvals: visible })
  } catch (error: any) {
    console.error('GET /api/approvals error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { approval_type, title, description, payload, agent_run_id } = body

    if (!approval_type || !title) {
      return NextResponse.json({ error: 'Missing approval_type or title' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const { data, error } = await supabase
      .from('pending_approvals')
      .insert({
        id,
        business_id: business.business_id,
        agent_run_id: agent_run_id || null,
        approval_type,
        title,
        description: description || null,
        payload: payload || {},
        status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    // Send push notification (fire and forget). OBS: fetch() är inte await:ad,
    // så ett synkront try/catch fångar aldrig ett nätverksfel (promisen avvisas
    // asynkront) — .catch() på promisen krävs för att felet faktiskt loggas.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    fetch(`${appUrl}/api/push/send`, {
      method: 'POST',
      headers: internalPushHeaders(),
      body: JSON.stringify({
        business_id: business.business_id,
        title: 'Nytt att godkänna',
        body: title,
        url: '/dashboard/approvals',
      }),
    }).catch((err) => {
      console.error('[POST /api/approvals] push notification failed (non-blocking):', business.business_id, id, err)
    })

    return NextResponse.json({ approval: data }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/approvals error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
