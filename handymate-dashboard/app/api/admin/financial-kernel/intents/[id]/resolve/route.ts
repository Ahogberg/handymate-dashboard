import { NextRequest, NextResponse } from 'next/server'
import { financialKernelAdmin, requiredText, adminFailure } from '@/lib/financial-kernel/admin'
import { kernelDb } from '@/lib/financial-kernel/kernel-db'
import { resolveEffectIntent } from '@/lib/financial-kernel/commands/service'
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const actor = await financialKernelAdmin(request)
  if (!actor) return NextResponse.json({ error: 'Behörighet saknas' }, { status: 403 })
  try {
    const body = await request.json().catch(() => { throw new TypeError('Ogiltig begäran') })
    const businessId = requiredText(body?.business_id, 'företag', 100)
    const reason = requiredText(body?.reason, 'skäl')
    const resolution = body?.resolution
    if (resolution !== 'delivered' && resolution !== 'abandon' && resolution !== 'retry') throw new TypeError('Ogiltigt beslut')
    const result = await resolveEffectIntent(kernelDb(), businessId, requiredText(params.id, 'post', 100), resolution, actor, reason)
    return NextResponse.json(result)
  } catch (error) { return adminFailure(error) }
}
