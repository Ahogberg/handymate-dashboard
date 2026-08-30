/**
 * Våg 2c (tasks/value-chain-plan.md) — ren urvalslogik för invoice_overdue-
 * triggern i app/api/cron/check-overdue/route.ts. Extraherad hit så urvalet
 * (kanoniskt ägarskap + cap) kan facit-testas utan Supabase.
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
  business_id: string
}

/**
 * Väljer vilka just-förfallna fakturor som ska väcka Karin denna körning.
 *
 * Ren funktion: `isAlreadyOwned` är en synkron predikat-funktion så
 * anroparen kan batcha Supabase-läsningen EN gång (bygga ett Set och
 * använda `.has`) istället för ett query per faktura i en loop.
 *
 * Ägarskap: fakturor som redan har ett pending invoice_reminder-kort, eller
 * vars företag har en aktiv V3-regel för fakturor, hoppas över helt. V3 är
 * den kanoniska ägaren där den är aktiv; Karins invoice_overdue-trigger är
 * reservvägen för övriga företag.
 * Cap: resultatet begränsas till max `max` fakturor (se MAX_AGENT_TRIGGERS_PER_RUN).
 */
export function pickOverdueInvoicesToNotifyKarin<T extends OverdueInvoiceForTrigger>(
  freshlyOverdueInvoices: T[],
  isAlreadyOwned: (invoice: T) => boolean,
  max: number = MAX_AGENT_TRIGGERS_PER_RUN,
): T[] {
  const eligible = freshlyOverdueInvoices.filter((invoice) => !isAlreadyOwned(invoice))
  return eligible.slice(0, max)
}
