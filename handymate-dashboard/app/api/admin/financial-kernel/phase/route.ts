import { NextRequest, NextResponse } from 'next/server'
import { financialKernelAdmin, requiredText } from '@/lib/financial-kernel/admin'
import { shadowReason, shadowAdminFailure } from '@/lib/financial-kernel/shadow/admin'
import { kernelDb } from '@/lib/financial-kernel/kernel-db'
export async function POST(request: NextRequest) {
  const actor = await financialKernelAdmin(request)
  if (!actor) return NextResponse.json({ error: 'Behörighet saknas' }, { status: 403 })
  try {
    const body = await request.json().catch(() => { throw new TypeError('Ogiltig begäran') })
    const business = requiredText(body?.business, 'företag', 100)
    if (body?.phase !== 'off' && body?.phase !== 'S1') throw new TypeError('Fas S2 är inte tillgänglig. Välj avstängd eller S1.')
    const reason = shadowReason(body?.reason)
    const { data, error } = await kernelDb().rpc('set_financial_kernel_phase', { p_business_id: business, p_phase: body.phase, p_actor: actor, p_reason: reason })
    if (error) throw new Error(error.message)
    return NextResponse.json(data)
  } catch (error) { return shadowAdminFailure(error) }
}
