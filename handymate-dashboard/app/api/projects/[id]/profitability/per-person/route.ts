import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import {
  computePersonProfitability,
  type InvoiceItemForPersonProfitability,
  type MemberForPersonProfitability,
  type TimeEntryForPersonProfitability,
} from '@/lib/projects/compute-person-profitability'
// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache och servera fel företags data
// (2026-08-22-klassen, se CLAUDE.md; residualsvep 2026-08-31).
export const dynamic = 'force-dynamic'


/**
 * GET /api/projects/[id]/profitability/per-person
 *
 * R4-E (tasks/resurs-masterplan.md) — Lönsamhet per person. Medvetet
 * ENDAST owner/admin: internal_hourly_cost är lönekostnadsdata (samma
 * känslighetsnivå som app/api/team/route.ts strippar för icke-owner/admin,
 * se canSeeInternalCosts-mönstret där). Rollkontrollen görs HÄR server-
 * side, inte bara döljd i UI:t — matchar principen i PUT /api/bookings
 * (R2:s rollskydd på assigned_user_id).
 *
 * Ren beräkning i lib/projects/compute-person-profitability.ts — denna
 * route är en tunn hämta-och-gruppera-omslag.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare/admin kan se lönsamhet per person' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const projectId = params.id

    const { data: project } = await supabase
      .from('project')
      .select('project_id')
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Alla fakturor för projektet — items är ett JSONB-fält (invoice_overhaul.sql),
    // ingen egen fakturarad-tabell. Samma "fakturerat" -definition som
    // computeProjectEconomics (alla statusar, inte bara betalda).
    const { data: invoicesData } = await supabase
      .from('invoice')
      .select('items')
      .eq('business_id', business.business_id)
      .eq('project_id', projectId)

    const invoiceItems: InvoiceItemForPersonProfitability[] = []
    for (const inv of (invoicesData || []) as Array<{ items: any[] | null }>) {
      for (const item of inv.items || []) {
        if (item?.business_user_id) {
          invoiceItems.push({ business_user_id: item.business_user_id, total: Number(item.total || 0) })
        }
      }
    }

    // Time entries för projektet — timmar per person (oavsett fakturerad
    // status), samma källtabell/filter som computeProjectEconomics.
    const { data: timeData } = await supabase
      .from('time_entry')
      .select('business_user_id, duration_minutes')
      .eq('business_id', business.business_id)
      .eq('project_id', projectId)

    const timeEntries = (timeData || []) as TimeEntryForPersonProfitability[]

    // Batch-hämta medlemmar för alla business_user_id som förekommer på
    // fakturarader (personmängden — se docstring i compute-person-
    // profitability.ts) + de som bara har timrader, så namn/färg alltid
    // kan slås upp om de skulle dyka upp i framtida rader.
    const memberIds = new Set<string>()
    for (const item of invoiceItems) if (item.business_user_id) memberIds.add(item.business_user_id)
    for (const entry of timeEntries) if (entry.business_user_id) memberIds.add(entry.business_user_id)

    let members: MemberForPersonProfitability[] = []
    if (memberIds.size > 0) {
      const { data: membersData } = await supabase
        .from('business_users')
        .select('id, name, color, internal_hourly_cost')
        .in('id', Array.from(memberIds))
      members = (membersData || []) as MemberForPersonProfitability[]
    }

    const { data: configData } = await supabase
      .from('business_config')
      .select('default_internal_hourly_cost')
      .eq('business_id', business.business_id)
      .maybeSingle()
    const defaultInternalHourlyCost = configData?.default_internal_hourly_cost ?? null

    const rows = computePersonProfitability(invoiceItems, timeEntries, members, defaultInternalHourlyCost)

    return NextResponse.json({ rows })
  } catch (error: any) {
    console.error('Get per-person profitability error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
