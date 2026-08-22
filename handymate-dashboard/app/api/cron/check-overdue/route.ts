import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { triggerAgentFireAndForget, makeIdempotencyKey } from '@/lib/agent-trigger'
import { pickOverdueInvoicesToNotifyKarin } from '@/lib/cron/overdue-trigger-selection'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET/POST - Check and mark overdue invoices (DB status only) + väck Karin.
 *
 * VIKTIGT: Denna cron uppdaterar invoice.status till 'overdue'. Mekanisk
 * kundkommunikation (SMS/email) hanteras FORTFARANDE av:
 *   - /api/cron/send-reminders (respekterar auto_reminder_enabled)
 *   - V3 automation rules "Fakturapåminnelse dag 1/7" (respekterar is_active)
 *
 * Tidigare skickade denna cron SMS via agent UTAN att kolla toggles — det
 * innebar att kunder fick påminnelser även om auto-reminders var avstängt.
 *
 * Våg 2c (tasks/value-chain-plan.md, 2026-08-03): utöver statusändringen
 * väcks nu Karin (invoice_overdue-trigger, matchAgentByPrefix routar
 * 'invoice_*' till henne) för varje faktura som JUST blev förfallen i denna
 * körning — inte för fakturor som redan var 'overdue' sedan innan (de
 * matchar inte status='sent'-filtret nedan och triggas alltså bara en
 * gång). Karin ska BEDÖMA läget (kund/belopp/relation) och kan föreslå
 * något annat än send-reminders mekaniska mall-påminnelse. Dedup mot
 * send-reminders: fakturor som redan har ett pending invoice_reminder-kort
 * hoppas över (se lib/cron/overdue-trigger-selection.ts). Fire-and-forget,
 * cappat till MAX_AGENT_TRIGGERS_PER_RUN triggningar/körning.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return checkOverdueInvoices()
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return checkOverdueInvoices()
}

async function checkOverdueInvoices() {
  try {
    const supabase = getServerSupabase()
    const today = new Date().toISOString().split('T')[0]

    // Find all sent invoices where due_date has passed — dessa fakturor blir
    // JUST förfallna i denna körning (status='sent' matchar bara innan
    // uppdateringen nedan; nästa körning har de redan status='overdue' och
    // matchas då inte igen — filtret ÄR "just blivit overdue"-urvalet).
    const { data: overdueInvoices, error: fetchError } = await supabase
      .from('invoice')
      .select(`
        invoice_id, invoice_number, business_id, customer_id, due_date, total, customer_pays, rot_rut_type,
        customer:customer_id (name)
      `)
      .eq('status', 'sent')
      .lt('due_date', today)

    if (fetchError) throw fetchError

    if (!overdueInvoices || overdueInvoices.length === 0) {
      return NextResponse.json({ success: true, updated: 0 })
    }

    // Update status to overdue — mekanisk kommunikation sker fortfarande via
    // send-reminders/V3-regler. Karin väcks separat nedan.
    const invoiceIds = overdueInvoices.map((inv: any) => inv.invoice_id)
    await supabase.from('invoice').update({ status: 'overdue' }).in('invoice_id', invoiceIds)

    console.log(`[check-overdue] Markerade ${invoiceIds.length} fakturor som förfallna`)

    // ── Väck Karin (Våg 2c) ──────────────────────────────────────────
    // Fail-safe: agent-triggningen får aldrig fälla statusuppdateringen
    // ovan, som redan gått igenom.
    let agentTriggered = 0
    try {
      const businessIds = Array.from(new Set(overdueInvoices.map((inv: any) => inv.business_id)))

      // Batchad dedup-läsning (ett query, inte ett per faktura): alla
      // pending invoice_reminder-kort för de berörda företagen.
      const { data: pendingReminders } = await supabase
        .from('pending_approvals')
        .select('payload')
        .eq('approval_type', 'invoice_reminder')
        .eq('status', 'pending')
        .in('business_id', businessIds)

      const invoiceIdsWithPendingReminder = new Set(
        (pendingReminders || [])
          .map((r: any) => r.payload?.invoice_id)
          .filter(Boolean)
      )

      const toTrigger = pickOverdueInvoicesToNotifyKarin(
        overdueInvoices as any[],
        (invoiceId) => invoiceIdsWithPendingReminder.has(invoiceId),
      )

      for (const inv of toTrigger as any[]) {
        const dueDate = new Date(inv.due_date)
        const daysOverdue = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        const customer = inv.customer as any
        const amount = inv.rot_rut_type ? inv.customer_pays : inv.total

        triggerAgentFireAndForget(
          inv.business_id,
          'invoice_overdue',
          {
            invoice_id: inv.invoice_id,
            invoice_number: inv.invoice_number,
            customer_id: inv.customer_id,
            customer_name: customer?.name || null,
            amount: amount ?? null,
            days_overdue: daysOverdue,
            instruction: `Fakturan ${inv.invoice_number} till ${customer?.name || 'kunden'} på ${amount ?? 0} kr blev förfallen idag (${daysOverdue} dagar sedan förfallodatum). Bedöm läget utifrån kund/belopp/relation och föreslå lämplig åtgärd om något avviker från standard — en mekanisk mall-påminnelse skickas ändå automatiskt via påminnelsekedjan.`,
          },
          // Idempotent per faktura+dag — skyddar mot dubbelkörning samma dag
          // (cronen kör en gång/dag men /api/agent/trigger dedupar ändå).
          makeIdempotencyKey('inv_overdue', inv.business_id, inv.invoice_id, today)
        )
        agentTriggered++
      }
    } catch (triggerErr) {
      console.error('[check-overdue] Karin-trigger misslyckades (non-blocking):', triggerErr)
    }

    return NextResponse.json({
      success: true,
      updated: invoiceIds.length,
      agent_triggered: agentTriggered,
    })
  } catch (error: any) {
    console.error('Check overdue error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
