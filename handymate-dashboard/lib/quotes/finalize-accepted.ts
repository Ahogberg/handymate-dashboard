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
 * ALLT är non-blocking: kunden har redan accepterat, och den händelsen får
 * aldrig rullas tillbaka för att ett efterföljande steg failar. Misslyckas
 * projekt-skapandet skapas i stället ett godkännande-kort så hantverkaren SER
 * det i UI:t i stället för att det tyst försvinner.
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

  // ── Bekräftelsemejl till kunden ──────────────────────────────────────
  try {
    const { sendQuoteSignedConfirmation } = await import('@/lib/quote-confirmation-email')
    await sendQuoteSignedConfirmation(input.businessId, input.quoteId)
    result.confirmationSent = true
  } catch (err) {
    console.error('[finalize-accepted] bekräftelsemejl misslyckades (icke-blockerande):', err)
  }

  // ── Projekt ur den accepterade offerten ──────────────────────────────
  try {
    const { createProjectFromQuote } = await import('@/lib/projects/create-from-quote')
    const projectResult = await createProjectFromQuote(input.businessId, input.quoteId)

    if (projectResult.success) {
      result.projectCreated = true
      console.log(`[finalize-accepted] projekt ${projectResult.project_id} skapat från offert ${input.quoteId} (${input.source})`)
    } else {
      console.error(
        `[finalize-accepted] KRITISKT: projekt kunde inte skapas för offert ${input.quoteId}: ${projectResult.error}`,
      )
      await createManualProjectApproval(supabase, input, projectResult.error || 'okänt fel')
    }
  } catch (err) {
    console.error('[finalize-accepted] projekt-skapande kastade (icke-blockerande):', err)
    await createManualProjectApproval(supabase, input, err instanceof Error ? err.message : String(err))
  }

  // ── Deal → vunnen ────────────────────────────────────────────────────
  try {
    const { data: linkedDeal } = await supabase
      .from('deal')
      .select('id')
      .eq('business_id', input.businessId)
      .eq('quote_id', input.quoteId)
      .maybeSingle()

    if (linkedDeal) {
      const { moveDeal } = await import('@/lib/pipeline')
      await moveDeal({
        dealId: linkedDeal.id,
        businessId: input.businessId,
        toStageSlug: 'won',
        triggeredBy: 'system',
        aiReason: `Offert accepterad (${input.source}) — deal vunnen`,
      })
      result.dealMoved = true
    }
  } catch (err) {
    console.error('[finalize-accepted] deal-flytt misslyckades (icke-blockerande):', err)
  }

  return result
}

/**
 * Hantverkaren MÅSTE få veta att projektet inte skapades — kunden har redan
 * fått sin bekräftelse, så ett tyst fel betyder ett jobb ingen utför.
 */
async function createManualProjectApproval(
  supabase: SupabaseClient,
  input: FinalizeAcceptedQuoteInput,
  error: string,
): Promise<void> {
  try {
    await supabase.from('pending_approvals').insert({
      business_id: input.businessId,
      approval_type: 'manual_project_create',
      title: `Skapa projekt manuellt — ${input.quoteTitle || input.quoteId}`,
      description: `Offerten accepterades av kunden (${input.customerName || 'okänd'}) via ${input.source}, men projektet kunde inte skapas automatiskt: ${error}. Kunden har fått bekräftelse — skapa projektet manuellt.`,
      payload: {
        quote_id: input.quoteId,
        quote_number: input.quoteNumber || null,
        quote_title: input.quoteTitle || null,
        customer_id: input.customerId || null,
        customer_name: input.customerName || null,
        customer_phone: input.customerPhone || null,
        total: input.total ?? null,
        accepted_at: new Date().toISOString(),
        source: input.source,
        error,
      },
      status: 'pending',
      risk_level: 'high',
    })
  } catch (err) {
    console.error('[finalize-accepted] kunde inte skapa manual_project_create-kort:', err)
  }
}
