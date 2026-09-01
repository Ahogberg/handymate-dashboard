import { NextRequest, NextResponse } from 'next/server'
import { getPartnerFromToken, getPartnerTokenFromRequest } from '@/lib/partners/auth'
import { generateSelfBillingPdf, type SelfBillingDocument } from '@/lib/partners/self-billing'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function authenticate(request: NextRequest) {
  const token = getPartnerTokenFromRequest(request)
  return token ? getPartnerFromToken(token) : null
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const partner = await authenticate(request)
  if (!partner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params

  const { data, error } = await getServerSupabase()
    .from('partner_payout_batch')
    .select('id, partner_id, invoice_number, document_snapshot, delivery_status, review_status, reviewed_at, dispute_reason, status, paid_at')
    .eq('id', id)
    .eq('partner_id', partner.id)
    .single()
  if (error || !data) return NextResponse.json({ error: 'Självfakturan hittades inte' }, { status: 404 })

  if (new URL(request.url).searchParams.get('format') === 'pdf') {
    if (!data.document_snapshot || !data.invoice_number) {
      return NextResponse.json({ error: 'Självfakturan saknar fryst dokument' }, { status: 409 })
    }
    const pdf = generateSelfBillingPdf(data.document_snapshot as SelfBillingDocument)
    const safeNumber = data.invoice_number.replace(/[^A-Za-z0-9_-]/g, '-')
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="sjalvfaktura-${safeNumber}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }

  return NextResponse.json({ batch: data })
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const partner = await authenticate(request)
  if (!partner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const decision = body?.decision === 'approved' || body?.decision === 'disputed' ? body.decision : null
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 2000) : null
  if (!decision) return NextResponse.json({ error: 'Ogiltigt beslut' }, { status: 400 })
  if (decision === 'disputed' && !reason) {
    return NextResponse.json({ error: 'Beskriv vad som behöver korrigeras' }, { status: 400 })
  }

  const { data, error } = await getServerSupabase().rpc('review_partner_self_billing_batch', {
    p_batch_id: id,
    p_partner_id: partner.id,
    p_decision: decision,
    p_reason: reason,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, review: data })
}

