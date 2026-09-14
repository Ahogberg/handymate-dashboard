import { NextRequest, NextResponse } from 'next/server'
import { financialKernelAdmin, requiredText } from '@/lib/financial-kernel/admin'
import { shadowAdminFailure } from '@/lib/financial-kernel/shadow/admin'
import { runShadowForBusiness } from '@/lib/financial-kernel/shadow/run'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
export async function POST(request: NextRequest) {
  if (!await financialKernelAdmin(request)) return NextResponse.json({ error: 'Behörighet saknas' }, { status: 403 })
  try {
    const body = await request.json().catch(() => { throw new TypeError('Ogiltig begäran') })
    const business = requiredText(body?.business, 'företag', 100)
    return NextResponse.json(await runShadowForBusiness(business, { trigger: 'manual', deadline: Date.now() + 240_000 }))
  } catch (error) { return shadowAdminFailure(error) }
}
