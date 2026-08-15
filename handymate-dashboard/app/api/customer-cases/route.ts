import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/permissions'
import { canActOnApproval, type ApprovalRoutingRow } from '@/lib/approvals/routing'
import { arTestdataApproval } from '@/lib/testdata'
import {
  CUSTOMER_CASE_APPROVAL_TYPES,
  hittaKundCase,
  kundReferensForApproval,
  type CustomerCaseResolvedApproval,
} from '@/lib/jarvis/customer-case'
import { hittaProjektCase, type CasebarApproval } from '@/lib/jarvis/project-case'

export const dynamic = 'force-dynamic'

type CaseApprovalRow = CasebarApproval & {
  package_data: Record<string, unknown> | null
}

/**
 * GET /api/customer-cases
 *
 * Ren läsmodell över väntande approvals. Kundkopplingen löses via en explicit
 * typallowlist, alla indirekta uppslag körs med service_role men är därför
 * själva tenantfiltrerade. Samma behörighetsfacit som huvudkön avgör vilka
 * signaler användaren får se.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()
    const { data: approvalRows, error: approvalError } = await supabase
      .from('pending_approvals')
      .select('*')
      .eq('business_id', business.business_id)
      .eq('status', 'pending')
      .in('approval_type', [...CUSTOMER_CASE_APPROVAL_TYPES])
    if (approvalError) throw approvalError

    const visibleRows = ((approvalRows || []) as ApprovalRoutingRow[])
      .filter(row => !arTestdataApproval(row as any))
    const permissions = await Promise.all(
      visibleRows.map(row => canActOnApproval(supabase, currentUser, row)),
    )
    const permittedRows: CaseApprovalRow[] = visibleRows
      .filter((_, index) => permissions[index])
      .map(row => ({
        id: (row as any).id,
        approval_type: (row as any).approval_type,
        title: (row as any).title,
        payload: ((row as any).payload || null) as Record<string, unknown> | null,
        package_data: ((row as any).package_data || null) as Record<string, unknown> | null,
      }))

    // Projektet äger delade signaler. Bara signal-id:n i ett faktiskt synligt
    // projekt-case (minst två distinkta typer) reserveras.
    const projectCases = hittaProjektCase(permittedRows)
    const projectOwnedApprovalIds = new Set(
      projectCases.flatMap(projectCase => projectCase.signals.map(signal => signal.approval_id)),
    )

    const references = permittedRows
      .map(row => ({ row, reference: kundReferensForApproval(row) }))
      .filter((entry): entry is { row: CaseApprovalRow; reference: NonNullable<typeof entry.reference> } => (
        entry.reference !== null
      ))

    const quoteIds = uniqueIds(references, 'quote')
    const invoiceIds = uniqueIds(references, 'invoice')
    const projectIds = uniqueIds(references, 'project')

    const [quoteLookup, invoiceLookup, projectLookup] = await Promise.all([
      quoteIds.length > 0
        ? supabase
            .from('quotes')
            .select('quote_id, customer_id')
            .eq('business_id', business.business_id)
            .in('quote_id', quoteIds)
        : Promise.resolve({ data: [], error: null }),
      invoiceIds.length > 0
        ? supabase
            .from('invoice')
            .select('invoice_id, customer_id')
            .eq('business_id', business.business_id)
            .in('invoice_id', invoiceIds)
        : Promise.resolve({ data: [], error: null }),
      projectIds.length > 0
        ? supabase
            .from('project')
            .select('project_id, customer_id')
            .eq('business_id', business.business_id)
            .in('project_id', projectIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    for (const lookup of [quoteLookup, invoiceLookup, projectLookup]) {
      if (lookup.error) throw lookup.error
    }

    const quoteCustomers = idToCustomer(quoteLookup.data, 'quote_id')
    const invoiceCustomers = idToCustomer(invoiceLookup.data, 'invoice_id')
    const projectCustomers = idToCustomer(projectLookup.data, 'project_id')
    const resolvedCustomerIds = new Set<string>()
    const customerIdByApproval = new Map<string, string>()

    for (const { row, reference } of references) {
      const customerId = reference.kind === 'customer'
        ? reference.id
        : reference.kind === 'quote'
          ? quoteCustomers.get(reference.id)
          : reference.kind === 'invoice'
            ? invoiceCustomers.get(reference.id)
            : projectCustomers.get(reference.id)
      if (!customerId) continue
      customerIdByApproval.set(row.id, customerId)
      resolvedCustomerIds.add(customerId)
    }

    const customerLookup = resolvedCustomerIds.size > 0
      ? await supabase
          .from('customer')
          .select('customer_id, name')
          .eq('business_id', business.business_id)
          .in('customer_id', Array.from(resolvedCustomerIds))
      : { data: [], error: null }
    if (customerLookup.error) throw customerLookup.error

    const customerNames = new Map<string, string | null>()
    for (const customer of customerLookup.data || []) {
      if (typeof customer.customer_id === 'string') {
        customerNames.set(
          customer.customer_id,
          typeof customer.name === 'string' ? customer.name : null,
        )
      }
    }

    // customerNames fungerar samtidigt som tenantbevis för direkt supplied
    // customer_id. En korrupt/främmande referens ger ingen rad och hoppas över.
    const resolvedRows: CustomerCaseResolvedApproval[] = permittedRows.flatMap(row => {
      const customerId = customerIdByApproval.get(row.id)
      if (!customerId || !customerNames.has(customerId)) return []
      return [{
        ...row,
        customer_id: customerId,
        customer_name: customerNames.get(customerId) ?? null,
      }]
    })

    const cases = hittaKundCase(resolvedRows, projectOwnedApprovalIds)
    return NextResponse.json({ cases })
  } catch (error: any) {
    console.error('GET /api/customer-cases error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function uniqueIds(
  entries: Array<{ reference: { kind: string; id: string } }>,
  kind: 'quote' | 'invoice' | 'project',
): string[] {
  return Array.from(new Set(
    entries.filter(entry => entry.reference.kind === kind).map(entry => entry.reference.id),
  ))
}

function idToCustomer(
  rows: Array<Record<string, unknown>> | null,
  idColumn: 'quote_id' | 'invoice_id' | 'project_id',
): Map<string, string> {
  const result = new Map<string, string>()
  for (const row of rows || []) {
    if (typeof row[idColumn] === 'string' && typeof row.customer_id === 'string') {
      result.set(row[idColumn] as string, row.customer_id)
    }
  }
  return result
}
