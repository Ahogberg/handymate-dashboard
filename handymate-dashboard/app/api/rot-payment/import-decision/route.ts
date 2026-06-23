import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { parseDecisionFile, flattenDecisionArenden } from '@/lib/skv/parse-decision-file'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rot-payment/import-decision
 * Body: Skatteverkets beslutsfil (JSON, rå text). Matchar varje beslut mot våra
 * fakturor (primärt fakturanummer, annars personnummer bland submitted-fakturor)
 * och sätter rot_decision_status/-amount + rullar upp rot_payment_request.status.
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUser = await getCurrentUser(request)
  if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
    return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
  }

  const text = await request.text()
  if (!text.trim()) return NextResponse.json({ error: 'Tom fil' }, { status: 400 })

  let arenden
  try {
    arenden = flattenDecisionArenden(parseDecisionFile(text))
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Kunde inte läsa beslutsfilen' }, { status: 400 })
  }
  if (arenden.length === 0) return NextResponse.json({ error: 'Beslutsfilen innehöll inga ärenden' }, { status: 400 })

  const supabase = getServerSupabase()

  // Hämta företagets submitted ROT/RUT-fakturor (med kund-pnr för fallback-matchning).
  const { data: submitted } = await supabase
    .from('invoice')
    .select('invoice_id, invoice_number, rot_payment_request_id, rot_deduction, rut_deduction, rot_rut_type, customer:customer_id (personal_number)')
    .eq('business_id', business.business_id)
    .eq('rot_application_status', 'submitted')

  const byFaktura = new Map<string, any>()
  const byPnr = new Map<string, any[]>()
  for (const inv of (submitted || []) as any[]) {
    if (inv.invoice_number) byFaktura.set(String(inv.invoice_number), inv)
    const pnr = (inv.customer?.personal_number || '').replace(/\D/g, '')
    if (pnr) { const arr = byPnr.get(pnr) || []; arr.push(inv); byPnr.set(pnr, arr) }
  }

  const now = new Date().toISOString()
  const affectedRequests = new Set<string>()
  let matched = 0, unmatched = 0, approved = 0, rejected = 0
  const usedInvoiceIds = new Set<string>()

  for (const a of arenden) {
    let inv = a.fakturanummer ? byFaktura.get(a.fakturanummer) : undefined
    if (!inv && a.personnummer) {
      // Fallback: matcha på personnummer bland ej redan matchade submitted-fakturor.
      const candidates = (byPnr.get(a.personnummer) || []).filter(i => !usedInvoiceIds.has(i.invoice_id))
      if (candidates.length === 1) inv = candidates[0]
    }
    if (!inv || usedInvoiceIds.has(inv.invoice_id)) { unmatched++; continue }
    usedInvoiceIds.add(inv.invoice_id)
    matched++

    const requested = Math.round((inv.rot_rut_type === 'rut' ? inv.rut_deduction : inv.rot_deduction) || 0)
    const godkant = a.godkantBelopp
    const status = godkant <= 0 ? 'rejected' : (godkant < requested ? 'partial' : 'approved')
    if (godkant <= 0) rejected++; else approved++

    await supabase.from('invoice').update({
      rot_decision_status: status,
      rot_decision_amount_kr: godkant,
      rot_decision_at: now,
    }).eq('invoice_id', inv.invoice_id).eq('business_id', business.business_id)

    if (inv.rot_payment_request_id) affectedRequests.add(inv.rot_payment_request_id)
  }

  // Rulla upp begäran-status: alla avslagna → 'rejected', blandat → 'partially_approved', annars 'paid'.
  for (const reqId of Array.from(affectedRequests)) {
    const { data: invs } = await supabase
      .from('invoice').select('rot_decision_status')
      .eq('rot_payment_request_id', reqId).eq('business_id', business.business_id)
    const statuses = (invs || []).map((i: any) => i.rot_decision_status)
    const anyRejected = statuses.includes('rejected') || statuses.includes('partial')
    const allDecided = statuses.every((s: string | null) => s)
    const reqStatus = !allDecided ? 'partially_approved' : anyRejected ? 'partially_approved' : 'paid'
    await supabase.from('rot_payment_request').update({ status: reqStatus })
      .eq('id', reqId).eq('business_id', business.business_id)
  }

  return NextResponse.json({ matched, unmatched, approved, rejected })
}
