import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { sweepMissedRevenue } from '@/lib/value/missed-revenue'
import { OPEN_QUOTE_STATUSES } from '@/lib/quotes/statuses'
import { buildPengarSummary, type OverdueInvoice, type StaleQuote } from '@/lib/value/pengar-pa-bordet'
import { arTestId, arTestNamn } from '@/lib/testdata'

/**
 * GET /api/dashboard/pengar — "var ligger pengarna ni riskerar att missa?"
 *
 * Läser fem befintliga källor och kör den rena sammanställningen i
 * lib/value/pengar-pa-bordet. Ingen källa är ny: offerterna följer
 * uppföljningscadencens regel, ofakturerat kommer ur samma rena svep som
 * nattcronen (med tom dedupe — sidan visar ALLT på bordet, inte bara det
 * som ännu inte blivit kort), förfallet följer check-overdues
 * beloppskonvention.
 *
 * Rollgrind som observations/moments: detta är ekonomi, ägare/admin.
 */

const STALE_QUOTE_DAYS = 5 // default-cadencen i quote-follow-up

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id
    const nu = new Date()
    const staleGrans = new Date(nu.getTime() - STALE_QUOTE_DAYS * 86_400_000).toISOString()
    const idag = nu.toISOString().split('T')[0]

    const [quotesRes, atasRes, matsRes, projRes, invRes, overdueRes, marginRes, ataDraftRes] = await Promise.all([
      supabase
        .from('quotes')
        // `title` läses ENBART för testdata-filtret nedan — e2e-offerten
        // heter "E2E Test — …" och skulle annars räknas som riktiga pengar.
        .select('total, sent_at, title')
        .eq('business_id', businessId)
        .in('status', [...OPEN_QUOTE_STATUSES])
        .lt('sent_at', staleGrans),
      // Samma fyra läsningar som cron/missed-revenue — inklusive aliasen
      // (PK heter change_id/material_id; utan alias 42703:ar hela frågan).
      supabase
        .from('project_change')
        .select('id:change_id, project_id, change_type, description, amount, signed_at, invoice_id, invoiced_at')
        .eq('business_id', businessId)
        .not('signed_at', 'is', null)
        .is('invoiced_at', null),
      supabase
        .from('project_material')
        .select('id:material_id, project_id, total_sell, invoiced, invoice_id')
        .eq('business_id', businessId)
        .eq('invoiced', false),
      supabase
        .from('project')
        .select('project_id, name, project_type, status, completed_at')
        .eq('business_id', businessId)
        .eq('status', 'completed'),
      supabase
        .from('invoice')
        .select('project_id')
        .eq('business_id', businessId)
        .not('project_id', 'is', null),
      supabase
        .from('invoice')
        // `invoice_id` läses ENBART för testdata-filtret — e2e-fakturor
        // prefixas 'e2e_inv_' och ska inte synas som förfallna fordringar.
        .select('invoice_id, total, customer_pays, rot_rut_type')
        .eq('business_id', businessId)
        .in('status', ['sent', 'overdue'])
        .lt('due_date', idag),
      supabase
        .from('pending_approvals')
        .select('payload')
        .eq('business_id', businessId)
        .eq('approval_type', 'profitability_warning')
        .eq('status', 'pending'),
      supabase
        .from('pending_approvals')
        .select('payload')
        .eq('business_id', businessId)
        .eq('approval_type', 'create_ata_draft')
        .eq('status', 'pending'),
    ])

    // En fallerad läsning får inte bli en tyst tom kategori — sidan skulle
    // då säga "inga pengar på bordet" när sanningen är "kunde inte titta".
    for (const [namn, res] of Object.entries({
      offerter: quotesRes, ata: atasRes, material: matsRes, projekt: projRes,
      fakturor: invRes, förfallet: overdueRes, marginal: marginRes, ataUtkast: ataDraftRes,
    })) {
      if (res.error) {
        console.error(`[pengar] läsningen av ${namn} misslyckades:`, res.error.message)
        return NextResponse.json({ error: 'Kunde inte räkna ihop just nu' }, { status: 500 })
      }
    }

    // Testdata-filter (2026-08-10): e2e-rader räknas aldrig som pengar på
    // bordet. Testprojekt filtreras FÖRE svepet — ÄTA/material på dem faller
    // då automatiskt (svepets regler kräver att projektet finns i kartan).
    const riktigaProjekt = (projRes.data ?? []).filter(
      (p: any) => !arTestId(p.project_id) && !arTestNamn(p.name),
    )
    const riktigaOfferter = (quotesRes.data ?? []).filter((q: any) => !arTestNamn(q.title))
    const riktigaForfallna = (overdueRes.data ?? []).filter((i: any) => !arTestId(i.invoice_id))

    const missedRevenue = sweepMissedRevenue({
      atas: (atasRes.data ?? []) as any,
      materials: (matsRes.data ?? []) as any,
      projects: riktigaProjekt as any,
      invoices: (invRes.data ?? []) as any,
      // Tom dedupe med flit: sidan svarar på "vad ligger på bordet TOTALT",
      // inte "vad har ännu inte blivit ett kort".
      alreadyReported: new Set(),
      now: nu,
    })

    const overrun = (p: unknown): number => {
      const v = (p as Record<string, unknown> | null)?.projected_overrun
      return typeof v === 'number' ? v : 0
    }
    const estimate = (p: unknown): number => {
      const v = (p as Record<string, unknown> | null)?.amount_estimate
      return typeof v === 'number' ? v : 0
    }

    return NextResponse.json(
      buildPengarSummary({
        staleQuotes: riktigaOfferter as StaleQuote[],
        missedRevenue,
        overdueInvoices: riktigaForfallna as OverdueInvoice[],
        marginOverruns: (marginRes.data ?? []).map(r => overrun(r.payload)),
        ataEstimates: (ataDraftRes.data ?? []).map(r => estimate(r.payload)),
      }),
    )
  } catch (error) {
    console.error('[pengar] oväntat fel:', error)
    return NextResponse.json({ error: 'Kunde inte räkna ihop just nu' }, { status: 500 })
  }
}
