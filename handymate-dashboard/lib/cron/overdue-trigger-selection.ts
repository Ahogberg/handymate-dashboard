/**
 * Våg 2c (tasks/value-chain-plan.md) — ren urvalslogik för invoice_overdue-
 * triggern i app/api/cron/check-overdue/route.ts. Extraherad hit så urvalet
 * (dedup mot send-reminders + cap) kan facit-testas utan Supabase.
 */

/** Max antal invoice_overdue-agentkörningar per cron-körning. check-overdue
    kör en gång/dag (vercel.json: "0 7 * * *") men om många fakturor blir
    förfallna samtidigt över flera företag vill vi inte spränga
    /api/agent/trigger med dussintals parallella körningar på en gång.
    Resten faller tillbaka på send-reminders mekaniska påminnelsekedja
    (oberoende cron, kör 0 10 * * *, ingen faktura tappas). */
export const MAX_AGENT_TRIGGERS_PER_RUN = 10

export interface OverdueInvoiceForTrigger {
  invoice_id: string
}

/**
 * Väljer vilka just-förfallna fakturor som ska väcka Karin denna körning.
 *
 * Ren funktion: `hasPendingReminder` är en synkron predikat-funktion så
 * anroparen kan batcha Supabase-läsningen EN gång (bygga ett Set och
 * använda `.has`) istället för ett query per faktura i en loop.
 *
 * Dedup: fakturor som redan har ett pending invoice_reminder-kort (send-
 * reminders eller en tidigare Karin-körning äger redan uppföljningen)
 * hoppas över helt — Karin ska inte duplicera ett kort som redan finns i
 * godkännandekön.
 * Cap: resultatet begränsas till max `max` fakturor (se MAX_AGENT_TRIGGERS_PER_RUN).
 */
export function pickOverdueInvoicesToNotifyKarin<T extends OverdueInvoiceForTrigger>(
  freshlyOverdueInvoices: T[],
  hasPendingReminder: (invoiceId: string) => boolean,
  max: number = MAX_AGENT_TRIGGERS_PER_RUN,
): T[] {
  const eligible = freshlyOverdueInvoices.filter((inv) => !hasPendingReminder(inv.invoice_id))
  return eligible.slice(0, max)
}
