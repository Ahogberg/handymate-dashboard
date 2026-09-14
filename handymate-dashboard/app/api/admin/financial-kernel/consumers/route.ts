import { NextRequest, NextResponse } from 'next/server'
import { financialKernelAdmin, requiredText, adminFailure } from '@/lib/financial-kernel/admin'
import { kernelDb } from '@/lib/financial-kernel/kernel-db'
import { consumerStatus } from '@/lib/financial-kernel/admin'
import { AUTOMATION_BRIDGE_CONSUMER } from '@/lib/financial-kernel/events/bridge-automation'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  if (!await financialKernelAdmin(request)) return NextResponse.json({ error: 'Behörighet saknas' }, { status: 403 })
  try {
    const businessId = requiredText(request.nextUrl.searchParams.get('business_id'), 'företag', 100)
    const statuses = await consumerStatus(kernelDb(), businessId)
    return NextResponse.json({ consumers: statuses.map(status => ({ ...status, consumer: AUTOMATION_BRIDGE_CONSUMER })) })
  } catch (error) { return adminFailure(error) }
}
