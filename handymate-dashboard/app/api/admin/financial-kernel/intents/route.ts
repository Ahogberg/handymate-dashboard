import { NextRequest, NextResponse } from 'next/server'
import { financialKernelAdmin, requiredText, adminFailure } from '@/lib/financial-kernel/admin'
import { kernelDb } from '@/lib/financial-kernel/kernel-db'
import { listUnresolvedEffectIntents } from '@/lib/financial-kernel/commands/service'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  if (!await financialKernelAdmin(request)) return NextResponse.json({ error: 'Behörighet saknas' }, { status: 403 })
  try {
    const businessId = requiredText(request.nextUrl.searchParams.get('business_id'), 'företag', 100)
    return NextResponse.json({ intents: await listUnresolvedEffectIntents(kernelDb(), businessId) })
  } catch (error) { return adminFailure(error) }
}
