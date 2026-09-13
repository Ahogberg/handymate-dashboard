import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { canActOnApproval, type ApprovalRoutingRow } from '@/lib/approvals/routing'
import { approvalDisplay } from '@/lib/jarvis/approval-view'
import { arTestdataApproval } from '@/lib/testdata'
import { CUSTOMER_CASE_APPROVAL_TYPES, kundReferensForApproval, type CustomerReference } from '@/lib/jarvis/customer-case'

export const dynamic = 'force-dynamic'
const DETAIL_TYPES = [...CUSTOMER_CASE_APPROVAL_TYPES, 'send_sms', 'send_email', 'customer_fact'] as const

function detailReference(row: any): CustomerReference | null {
  const existing = kundReferensForApproval(row)
  if (existing) return existing
  if (row.approval_type === 'customer_fact') return reference('customer', row.payload?.customer_id)
  if (row.approval_type === 'send_sms' || row.approval_type === 'send_email') {
    // Current producers use customer_id and/or project_id. Contradictory
    // references are resolved below and rejected rather than guessed.
    return reference('project', row.payload?.project_id) || reference('customer', row.payload?.customer_id)
  }
  return null
}
function reference(kind: CustomerReference['kind'], id: unknown): CustomerReference | null {
  return typeof id === 'string' && id.trim() ? { kind, id } : null
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id: customerId } = await params
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getCurrentUser(request, business.business_id)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = getServerSupabase()
  const customer = await db.from('customer').select('customer_id').eq('business_id', business.business_id).eq('customer_id', customerId).maybeSingle()
  if (customer.error) return NextResponse.json({ error: 'Besluten kunde inte läsas.' }, { status: 503 })
  if (!customer.data) return NextResponse.json({ error: 'Kunden hittades inte.' }, { status: 404 })
  const allRows: ApprovalRoutingRow[] = []
  for (let offset = 0; ; offset += 500) {
    const result = await db.from('pending_approvals').select('*').eq('business_id', business.business_id).eq('status', 'pending')
      .or(`snoozed_until.is.null,snoozed_until.lt.${new Date().toISOString()}`)
      .in('approval_type', [...DETAIL_TYPES]).order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 499)
    if (result.error) return NextResponse.json({ error: 'Besluten kunde inte läsas.' }, { status: 503 })
    allRows.push(...((result.data || []) as ApprovalRoutingRow[]))
    if ((result.data || []).length < 500) break
    if (offset >= 99500) return NextResponse.json({ error: 'Beslutslistan är för stor för att bekräftas.' }, { status: 503 })
  }
  const candidates = allRows.filter(row => !arTestdataApproval(row as any))
  const refs = candidates.map(row => ({ row, ref: detailReference(row) })).filter(entry => entry.ref) as { row: ApprovalRoutingRow; ref: CustomerReference }[]
  const ids = (kind: CustomerReference['kind']) => Array.from(new Set(refs.filter(x => x.ref.kind === kind).map(x => x.ref.id)))
  const [quotes, invoices, projects] = await Promise.all([
    lookup(db, 'quotes', 'quote_id', ids('quote'), business.business_id), lookup(db, 'invoice', 'invoice_id', ids('invoice'), business.business_id), lookup(db, 'project', 'project_id', ids('project'), business.business_id),
  ])
  if (quotes.error || invoices.error || projects.error) return NextResponse.json({ error: 'Besluten kunde inte läsas.' }, { status: 503 })
  const maps: any = { quote: relationMap(quotes.data, 'quote_id'), invoice: relationMap(invoices.data, 'invoice_id'), project: relationMap(projects.data, 'project_id') }
  const matching = refs.filter(({ row, ref }) => {
    const resolved = ref.kind === 'customer' ? ref.id : maps[ref.kind].get(ref.id)
    const direct = typeof (row as any).payload?.customer_id === 'string' ? (row as any).payload.customer_id : null
    return resolved === customerId && (!direct || direct === customerId)
  }).map(x => x.row)
  const permits = await Promise.all(matching.map(row => canActOnApproval(db, user, row)))
  const visible = matching.filter((_, i) => permits[i])
  return NextResponse.json({ approvals: visible.slice(0, 3).map(row => ({ id: (row as any).id, title: (row as any).title, created_at: (row as any).created_at, display: approvalDisplay(row as any) })), has_more: visible.length > 3 }, { headers: { 'Cache-Control': 'no-store' } })
}
async function lookup(db: any, table: string, key: string, ids: string[], businessId: string) {
  const data: any[] = []
  for (let start = 0; start < ids.length; start += 200) {
    const result = await db.from(table).select(`${key}, customer_id`).eq('business_id', businessId).in(key, ids.slice(start, start + 200))
    if (result.error) return { data: [], error: result.error }
    data.push(...(result.data || []))
  }
  return { data, error: null }
}
function relationMap(rows: any[] | null, key: string) { return new Map((rows || []).filter(row => typeof row.customer_id === 'string').map(row => [row[key], row.customer_id])) }
