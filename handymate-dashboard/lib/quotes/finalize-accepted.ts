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
 * Logiken bor därför här, och båda vägarna anropar den. Att punktfixa den ena
 * hade garanterat att de driftar isär igen (tasks/lessons.md).
 *
 * Efterstegen har en beständig journal: kunden har redan accepterat, och den händelsen får
 * aldrig rullas tillbaka för att ett efterföljande steg failar. Efterstegens kvittenser och fel återläses i affärsvyn. Ett misslyckat
 * reservkort behövs inte för att göra felet synligt.
 */

export interface FinalizeAcceptedQuoteInput {
  businessId: string
  quoteId: string
  quoteNumber?: string | null
  quoteTitle?: string | null
  customerId?: string | null
  customerName?: string | null
  customerPhone?: string | null
  total?: number | null
  /** Var accepten kom ifrån — bara för loggning och kortets text. */
  source: 'signering' | 'kundportal' | 'internt'
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

  // The trigger records these steps in the same transaction as the acceptance.
  // No journal means no external effect; deployment must apply the migration first.
  async function step(name: 'project' | 'deal' | 'email', work: () => Promise<'done' | 'skipped'>) {
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
        // A provider may have accepted the email even if its response was lost.
        const saved = await supabase.rpc('finish_quote_acceptance_step', { p_business: input.businessId, p_quote: input.quoteId, p_step: name, p_claim: claim, p_state: name === 'email' ? 'uncertain' : 'failed', p_error: message })
        if (saved.error) console.error('[finalize-accepted] result could not be persisted; claim remains visible', saved.error.message)
      }
    }
  }
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
  if (!input.recoveryOnly) await step('email', async () => {
    const { sendQuoteSignedConfirmation } = await import('@/lib/quote-confirmation-email')
    const sent = await sendQuoteSignedConfirmation(input.businessId, input.quoteId)
    if (!sent.success) throw new Error(sent.error || 'Mejlet saknar leverantörskvittens')
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
        customerId: input.customerId ?? null,
        customerPhone: input.customerPhone ?? null,
        projectCreated: result.projectCreated,
        dealMoved: result.dealMoved,
      })
    }
  } catch (err) {
    console.error('[finalize-accepted] demo-efter-SMS misslyckades (icke-blockerande):', err)
  }

  return result
}
