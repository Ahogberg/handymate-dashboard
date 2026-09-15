import { VALUE_LEDGER_CONSUMER, kernelValueEnabled } from '@/lib/value/events/kernel-consumer'
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
    const names = kernelValueEnabled() ? [AUTOMATION_BRIDGE_CONSUMER, VALUE_LEDGER_CONSUMER] : [AUTOMATION_BRIDGE_CONSUMER]
    const statuses = await Promise.all(names.map(async consumer => (await consumerStatus(kernelDb(), businessId, consumer)).map(status => ({ ...status, consumer }))))
    return NextResponse.json({ consumers: statuses.flat() })
  } catch (error) { return adminFailure(error) }
}
