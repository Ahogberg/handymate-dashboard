import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { verifyOwnership } from '@/lib/auth/verify-ownership'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { suggestMatch, type MatchedInvoice } from '@/lib/karin/supplier-invoice-match'

export const dynamic = 'force-dynamic'

/**
 * GET/PATCH /api/karin/supplier-invoices — matchningskön (Etapp 3
 * leverantörsfakturor). Fakturor importerade från Fortnox (eller manuellt
 * skapade) utan projektkoppling hamnar här. Ägaren väljer projekt +
 * leverantör; sparad rad lämnar kön (project_id blir icke-null) och syns
 * i projektets befintliga "Leverantörer"-flik.
 *
 * Samma ägare/admin-grind som karin/events — det här rör inköpspriser,
 * inte bara myndighetsdatum, och en anställd ska inte kunna koppla en
 * faktura mot vilket projekt som helst obevakat.
 */
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
    const { data, error } = await supabase
      .from('supplier_invoices')
      .select('id, supplier_name, invoice_number, invoice_date, due_date, total_amount, fortnox_supplier_invoice_number, created_at')
      .eq('business_id', business.business_id)
      .is('project_id', null)
      .order('invoice_date', { ascending: false, nullsFirst: false })

    if (error) throw error

    const queue = data || []

    // Matchningsförslag (2026-08-20, docs/superpowers/specs/
    // 2026-08-20-leverantorsfaktura-matchningsforslag-design.md): beräknat
    // från leverantörens egen historik. Tom kö → hoppa över historik-
    // frågan helt, ingen anledning att fråga i onödan.
    let queueWithSuggestions = queue.map(item => ({
      ...item,
      suggested_project_id: null as string | null,
      suggested_project_name: null as string | null,
      suggested_project_match_count: 0,
      suggested_subcontractor_id: null as string | null,
      suggested_subcontractor_name: null as string | null,
      suggested_subcontractor_match_count: 0,
    }))

    if (queue.length > 0) {
      const { data: matchedData, error: matchedError } = await supabase
        .from('supplier_invoices')
        .select('supplier_name, project_id, subcontractor_id')
        .eq('business_id', business.business_id)
        .not('project_id', 'is', null)

      if (matchedError) throw matchedError

      const matchedInvoices: MatchedInvoice[] = matchedData || []
      const suggestions = queue.map(item => suggestMatch(item.supplier_name || '', matchedInvoices))

      const projectIds = Array.from(new Set(suggestions.map(s => s.project_id).filter((id): id is string => !!id)))
      const subcontractorIds = Array.from(new Set(suggestions.map(s => s.subcontractor_id).filter((id): id is string => !!id)))

      const [projectNamesResult, subcontractorNamesResult] = await Promise.all([
        projectIds.length > 0
          ? supabase.from('project').select('project_id, name').in('project_id', projectIds)
          : Promise.resolve({ data: [] as { project_id: string; name: string }[] }),
        subcontractorIds.length > 0
          ? supabase.from('subcontractor').select('subcontractor_id, name').in('subcontractor_id', subcontractorIds)
          : Promise.resolve({ data: [] as { subcontractor_id: string; name: string }[] }),
      ])

      const projectNameById = new Map((projectNamesResult.data || []).map(p => [p.project_id, p.name]))
      const subcontractorNameById = new Map((subcontractorNamesResult.data || []).map(s => [s.subcontractor_id, s.name]))

      queueWithSuggestions = queue.map((item, i) => {
        const s = suggestions[i]
        return {
          ...item,
          suggested_project_id: s.project_id,
          suggested_project_name: s.project_id ? (projectNameById.get(s.project_id) ?? null) : null,
          suggested_project_match_count: s.project_match_count,
          suggested_subcontractor_id: s.subcontractor_id,
          suggested_subcontractor_name: s.subcontractor_id ? (subcontractorNameById.get(s.subcontractor_id) ?? null) : null,
          suggested_subcontractor_match_count: s.subcontractor_match_count,
        }
      })
    }

    return NextResponse.json({ queue: queueWithSuggestions })
  } catch (error: any) {
    console.error('Get karin supplier-invoice queue error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH — matchar en kö-rad mot ett projekt och (valfritt) en registrerad
 * underentreprenör eller fritext-leverantörsnamn.
 */
export async function PATCH(request: NextRequest) {
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
    const body = await request.json()
    const { id, project_id, subcontractor_id, supplier_name } = body

    if (!id || !project_id) {
      return NextResponse.json({ error: 'id och project_id krävs' }, { status: 400 })
    }

    // Cross-business-skydd, samma mönster som /api/supplier-invoices PATCH:
    // hindra att en kö-rad kopplas till en annan verksamhets projekt.
    const ownership = await verifyOwnership(supabase, business.business_id, [
      { table: 'project', idColumn: 'project_id', idValue: project_id, label: 'projekt' },
    ])
    if (!ownership.ok) {
      return NextResponse.json(
        { error: `Du har inte tillgång till: ${ownership.missing.join(', ')}` },
        { status: 403 },
      )
    }

    const updates: Record<string, any> = { project_id, updated_at: new Date().toISOString() }
    if (subcontractor_id !== undefined) updates.subcontractor_id = subcontractor_id
    if (supplier_name !== undefined && supplier_name.trim()) updates.supplier_name = supplier_name.trim()

    const { data: invoice, error } = await supabase
      .from('supplier_invoices')
      .update(updates)
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ invoice })
  } catch (error: any) {
    console.error('Patch karin supplier-invoice queue error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
