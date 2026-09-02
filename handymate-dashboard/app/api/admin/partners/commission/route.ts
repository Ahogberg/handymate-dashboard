import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { getServerSupabase } from '@/lib/supabase'
import {
  processCommissionPeriod,
  createPayoutBatch,
  markBatchPaid,
  previousMonth,
} from '@/lib/partners/commission'
import type { TierStep } from '@/lib/partners/commission-engine'

/**
 * Admin-yta för partnerprovision (partnerprogram v2, 2026-08-11).
 *
 * GET   ?partner_id[&period]  → trappkonfig + liggarrader + batchar
 * PATCH { partner_id, commission_tiers?, base_rate_after?, tier_mode?, ladder_months? }
 * POST  { action: 'run', period? }                        → ackruera period (default förra månaden)
 * POST  { action: 'create_batch', partner_id, period, final_payout?, final_payout_reason? }
 *                                                           → skapa självfaktureringsunderlag
 * POST  { action: 'mark_paid', batch_id, payment_reference, paid_at? } → markera utbetald
 */

function text(value: unknown, max = 300): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

export async function GET(request: NextRequest) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const partnerId = request.nextUrl.searchParams.get('partner_id')
  if (!partnerId) {
    return NextResponse.json({ error: 'partner_id krävs' }, { status: 400 })
  }
  const period = request.nextUrl.searchParams.get('period')

  const supabase = getServerSupabase()

  const [partnerRes, ledgerRes, batchRes] = await Promise.all([
    supabase.from('partners')
      .select('id, name, company, commission_rate, commission_tiers, base_rate_after, tier_mode, ladder_months, total_pending_sek, total_earned_sek')
      .eq('id', partnerId)
      .single(),
    (() => {
      let q = supabase.from('partner_commission_ledger')
        .select('id, business_id, period, customer_month, base_amount_sek, rate, amount_sek, rate_source, status, payout_batch_id, created_at')
        .eq('partner_id', partnerId)
        .order('period', { ascending: false })
        .limit(500)
      if (period) q = q.eq('period', period)
      return q
    })(),
    supabase.from('partner_payout_batch')
      .select('id, period, total_sek, status, created_at, paid_at, paid_by, payment_reference')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false }),
  ])

  if (partnerRes.error || !partnerRes.data) {
    return NextResponse.json({ error: 'Partner hittades inte' }, { status: 404 })
  }

  // Kundnamn för läsbarhet i admin (batchat).
  const bizIds = Array.from(new Set((ledgerRes.data || []).map(r => r.business_id)))
  const { data: businesses } = bizIds.length
    ? await supabase.from('business_config').select('business_id, company_name, business_name').in('business_id', bizIds)
    : { data: [] as any[] }
  const nameFor = new Map((businesses || []).map((b: any) => [b.business_id, b.company_name || b.business_name || b.business_id]))

  return NextResponse.json({
    partner: partnerRes.data,
    ledger: (ledgerRes.data || []).map(r => ({ ...r, business_name: nameFor.get(r.business_id) || r.business_id })),
    batches: batchRes.data || [],
  })
}

export async function PATCH(request: NextRequest) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const partnerId = typeof body?.partner_id === 'string' ? body.partner_id : null
  if (!partnerId) {
    return NextResponse.json({ error: 'partner_id krävs' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}

  if (body.commission_tiers !== undefined) {
    const tiers = body.commission_tiers as TierStep[] | null
    if (tiers !== null) {
      if (!Array.isArray(tiers) || tiers.length === 0) {
        return NextResponse.json({ error: 'commission_tiers måste vara en icke-tom lista eller null' }, { status: 400 })
      }
      const sorted = [...tiers].sort((a, b) => a.min - b.min)
      if (sorted[0].min !== 0) {
        return NextResponse.json({ error: 'Första trappstegets min måste vara 0' }, { status: 400 })
      }
      for (const t of sorted) {
        if (typeof t.min !== 'number' || t.min < 0 || !Number.isInteger(t.min) ||
            typeof t.rate !== 'number' || t.rate <= 0 || t.rate > 1) {
          return NextResponse.json({ error: 'Ogiltigt trappsteg: min ≥ 0 (heltal), sats i (0, 1]' }, { status: 400 })
        }
      }
      const mins = sorted.map(t => t.min)
      if (new Set(mins).size !== mins.length) {
        return NextResponse.json({ error: 'Dubblerade min-värden i trappan' }, { status: 400 })
      }
      update.commission_tiers = sorted
    } else {
      update.commission_tiers = null
    }
  }

  if (body.base_rate_after !== undefined) {
    const rate = Number(body.base_rate_after)
    if (!isFinite(rate) || rate < 0 || rate > 1) {
      return NextResponse.json({ error: 'base_rate_after måste ligga i [0, 1]' }, { status: 400 })
    }
    update.base_rate_after = rate
  }

  if (body.tier_mode !== undefined) {
    if (!['book', 'marginal'].includes(body.tier_mode)) {
      return NextResponse.json({ error: "tier_mode måste vara 'book' eller 'marginal'" }, { status: 400 })
    }
    update.tier_mode = body.tier_mode
  }

  if (body.ladder_months !== undefined) {
    const months = Number(body.ladder_months)
    if (!Number.isInteger(months) || months < 1 || months > 120) {
      return NextResponse.json({ error: 'ladder_months måste vara ett heltal 1–120' }, { status: 400 })
    }
    update.ladder_months = months
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Inget att uppdatera' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { error } = await supabase.from('partners').update(update).eq('id', partnerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

export async function POST(request: NextRequest) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const action = body?.action

  if (action === 'run') {
    const period = typeof body?.period === 'string' && /^\d{4}-\d{2}$/.test(body.period)
      ? body.period
      : previousMonth()
    const result = await processCommissionPeriod(period)
    return NextResponse.json({ success: result.errors.length === 0, result })
  }

  if (action === 'create_batch') {
    const partnerId = typeof body?.partner_id === 'string' ? body.partner_id : null
    const period = typeof body?.period === 'string' && /^\d{4}-\d{2}$/.test(body.period) ? body.period : null
    if (!partnerId || !period) {
      return NextResponse.json({ error: 'partner_id och period (YYYY-MM) krävs' }, { status: 400 })
    }
    const finalPayout = body?.final_payout === true
    const finalPayoutReason = text(body?.final_payout_reason, 500)
    if (finalPayout && !finalPayoutReason) {
      return NextResponse.json({ error: 'Skäl krävs för slututbetalning' }, { status: 400 })
    }
    if (!finalPayout && finalPayoutReason) {
      return NextResponse.json({ error: 'Slututbetalningsskäl får bara anges för slututbetalning' }, { status: 400 })
    }
    const result = await createPayoutBatch(partnerId, period, adminCheck.email || 'admin', {
      finalPayout,
      finalPayoutReason: finalPayoutReason || undefined,
    })
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({
      success: true,
      batch_id: result.batchId,
      invoice_number: result.invoiceNumber,
      subtotal_sek: result.subtotalSek,
      vat_sek: result.vatSek,
      total_sek: result.totalSek,
    })
  }

  if (action === 'mark_paid') {
    const batchId = typeof body?.batch_id === 'string' ? body.batch_id : null
    if (!batchId) return NextResponse.json({ error: 'batch_id krävs' }, { status: 400 })
    const paymentReference = text(body?.payment_reference, 200)
    if (!paymentReference) return NextResponse.json({ error: 'Betalningsreferens krävs' }, { status: 400 })
    const paidAt = typeof body?.paid_at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.paid_at) ? body.paid_at : undefined
    const result = await markBatchPaid(batchId, adminCheck.email || 'admin', paymentReference, paidAt)
    if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Okänd action' }, { status: 400 })
}
