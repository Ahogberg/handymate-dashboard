import { NextRequest, NextResponse } from 'next/server'
import { financialKernelAdmin, requiredText } from '@/lib/financial-kernel/admin'
import { shadowReason, shadowAdminFailure } from '@/lib/financial-kernel/shadow/admin'
import { kernelDb } from '@/lib/financial-kernel/kernel-db'
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await financialKernelAdmin(request)
  if (!actor) return NextResponse.json({ error: 'Behörighet saknas' }, { status: 403 })
  try {
    const body = await request.json().catch(() => { throw new TypeError('Ogiltig begäran') })
    const business = requiredText(body?.business, 'företag', 100)
    const id = requiredText(params.id, 'avvikelse', 100)
    if (!['accepted', 'fixed', 'reference_error', 'duplicate'].includes(body?.type)) throw new TypeError('Ogiltigt beslut')
    const reason = shadowReason(body?.reason)
    const optional = (value: unknown) => value == null || value === '' ? null : requiredText(value, 'referens', 500)
    const db = kernelDb()
    const { data, error } = await db.rpc('resolve_shadow_divergence', {
      p_business_id: business, p_divergence_id: id, p_resolution_type: body.type,
      p_reason: reason, p_actor: actor, p_fix_reference: optional(body.fix_reference), p_root_cause_code: optional(body.root_cause_code),
    })
    if (error) throw new Error(error.message)
    const phase = await db.rpc('financial_kernel_phase', { p_business_id: business })
    if (phase.error) throw new Error(phase.error.message)
    return NextResponse.json({ resolution: data, phase: phase.data })
  } catch (error) { return shadowAdminFailure(error) }
}
