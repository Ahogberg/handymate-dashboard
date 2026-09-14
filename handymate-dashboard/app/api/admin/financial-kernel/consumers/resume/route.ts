import { NextRequest, NextResponse } from 'next/server'
import { financialKernelAdmin, requiredText, adminFailure } from '@/lib/financial-kernel/admin'
import { kernelDb } from '@/lib/financial-kernel/kernel-db'
import { AUTOMATION_BRIDGE_CONSUMER } from '@/lib/financial-kernel/events/bridge-automation'
export async function POST(request: NextRequest) {
  const actor = await financialKernelAdmin(request)
  if (!actor) return NextResponse.json({ error: 'Behörighet saknas' }, { status: 403 })
  try {
    const body = await request.json().catch(() => { throw new TypeError('Ogiltig begäran') })
    const businessId = requiredText(body?.business_id, 'företag', 100)
    const reason = requiredText(body?.reason, 'skäl')
    if (body?.consumer !== AUTOMATION_BRIDGE_CONSUMER) throw new TypeError('Okänd uppföljning')
    const { data, error } = await kernelDb().rpc('resume_financial_consumer', {
      p_business_id: businessId, p_consumer: AUTOMATION_BRIDGE_CONSUMER, p_actor_id: actor, p_reason: reason,
    })
    if (error) throw new Error(error.message)
    if (data !== true) return NextResponse.json({ error: 'Uppföljningen är inte pausad. Uppdatera listan.' }, { status: 409 })
    return NextResponse.json({ resumed: true })
  } catch (error) { return adminFailure(error) }
}
