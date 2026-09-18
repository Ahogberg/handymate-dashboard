import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Vad som ALLTID ska hända när en offert blir accepterad — oavsett väg in.
 *
 * Bakgrund (verifiering 2026-08-05): det fanns två vägar till "accepterad" och
 * bara EN av dem gjorde jobbet. Kundens signering i den publika vyn skapade
 * projekt, flyttade dealen till vunnen och skickade bekräftelse. Portalens
 * "Acceptera"-knapp satte bara statusen — ingen projektrad, ingen vunnen deal,
 * ingen bekräftelse. En kund som tryckte fel knapp gav hantverkaren en vunnen
 * offert utan jobb att utföra.
 *
 * Fortsättningen (2026-09-18): finalizern ägde tre steg medan SEX andra
 * eftersteg låg inklistrade i var och en av de tre accept-rutterna. Kopiorna
 * hade redan drivit isär — `handleProjectEvent` saknades helt i kundportalen,
 * den interna vägen fyrade `quote_accepted` medan de två andra fyrade
 * `quote_signed`, och den interna vägens bekräftelse-SMS påstod en signatur
 * som aldrig fanns. Nu äger finalizern ALLA eftersteg, och rutterna gör bara
 * auth → statusflipp (CAS) → ett anrop hit → svar.
 *
 * Efterstegen har en beständig journal: kunden har redan accepterat, och den
 * händelsen får aldrig rullas tillbaka för att ett efterföljande steg failar.
 * Efterstegens kvittenser och fel återläses i affärsvyn.
 *
 * ── DEN KRITISKA EGENSKAPEN ────────────────────────────────────────────────
 * Utan journalrad gör finalizern INGENTING. Journalraden skapas av triggern
 * `quote_acceptance_queue` i SAMMA transaktion som statusflippen
 * (sql/v2_quote_acceptance_completion.sql). Saknas migrationen finns ingen rad,
 * och varje steg avbryts vid claim — inga sidoeffekter, ingen halv accept.
 */

/** Var accepten kom ifrån. Samma vokabulär som `quotes.accepted_via` (v263). */
export type AcceptanceSource = 'signering' | 'kundportal' | 'internt'

/**
 * Varje eftersteg som en accept utlöser. Namnen är journalens kolumnprefix
 * (`<namn>_state`) — se sql/v264_acceptance_journal_alla_steg.sql.
 */
export type AcceptanceStep =
  | 'margin' | 'project' | 'deal' | 'project_event'
  | 'communication' | 'notify' | 'events' | 'autopilot' | 'email'

/**
 * Stegen som `acceptance-recovery` spelar upp igen. OFÖRÄNDRAD omfattning
 * (beslut 2026-09-18): de nya stegen syns i journalen men återspelas INTE.
 * Ett utskick, en notis eller ett automationsevent som kanske redan gick ut
 * får aldrig köras om av en knapptryckning i återhämtningspanelen.
 */
const RECOVERY_STEPS: readonly AcceptanceStep[] = ['project', 'deal']

export interface FinalizeAcceptedQuoteInput {
  businessId: string
  quoteId: string
  quoteNumber?: string | null
  quoteTitle?: string | null
  customerId?: string | null
  customerName?: string | null
  customerPhone?: string | null
  /** Signeringens omräknade totalsumma. Utelämnad = offertens egen. */
  total?: number | null
  source: AcceptanceSource
  recoveryOnly?: boolean
}

export interface FinalizeAcceptedQuoteResult {
  projectCreated: boolean
  dealMoved: boolean
  confirmationSent: boolean
}

export async function finalizeAcceptedQuote(
  supabase: SupabaseClient,
  input: FinalizeAcceptedQuoteInput,
): Promise<FinalizeAcceptedQuoteResult> {
  const result: FinalizeAcceptedQuoteResult = {
    projectCreated: false,
    dealMoved: false,
    confirmationSent: false,
  }

  // Ett enda uppslag av offerten och kunden. Rutterna skickar inte längre in
  // de här fälten var för sig — det var precis den plumbingen som lät vägarna
  // driva isär (portalen skickade aldrig customerPhone).
  const { data: quoteRow } = await supabase
    .from('quotes')
    .select('quote_id, quote_number, title, total, customer_id, lead_id')
    .eq('business_id', input.businessId)
    .eq('quote_id', input.quoteId)
    .maybeSingle()

  const customerId = input.customerId ?? (quoteRow as any)?.customer_id ?? null
  const quoteNumber = input.quoteNumber ?? (quoteRow as any)?.quote_number ?? null
  const quoteTitle = input.quoteTitle ?? (quoteRow as any)?.title ?? null
  const total = input.total ?? (quoteRow as any)?.total ?? 0
  const leadId = (quoteRow as any)?.lead_id ?? null

  let customerName = input.customerName ?? null
  let customerPhone = input.customerPhone ?? null
  if (customerId && (!customerName || !customerPhone)) {
    const { data: customerRow } = await supabase
      .from('customer')
      .select('name, phone_number')
      .eq('business_id', input.businessId)
      .eq('customer_id', customerId)
      .maybeSingle()
    customerName = customerName ?? (customerRow as any)?.name ?? null
    customerPhone = customerPhone ?? (customerRow as any)?.phone_number ?? null
  }

  // Kommunikationen är källmedveten: bara signeringsvägen har en signatur.
  // `quote_accepted` avbokar dessutom nurture-sekvenser (lib/smart-communication)
  // — det ska en portal- och en intern accept också göra.
  const communicationEvent = input.source === 'signering' ? 'quote_signed' : 'quote_accepted'
  const marginReason: 'signed' | 'portal_accept' | 'manual_accept' =
    input.source === 'signering' ? 'signed'
      : input.source === 'kundportal' ? 'portal_accept' : 'manual_accept'

  // The trigger records these steps in the same transaction as the acceptance.
  // No journal means no external effect; deployment must apply the migration first.
  async function step(name: AcceptanceStep, work: () => Promise<'done' | 'skipped'>) {
    if (input.recoveryOnly && !RECOVERY_STEPS.includes(name)) return
    let claim: string | null = null
    try {
      const claimed = await supabase.rpc('claim_quote_acceptance_step', { p_business: input.businessId, p_quote: input.quoteId, p_step: name })
      if (claimed.error) throw claimed.error
      claim = claimed.data
      if (!claim) return
      const state = await work()
      const finished = await supabase.rpc('finish_quote_acceptance_step', { p_business: input.businessId, p_quote: input.quoteId, p_step: name, p_claim: claim, p_state: state, p_error: null })
      if (finished.error || finished.data !== true) throw finished.error || new Error('Sparbekräftelse saknas')
    } catch (err) {
      const message = err instanceof Error ? err.message : (err as { message?: string })?.message || 'Steget kunde inte verifieras'
      console.error(`[finalize-accepted] ${name}:`, message)
      if (claim) {
        // A provider may have accepted the send even if its response was lost.
        const outbound = name === 'email' || name === 'notify' || name === 'communication' || name === 'events'
        const saved = await supabase.rpc('finish_quote_acceptance_step', { p_business: input.businessId, p_quote: input.quoteId, p_step: name, p_claim: claim, p_state: outbound ? 'uncertain' : 'failed', p_error: message })
        if (saved.error) console.error('[finalize-accepted] result could not be persisted; claim remains visible', saved.error.message)
      }
    }
  }

  // Marginalen först: den ska spegla offerten som den såg ut i accept-ögonblicket,
  // innan något eftersteg hunnit röra raden.
  await step('margin', async () => {
    const { captureExpectedMarginSnapshot } = await import('@/lib/quotes/margin-snapshot')
    await captureExpectedMarginSnapshot(supabase, input.businessId, input.quoteId, marginReason)
    return 'done'
  })
  await step('project', async () => {
    const { createProjectFromQuote } = await import('@/lib/projects/create-from-quote')
    const project = await createProjectFromQuote(input.businessId, input.quoteId)
    if (!project.success || !project.project_id) throw new Error(project.error || 'Projektet saknar sparbekräftelse')
    return 'done'
  })
  await step('deal', async () => {
    const { data: deal, error } = await supabase.from('deal').select('id').eq('business_id', input.businessId).eq('quote_id', input.quoteId).maybeSingle()
    if (error) throw error
    // An accepted quote can originate outside the pipeline. Explicitly complete
    // the no-linked-deal case; never invent a deal-moved receipt for it.
    if (deal) {
      const { moveDeal } = await import('@/lib/pipeline')
      await moveDeal({ dealId: deal.id, businessId: input.businessId, toStageSlug: 'won', triggeredBy: 'system', aiReason: `Offert accepterad (${input.source})` })
      // moveDeal may legitimately decline a backwards transition. Verify the
      // resulting stage instead of treating a resolved Promise as a receipt.
      const verified = await supabase.from('deal').select('stage_id').eq('business_id', input.businessId).eq('id', deal.id).single()
      if (verified.error || !verified.data?.stage_id) throw new Error('Affärens nya steg kunde inte verifieras')
      const stage = await supabase.from('pipeline_stage').select('id,is_won').eq('business_id', input.businessId).eq('id', verified.data.stage_id).single()
      if (stage.error || stage.data?.is_won !== true) throw new Error('Affären är ännu inte verifierad som vunnen')
    }
    return deal ? 'done' : 'skipped'
  })
  // Projekt-AI:n saknades HELT i kundportalen före 2026-09-18.
  await step('project_event', async () => {
    const { handleProjectEvent } = await import('@/lib/project-ai-engine')
    await handleProjectEvent({ type: 'quote_accepted', businessId: input.businessId, quoteId: input.quoteId })
    return 'done'
  })
  await step('communication', async () => {
    const { triggerEventCommunication } = await import('@/lib/smart-communication')
    await triggerEventCommunication({
      businessId: input.businessId,
      event: communicationEvent,
      customerId,
      context: { quoteId: input.quoteId },
    })
    return 'done'
  })
  await step('notify', async () => {
    const { notifyQuoteSigned } = await import('@/lib/notifications')
    await notifyQuoteSigned({
      businessId: input.businessId,
      customerName: customerName || 'Kund',
      quoteId: input.quoteId,
      total: total || 0,
    })
    // Push-notisen om en SIGNERAD offert har ingen pending_approval-rad (info,
    // inte action). Bara signeringsvägen — den är den enda där en signatur
    // faktiskt finns att berätta om. Fire-and-forget, helpern loggar internt.
    if (input.source === 'signering') {
      const { sendApprovalPush } = await import('@/lib/notifications/approval-push')
      void sendApprovalPush({
        business_id: input.businessId,
        approval_type: 'quote_signed',
        payload: { customer_name: customerName || 'Kund', quote_id: input.quoteId, total },
      })
    }
    return 'done'
  })
  // Automationsmotorns event OCH kundaktivitetsloggen: båda säger "det här
  // hände", båda ska ske exakt en gång, och båda får därför dela kvittens.
  // `quote_accepted` är kanoniskt "affären är vunnen" och fyras på ALLA vägar;
  // `quote_signed` fyras bara där en signatur faktiskt finns.
  await step('events', async () => {
    const { fireEvent } = await import('@/lib/automation-engine')
    const payload = {
      quote_id: input.quoteId,
      customer_id: customerId,
      customer_name: customerName,
      quote_title: quoteTitle,
      title: quoteTitle,
      total,
      lead_id: leadId,
    }
    await fireEvent(supabase, 'quote_accepted', input.businessId, payload)
    if (input.source === 'signering') {
      await fireEvent(supabase, 'quote_signed', input.businessId, payload)
    }
    if (customerId) {
      const { error } = await supabase.from('customer_activity').insert({
        activity_id: 'act_' + Math.random().toString(36).slice(2, 11),
        customer_id: customerId,
        business_id: input.businessId,
        activity_type: 'quote_accepted',
        title: input.source === 'signering' ? 'Offert signerad av kund'
          : input.source === 'kundportal' ? 'Offert accepterad via kundportal'
          : 'Offert manuellt accepterad',
        description: `Offert "${quoteTitle || quoteNumber || input.quoteId}" är accepterad`,
        created_by: input.source === 'internt' ? 'user' : input.source === 'kundportal' ? 'portal' : 'customer',
      })
      if (error) throw error
    }
    return 'done'
  })
  await step('autopilot', async () => {
    const { triggerAutopilot } = await import('@/lib/autopilot/trigger')
    await triggerAutopilot(input.businessId, input.quoteId)
    return 'done'
  })
  // Bekräftelsen till kunden: ETT utskick per accept. Mejl när kunden har
  // adress, annars SMS. Texten är källmedveten och påstår aldrig en signatur
  // som inte finns (lib/quote-confirmation-email.ts).
  await step('email', async () => {
    const { sendQuoteSignedConfirmation } = await import('@/lib/quote-confirmation-email')
    const sent = await sendQuoteSignedConfirmation(input.businessId, input.quoteId, input.source)
    if (!sent.success) throw new Error(sent.error || 'Bekräftelsen saknar leverantörskvittens')
    return sent.skipped ? 'skipped' : 'done'
  })

  const { data: receipt, error: receiptError } = await supabase.from('quote_acceptance_completion')
    .select('project_state,deal_state,email_state').eq('business_id', input.businessId).eq('quote_id', input.quoteId).single()
  if (!receiptError && receipt) {
    result.projectCreated = receipt.project_state === 'done'
    result.dealMoved = receipt.deal_state === 'done'
    result.confirmationSent = receipt.email_state === 'done'
  }

  // ── Demo-offerten på handymate.se (yta 9, 2026-09-07) ─────────────────
  // ENDA extra steget för demo-företaget: SMS 2 till prospektet om vad som
  // just hände. Grindat på business_id — en riktig hantverkares kund får
  // aldrig det här SMS:et. Dynamisk import så vanliga accepter inte drar in
  // demo-modulen. Non-blocking som allt annat här.
  try {
    const { arDemoOffertForetag } = await import('@/lib/demo/demo-quote')
    if (!input.recoveryOnly && arDemoOffertForetag(input.businessId)) {
      const { skickaDemoEfterSms } = await import('@/lib/demo/demo-quote')
      await skickaDemoEfterSms(supabase, {
        quoteId: input.quoteId,
        customerId: customerId,
        customerPhone: customerPhone,
        projectCreated: result.projectCreated,
        dealMoved: result.dealMoved,
      })
    }
  } catch (err) {
    console.error('[finalize-accepted] demo-efter-SMS misslyckades (icke-blockerande):', err)
  }

  return result
}
