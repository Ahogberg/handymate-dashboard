import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getCustomerFromPortalToken } from '@/lib/portal-link'
import { normaliseraAtaRader } from '@/lib/ata/items'
import { beraknaAtaSummor } from '@/lib/ata/totals'
import { PORTAL_VISIBLE_STATUSES, isCustomerSettled } from '@/lib/invoices/status'

export const dynamic = 'force-dynamic'

/**
 * "Väntar på dig" — allt kunden har att BESLUTA om, i en fråga.
 *
 * Portalens beslutskort (Varumärkeslagret yta 4, 2026-09-07). Hemskärmen
 * kände tidigare inte till öppna beslut: en skickad ÄTA låg tre klick ner i
 * projektvyn, en förfallen faktura syntes bara i dokumentfliken, och
 * omdömet nåddes bara via ?tab=review i SMS:et. Den här routen är EN
 * sanning för hemskärmens kort och räknarna på snabbknapparna.
 *
 * Tre källor:
 *   atas     — project_change i status 'sent' (skickad, inte beslutad)
 *   invoices — obetalda fakturor kunden ser (sent/overdue), med om kunden
 *              redan tryckt "Jag har betalat" (öppet confirm_payment-kort)
 *   review   — omdömet är efterfrågat (customer.review_request_sent_at)
 *              men inte lämnat (ingen rad i portal_review)
 *
 * Aggregerad vy: delfrågorna är best-effort och loggas var för sig — en
 * trasig delfråga ska inte tömma hela kortet. Bara token-uppslaget är hårt.
 */
export async function GET(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  try {
    const supabase = getServerSupabase()
    const customer = await getCustomerFromPortalToken(
      supabase,
      params.token,
      'customer_id, business_id, portal_enabled, review_request_sent_at',
    )
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const businessId = customer.business_id as string
    const customerId = customer.customer_id as string

    const { data: projects, error: projectsError } = await supabase
      .from('project')
      .select('project_id, project_number, name')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
    if (projectsError) console.error('[portal/decisions] projekt-hämtning misslyckades:', projectsError.message)
    const projectIds = (projects || []).map((p: any) => p.project_id as string)
    const projectById = new Map<string, any>((projects || []).map((p: any) => [p.project_id, p]))

    const [ataRes, invoiceRes, claimRes, reviewRes] = await Promise.all([
      projectIds.length === 0
        ? Promise.resolve({ data: [], error: null } as any)
        : supabase
            .from('project_change')
            .select('project_id, change_id, ata_number, description, items, total, vat_rate, change_type, sent_at')
            .in('project_id', projectIds)
            .eq('business_id', businessId)
            // Bara det som väntar på kundens beslut — signerat/avböjt är klart.
            .eq('status', 'sent')
            .order('sent_at', { ascending: true }),
      supabase
        .from('invoice')
        .select('invoice_id, invoice_number, status, total, customer_pays, due_date, reminder_count')
        .eq('business_id', businessId)
        .eq('customer_id', customerId)
        .in('status', [...PORTAL_VISIBLE_STATUSES])
        .order('due_date', { ascending: true }),
      // "Jag har betalat" lämnar ett öppet confirm_payment-kort hos
      // hantverkaren (claim-paid-routen). Så länge det är öppet visar vi
      // "Väntar på bekräftelse" i stället för "Att betala".
      supabase
        .from('pending_approvals')
        .select('payload, created_at')
        .eq('business_id', businessId)
        .eq('approval_type', 'confirm_payment')
        .eq('status', 'pending'),
      supabase
        .from('portal_review')
        .select('id, rating, created_at')
        .eq('business_id', businessId)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1),
    ])

    for (const [namn, res] of Object.entries({ ata: ataRes, invoice: invoiceRes, claim: claimRes, review: reviewRes })) {
      if (res?.error) console.error(`[portal/decisions] ${namn}-hämtning misslyckades:`, res.error.message)
    }

    const atas = (ataRes?.data || []).map((a: any) => {
      const items = normaliseraAtaRader(a.items)
      const summor = beraknaAtaSummor(items, Number(a.vat_rate ?? 25), a.change_type)
      const project = projectById.get(a.project_id)
      return {
        change_id: a.change_id,
        ata_number: a.ata_number,
        description: a.description,
        project_id: a.project_id,
        project_name: project?.name || null,
        project_number: project?.project_number || null,
        sent_at: a.sent_at,
        att_betala: summor.attBetala,
      }
    })

    const claimedAtByInvoice = new Map<string, string>()
    for (const row of claimRes?.data || []) {
      const invoiceId = (row as any).payload?.invoice_id
      if (!invoiceId) continue
      claimedAtByInvoice.set(invoiceId, (row as any).payload?.claimed_at || (row as any).created_at)
    }

    const today = new Date().toISOString().slice(0, 10)
    const invoices = (invoiceRes?.data || [])
      .filter((inv: any) => !isCustomerSettled(inv.status))
      .map((inv: any) => {
        const due = inv.due_date ? String(inv.due_date).slice(0, 10) : null
        return {
          invoice_id: inv.invoice_id,
          invoice_number: inv.invoice_number,
          amount: Number(inv.customer_pays ?? inv.total ?? 0),
          due_date: inv.due_date,
          overdue: inv.status === 'overdue' || (!!due && due < today),
          claimed_at: claimedAtByInvoice.get(inv.invoice_id) || null,
        }
      })

    const leftReview = (reviewRes?.data || [])[0] as any
    const review = {
      requested: !!customer.review_request_sent_at,
      left_at: leftReview?.created_at || null,
      rating: leftReview?.rating ?? null,
      pending: !!customer.review_request_sent_at && !leftReview,
    }

    return NextResponse.json({ atas, invoices, review })
  } catch (error: any) {
    console.error('Portal decisions error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
