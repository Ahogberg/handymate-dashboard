import { checkFuelGate } from '@/lib/costs/fuel'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { evaluateCustomerCommunication } from '@/lib/communication-ai'

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { customerId } = await request.json()

    if (!customerId) {
      return NextResponse.json({ error: 'Missing customerId' }, { status: 400 })
    }

    const fuel = await checkFuelGate(getServerSupabase(), business.business_id)
    if (!fuel.allowed) {
      return NextResponse.json({ error: 'Bränslet är slut eller kunde inte verifieras', code: fuel.reason }, { status: 402 })
    }

    const decision = await evaluateCustomerCommunication(
      business.business_id,
      customerId
    )

    return NextResponse.json(decision)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
