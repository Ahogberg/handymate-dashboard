import { NextRequest, NextResponse } from 'next/server'
import { financialKernelAdmin, requiredText } from '@/lib/financial-kernel/admin'
import { shadowAdminFailure } from '@/lib/financial-kernel/shadow/admin'
import { kernelDb } from '@/lib/financial-kernel/kernel-db'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  if (!await financialKernelAdmin(request)) return NextResponse.json({ error: 'Behörighet saknas' }, { status: 403 })
  try {
    const business = requiredText(request.nextUrl.searchParams.get('business'), 'företag', 100)
    const db = kernelDb()
    const [status, divergences] = await Promise.all([
      db.rpc('financial_shadow_status', { p_business_id: business }),
      db.rpc('list_shadow_divergences', { p_business_id: business, p_status: 'open', p_limit: 100 }),
    ])
    if (status.error || divergences.error) throw new Error(status.error?.message || divergences.error?.message)
    return NextResponse.json({ status: status.data, divergences: divergences.data })
  } catch (error) { return shadowAdminFailure(error) }
}
