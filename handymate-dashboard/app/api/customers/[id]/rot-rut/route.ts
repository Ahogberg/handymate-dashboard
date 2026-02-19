import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCustomerRotRutUsage, validateRotRutDeduction } from '@/lib/rot-rut-limits'

/**
 * GET /api/customers/[id]/rot-rut - Hämta ROT/RUT-användning för kund
 * Query: ?type=rot|rut&laborCost=12000  (optional, för validering)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const customerId = params.id
    const type = request.nextUrl.searchParams.get('type') as 'rot' | 'rut' | null
    const laborCostStr = request.nextUrl.searchParams.get('laborCost')

    const usage = await getCustomerRotRutUsage(customerId, business.business_id)

    // Om typ och arbetskostnad skickades med, validera
    if (type && laborCostStr) {
      const laborCost = parseFloat(laborCostStr)
      if (!isNaN(laborCost)) {
        const validation = await validateRotRutDeduction(
          customerId,
          business.business_id,
          type,
          laborCost
        )
        return NextResponse.json({ usage, validation })
      }
    }

    return NextResponse.json({ usage })
  } catch (error: any) {
    console.error('ROT/RUT usage error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
