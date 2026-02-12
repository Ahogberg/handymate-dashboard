import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
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

    const decision = await evaluateCustomerCommunication(
      business.business_id,
      customerId
    )

    return NextResponse.json(decision)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
