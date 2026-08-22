import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { deriveMoments, type ApprovalRow, type ObservationRow } from '@/lib/moments/derive'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET /api/moments — teamets fynd, härledda för de globala ytorna.
 *
 * Rutten SKAPAR ingenting: den läser öppna godkännandekort med belopp och
 * aktiva observationer, och kör den rena härledningen i lib/moments/derive.
 * All prioritering (vad som får avbryta) sker hos klienten via
 * lib/moments/interruption — servern vet inte vad som är sett.
 *
 * ═══ ROLLGRIND ═══
 *
 * Samma regel som /api/observations (2026-08-07): momenten bär ekonomi —
 * marginaler, förfallna fordringar, ofakturerat — och det är inget en
 * anställd ska se i förbifarten. Endast ägare/administratör.
 *
 * ═══ FAKTURABELOPPEN ═══
 *
 * invoice_reminder-kortet bär inte beloppet i payload; det slås upp här ur
 * fakturaraden med samma konvention som check-overdue:
 * rot_rut_type ? customer_pays : total. Beloppet läses ALDRIG ur
 * beskrivningstexten.
 */

/** Typerna med strukturerade belopp — de enda som blir moments. */
const MOMENT_APPROVAL_TYPES = [
  'missad_intakt',
  'profitability_warning',
  'invoice_reminder',
  'create_quote_draft',
] as const

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()

    const [approvalsRes, observationsRes] = await Promise.all([
      supabase
        .from('pending_approvals')
        .select('id, approval_type, title, description, payload, created_at')
        .eq('business_id', business.business_id)
        .eq('status', 'pending')
        .in('approval_type', [...MOMENT_APPROVAL_TYPES])
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('business_knowledge')
        .select('id, agent_id, title, observation, suggestion, related_approval_id, created_at')
        .eq('business_id', business.business_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    // Fel får inte bli en tyst tom lista — det är dagens genomgående felklass.
    if (approvalsRes.error) {
      console.error('[moments] kunde inte läsa godkännandekort:', approvalsRes.error.message)
      return NextResponse.json({ error: 'Kunde inte hämta fynden' }, { status: 500 })
    }
    if (observationsRes.error) {
      console.error('[moments] kunde inte läsa observationer:', observationsRes.error.message)
    }

    const approvals = (approvalsRes.data ?? []) as ApprovalRow[]
    const observations = (observationsRes.data ?? []) as ObservationRow[]

    // Fakturabelopp för invoice_reminder — en riktad uppslagning, inte en join
    // i huvudfrågan (payload->invoice_id går inte att joina i PostgREST).
    const invoiceIds = approvals
      .filter(a => a.approval_type === 'invoice_reminder')
      .map(a => (a.payload as Record<string, unknown> | null)?.invoice_id)
      .filter((v): v is string => typeof v === 'string')

    const invoiceAmounts: Record<string, number> = {}
    if (invoiceIds.length > 0) {
      const { data: invoices, error: invErr } = await supabase
        .from('invoice')
        .select('invoice_id, total, customer_pays, rot_rut_type')
        .eq('business_id', business.business_id)
        .in('invoice_id', invoiceIds)
      if (invErr) {
        // Beloppen är berikning, inte förutsättning — momentet visas utan
        // siffra hellre än att hela svaret faller.
        console.error('[moments] kunde inte läsa fakturabelopp:', invErr.message)
      }
      for (const inv of invoices ?? []) {
        const belopp = inv.rot_rut_type ? inv.customer_pays : inv.total
        if (typeof belopp === 'number' && belopp > 0) invoiceAmounts[inv.invoice_id] = belopp
      }
    }

    return NextResponse.json({
      moments: deriveMoments(approvals, observations, invoiceAmounts),
    })
  } catch (error) {
    console.error('[moments] oväntat fel:', error)
    return NextResponse.json({ error: 'Kunde inte hämta fynden' }, { status: 500 })
  }
}
