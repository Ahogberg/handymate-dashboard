import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import {
  getDealFlowStatus,
  advanceDealFlow,
  initDealFlow,
  DEAL_FLOW_STEPS,
} from '@/lib/e2e-deal-flow'

export const dynamic = 'force-dynamic'

/**
 * GET /api/deals/[id]/flow
 * Returnerar aktuell deal-flödesstatus (vilket steg, vad som väntar).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dealId = params.id
  if (!dealId) {
    return NextResponse.json({ error: 'Deal-ID krävs' }, { status: 400 })
  }

  try {
    const status = await getDealFlowStatus(business.business_id, dealId)

    return NextResponse.json({
      deal_id: dealId,
      ...status,
      steps_definition: DEAL_FLOW_STEPS,
    })
  } catch (err: any) {
    console.error('[DealFlow API] GET error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * POST /api/deals/[id]/flow
 * Manuellt avancera till nästa steg, eller initiera flödet.
 *
 * Body:
 *   { action: 'advance', completed_step: 'quote_sent', data?: {} }
 *   { action: 'init' }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dealId = params.id
  if (!dealId) {
    return NextResponse.json({ error: 'Deal-ID krävs' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const action = body.action || 'advance'

    if (action === 'init') {
      const result = await initDealFlow(business.business_id, dealId)
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 500 })
      }
      return NextResponse.json({ success: true, message: 'Deal-flöde initierat' })
    }

    if (action === 'advance') {
      const completedStep = body.completed_step
      if (!completedStep) {
        return NextResponse.json(
          { error: 'completed_step krävs för att avancera flödet' },
          { status: 400 }
        )
      }

      // Validera att steget finns
      const validStep = DEAL_FLOW_STEPS.find(s => s.key === completedStep)
      if (!validStep) {
        return NextResponse.json(
          { error: `Ogiltigt steg: ${completedStep}. Giltiga steg: ${DEAL_FLOW_STEPS.map(s => s.key).join(', ')}` },
          { status: 400 }
        )
      }

      const result = await advanceDealFlow(
        business.business_id,
        dealId,
        completedStep,
        body.data || {}
      )

      return NextResponse.json({
        success: true,
        ...result,
      })
    }

    return NextResponse.json(
      { error: `Okänd action: ${action}. Använd "init" eller "advance".` },
      { status: 400 }
    )
  } catch (err: any) {
    console.error('[DealFlow API] POST error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
