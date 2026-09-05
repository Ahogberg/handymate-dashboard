import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { activatePlan, createPlanInvoice, loadPlan, paymentPlanEnabled, planState } from '@/lib/invoices/payment-plan/service'
import { makeSnapshot } from '@/lib/invoices/payment-plan/calculations'
export const dynamic = 'force-dynamic'
async function handle(request: NextRequest, projectId: string, write: boolean) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!paymentPlanEnabled()) return NextResponse.json({ error: 'Betalplansfakturering är inte aktiverad' }, { status: 404 })
  const user = await getCurrentUser(request)
  if (!user || !hasPermission(user, 'create_invoices')) return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
  const db = getServerSupabase()
  try {
    if (write) {
      const body = await request.json()
      if (body.action === 'activate') return NextResponse.json({ plan: await activatePlan(db, business.business_id, projectId) })
      if (body.action === 'invoice') return NextResponse.json({ invoice: await createPlanInvoice(db, business.business_id, projectId, body.step) })
      if (body.action === 'work_completed') {
        const date = body.date
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date || date > new Date().toISOString().slice(0,10)) throw new Error('Ange ett giltigt datum när arbetet var utfört')
        const plan = await loadPlan(db, business.business_id, projectId)
        if (!plan) throw new Error('Betalplan saknas')
        const { data, error } = await db.from('invoice').update({ payment_plan_work_completed_on: date }).eq('business_id', business.business_id).eq('project_id', projectId).eq('payment_plan_quote_id', plan.quote_id).eq('invoice_id', body.invoice_id).neq('invoice_type', 'credit').select('invoice_id').single()
        if (error) throw error
        return NextResponse.json({ invoice: data })
      }
      throw new Error('Okänd åtgärd')
    }
    const plan = await loadPlan(db, business.business_id, projectId)
    if (plan) return NextResponse.json({ plan, ...await planState(db, plan) })
    const { data: source, error } = await db.rpc('payment_plan_source', { p_business: business.business_id, p_project: projectId })
    if (error) throw error
    if (!source) throw new Error('Projektet saknar kopplad offert')
    return NextResponse.json({ preview: makeSnapshot(source.quote, source.rows.length ? source.rows : source.quote.items || []) })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Betalplanen kunde inte läsas eller sparas' }, { status: 409 })
  }
}
export async function GET(request: NextRequest, { params }: { params: { id: string } }) { return handle(request, params.id, false) }
export async function POST(request: NextRequest, { params }: { params: { id: string } }) { return handle(request, params.id, true) }
