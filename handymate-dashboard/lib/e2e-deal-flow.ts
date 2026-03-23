/**
 * E2E Deal Flow Engine
 *
 * Orkestrerar hela livscykeln för en affär från lead till betalning.
 * Varje steg körs antingen automatiskt (låg risk) eller skapar ett godkännande (hög risk).
 * Flödet fortsätter automatiskt när godkännanden hanteras.
 */

import { getServerSupabase } from '@/lib/supabase'

// ── Stegdefinitioner med risknivåer ──────────────────────

export interface DealFlowStep {
  key: string
  label: string
  auto: boolean
  risk: 'low' | 'medium' | 'high'
}

export const DEAL_FLOW_STEPS: DealFlowStep[] = [
  { key: 'lead_qualified', label: 'Lead kvalificerad', auto: true, risk: 'low' },
  { key: 'site_visit_suggested', label: 'Platsbesök föreslagen', auto: false, risk: 'medium' },
  { key: 'quote_generated', label: 'Offert genererad', auto: true, risk: 'low' },
  { key: 'quote_sent', label: 'Offert skickad', auto: false, risk: 'high' },
  { key: 'quote_signed', label: 'Offert signerad', auto: true, risk: 'low' },
  { key: 'project_created', label: 'Projekt skapat', auto: true, risk: 'low' },
  { key: 'work_completed', label: 'Arbete slutfört', auto: false, risk: 'low' },
  { key: 'invoice_generated', label: 'Faktura genererad', auto: true, risk: 'low' },
  { key: 'invoice_sent', label: 'Faktura skickad', auto: false, risk: 'high' },
  { key: 'payment_received', label: 'Betalning mottagen', auto: true, risk: 'low' },
  { key: 'review_requested', label: 'Recension begärd', auto: true, risk: 'low' },
]

export type DealFlowStepKey = typeof DEAL_FLOW_STEPS[number]['key']

export type DealFlowAction =
  | 'auto_executed'
  | 'approval_created'
  | 'waiting'
  | 'completed'

export interface AdvanceResult {
  nextStep: string | null
  action: DealFlowAction
  detail?: string
}

// ── Helpers ──────────────────────────────────────────────

function getStepIndex(key: string): number {
  return DEAL_FLOW_STEPS.findIndex(s => s.key === key)
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

// ── Huvudfunktioner ──────────────────────────────────────

/**
 * Avancera deal-flödet till nästa steg.
 * Anropas när ett steg slutförs — antingen auto eller manuellt.
 */
export async function advanceDealFlow(
  businessId: string,
  dealId: string,
  completedStep: string,
  stepData?: Record<string, unknown>
): Promise<AdvanceResult> {
  const supabase = getServerSupabase()

  const stepIdx = getStepIndex(completedStep)
  if (stepIdx < 0) {
    return { nextStep: null, action: 'waiting', detail: `Okänt steg: ${completedStep}` }
  }

  // Logga slutfört steg
  await logDealFlowStep(businessId, dealId, completedStep, 'completed', stepData)

  // Om sista steget — flödet är klart
  if (stepIdx >= DEAL_FLOW_STEPS.length - 1) {
    await updateDealFlowStatus(businessId, dealId, 'completed', completedStep)
    return { nextStep: null, action: 'completed', detail: 'Deal-flödet är slutfört' }
  }

  const next = DEAL_FLOW_STEPS[stepIdx + 1]

  // Kör steg-specifik logik för just slutfört steg
  await executeStepSideEffects(businessId, dealId, completedStep, stepData)

  // Uppdatera deal-flödets nuvarande steg
  await updateDealFlowStatus(businessId, dealId, 'active', next.key)

  // Om nästa steg är auto — kör det direkt
  if (next.auto) {
    const autoResult = await executeAutoStep(businessId, dealId, next.key, stepData)
    if (autoResult.executed) {
      // Rekursivt avancera om auto-steget lyckades
      return advanceDealFlow(businessId, dealId, next.key, {
        ...stepData,
        ...autoResult.data,
      })
    }
    // Auto-steg kunde inte köras (t.ex. väntar på extern händelse)
    return {
      nextStep: next.key,
      action: 'waiting',
      detail: autoResult.reason || `Väntar på ${next.label}`,
    }
  }

  // Steg kräver manuell åtgärd eller godkännande
  if (next.risk === 'high' || next.risk === 'medium') {
    await createDealFlowApproval(businessId, dealId, next)
    return {
      nextStep: next.key,
      action: 'approval_created',
      detail: `Godkännande skapat för: ${next.label}`,
    }
  }

  return {
    nextStep: next.key,
    action: 'waiting',
    detail: `Väntar på manuell åtgärd: ${next.label}`,
  }
}

/**
 * Hook som anropas av orchestratorn vid deal-relaterade events.
 * Mappar events till deal-flödesstegs-avancering.
 */
export async function onDealEvent(
  businessId: string,
  event: string,
  eventData: Record<string, unknown>
): Promise<void> {
  const supabase = getServerSupabase()

  try {
    // Hitta deal baserat på event-data
    const dealId = await resolveDealId(businessId, event, eventData)
    if (!dealId) {
      console.log(`[DealFlow] Ingen deal hittad för event ${event}`)
      return
    }

    // Mappa event till slutfört steg
    const completedStep = mapEventToStep(event, eventData)
    if (!completedStep) {
      console.log(`[DealFlow] Event ${event} mappas inte till något deal-steg`)
      return
    }

    // Kontrollera att flödet finns och är aktivt
    const { data: flow } = await supabase
      .from('deal_flow')
      .select('*')
      .eq('deal_id', dealId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (!flow) {
      // Skapa nytt flöde om det inte finns
      if (completedStep === 'lead_qualified') {
        await initDealFlow(businessId, dealId)
        await advanceDealFlow(businessId, dealId, completedStep, eventData)
      }
      return
    }

    if (flow.status === 'completed' || flow.status === 'cancelled') {
      return
    }

    await advanceDealFlow(businessId, dealId, completedStep, eventData)
  } catch (err: any) {
    console.error(`[DealFlow] onDealEvent error (${event}):`, err.message)
  }
}

// ── Initiering ───────────────────────────────────────────

/**
 * Initiera deal-flödet för en deal.
 * Skapar en deal_flow-rad som trackar nuvarande steg.
 */
export async function initDealFlow(
  businessId: string,
  dealId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServerSupabase()

  // Kolla om flöde redan finns
  const { data: existing } = await supabase
    .from('deal_flow')
    .select('id')
    .eq('deal_id', dealId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (existing) {
    return { success: true }
  }

  const { error } = await supabase.from('deal_flow').insert({
    business_id: businessId,
    deal_id: dealId,
    current_step: 'lead_qualified',
    status: 'active',
    started_at: new Date().toISOString(),
  })

  if (error) {
    console.error('[DealFlow] Init error:', error.message)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// ── Status ───────────────────────────────────────────────

/**
 * Hämta deal-flödets status för en deal.
 */
export async function getDealFlowStatus(
  businessId: string,
  dealId: string
): Promise<{
  flow: Record<string, unknown> | null
  steps: Array<DealFlowStep & { status: 'completed' | 'current' | 'pending'; completed_at?: string }>
  currentStep: string | null
  progress: number
}> {
  const supabase = getServerSupabase()

  const { data: flow } = await supabase
    .from('deal_flow')
    .select('*')
    .eq('deal_id', dealId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (!flow) {
    return {
      flow: null,
      steps: DEAL_FLOW_STEPS.map(s => ({ ...s, status: 'pending' as const })),
      currentStep: null,
      progress: 0,
    }
  }

  // Hämta logg för slutförda steg
  const { data: logs } = await supabase
    .from('deal_flow_log')
    .select('step_key, status, created_at')
    .eq('deal_id', dealId)
    .eq('business_id', businessId)
    .eq('status', 'completed')
    .order('created_at', { ascending: true })

  const completedSteps = new Map<string, string>()
  for (const log of (logs || [])) {
    completedSteps.set(log.step_key, log.created_at)
  }

  const currentStepKey = flow.current_step as string

  const steps = DEAL_FLOW_STEPS.map((s) => {
    if (completedSteps.has(s.key)) {
      return { ...s, status: 'completed' as const, completed_at: completedSteps.get(s.key) }
    }
    if (s.key === currentStepKey) {
      return { ...s, status: 'current' as const }
    }
    return { ...s, status: 'pending' as const }
  })

  const completedCount = completedSteps.size
  const progress = Math.round((completedCount / DEAL_FLOW_STEPS.length) * 100)

  return {
    flow,
    steps,
    currentStep: currentStepKey,
    progress,
  }
}

// ── Auto-steg exekvering ─────────────────────────────────

async function executeAutoStep(
  businessId: string,
  dealId: string,
  stepKey: string,
  previousData?: Record<string, unknown>
): Promise<{ executed: boolean; reason?: string; data?: Record<string, unknown> }> {
  switch (stepKey) {
    case 'lead_qualified':
      return { executed: true, data: { qualified_at: new Date().toISOString() } }

    case 'quote_generated':
      return executeQuoteGeneration(businessId, dealId)

    case 'quote_signed':
      // Väntar på extern händelse (kunden signerar)
      return { executed: false, reason: 'Väntar på att kunden signerar offerten' }

    case 'project_created':
      return executeProjectCreation(businessId, dealId)

    case 'invoice_generated':
      return executeInvoiceGeneration(businessId, dealId)

    case 'payment_received':
      // Väntar på extern händelse (betalning)
      return { executed: false, reason: 'Väntar på betalning' }

    case 'review_requested':
      return executeReviewRequest(businessId, dealId)

    default:
      return { executed: false, reason: `Inget auto-beteende för steg ${stepKey}` }
  }
}

// ── Steg-specifika side effects ──────────────────────────

async function executeStepSideEffects(
  businessId: string,
  dealId: string,
  completedStep: string,
  stepData?: Record<string, unknown>
): Promise<void> {
  const supabase = getServerSupabase()

  switch (completedStep) {
    case 'quote_signed': {
      // Flytta deal till "Vunnen"
      try {
        const { moveDeal } = await import('@/lib/pipeline')
        await moveDeal({
          dealId,
          businessId,
          toStageSlug: 'won',
          triggeredBy: 'system',
          aiReason: 'Offert signerad — deal automatiskt markerad som vunnen',
        })
      } catch (err: any) {
        console.error('[DealFlow] Kunde inte flytta deal till Vunnen:', err.message)
      }

      // Logga aktivitet
      await logDealFlowActivity(
        businessId,
        dealId,
        'Projekt skapat automatiskt från signerad offert'
      )
      break
    }

    case 'work_completed': {
      // Skapa godkännande för fakturagenrering
      await logDealFlowActivity(
        businessId,
        dealId,
        'Arbete markerat som slutfört — faktura genereras'
      )
      break
    }

    case 'payment_received': {
      // Markera deal som avslutad
      await updateDealFlowStatus(businessId, dealId, 'active', 'review_requested')

      // Schemalägg garantiuppföljning (12 månader)
      try {
        const { enrollInSequence } = await import('@/lib/nurture')
        const deal = await getDealData(businessId, dealId)
        if (deal?.customer_id) {
          await enrollInSequence({
            businessId,
            triggerType: 'job_completed',
            customerId: deal.customer_id,
            dealId,
          })
        }
      } catch { /* fire-and-forget */ }

      await logDealFlowActivity(
        businessId,
        dealId,
        'Betalning mottagen — recensionsbegäran schemalagd, garantiuppföljning aktiverad'
      )
      break
    }

    case 'lead_qualified': {
      // Föreslå platsbesök med tillgängliga tider om lead är het
      const isHot = stepData?.temperature === 'hot' || stepData?.priority === 'high'
      if (isHot) {
        await suggestSiteVisit(businessId, dealId)
      }
      break
    }
  }
}

// ── Auto-steg implementationer ───────────────────────────

async function executeQuoteGeneration(
  businessId: string,
  dealId: string
): Promise<{ executed: boolean; reason?: string; data?: Record<string, unknown> }> {
  const supabase = getServerSupabase()

  try {
    const deal = await getDealData(businessId, dealId)
    if (!deal) return { executed: false, reason: 'Deal hittades inte' }

    // Kontrollera om offert redan finns
    if (deal.quote_id) {
      return { executed: true, data: { quote_id: deal.quote_id, already_exists: true } }
    }

    // Hämta affärskonfiguration
    const { data: config } = await supabase
      .from('business_config')
      .select('branch, default_hourly_rate, pricing_settings')
      .eq('business_id', businessId)
      .single()

    const hourlyRate = config?.default_hourly_rate
      || (config?.pricing_settings as any)?.default_hourly_rate
      || 500

    const description = deal.description || deal.title || 'Offert'

    // Försök AI-generering
    try {
      const { generateQuoteFromInput } = await import('@/lib/ai-quote-generator')
      const aiQuote = await generateQuoteFromInput({
        businessId,
        branch: config?.branch || 'Bygg',
        hourlyRate,
        textDescription: description,
        customerId: deal.customer_id || undefined,
      })

      // Spara offert
      const items = aiQuote.items.map((item: any) => ({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unitPrice,
        total: Math.round(item.quantity * item.unitPrice * 100) / 100,
        type: item.type || 'material',
      }))

      const laborTotal = items.filter((i: any) => i.type === 'labor').reduce((s: number, i: any) => s + i.total, 0)
      const materialTotal = items.filter((i: any) => i.type !== 'labor').reduce((s: number, i: any) => s + i.total, 0)
      const subtotal = laborTotal + materialTotal

      const { data: quote, error: quoteErr } = await supabase
        .from('quotes')
        .insert({
          business_id: businessId,
          customer_id: deal.customer_id,
          title: aiQuote.jobTitle || deal.title || 'Offert',
          description: aiQuote.jobDescription || description,
          items,
          labor_total: laborTotal,
          material_total: materialTotal,
          total: subtotal,
          vat_rate: 25,
          vat: Math.round(subtotal * 0.25),
          total_with_vat: Math.round(subtotal * 1.25),
          rot_rut_type: aiQuote.suggestedDeductionType !== 'none' ? aiQuote.suggestedDeductionType : null,
          status: 'draft',
          valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          source: 'deal_flow_auto',
          notes: `Automatiskt genererad av deal-flödet (konfidens: ${aiQuote.confidence}%)`,
        })
        .select('quote_id')
        .single()

      if (quoteErr) {
        return { executed: false, reason: `Offertgenerering misslyckades: ${quoteErr.message}` }
      }

      // Länka offert till deal
      await supabase.from('deal').update({ quote_id: quote!.quote_id }).eq('id', dealId)

      await logDealFlowActivity(businessId, dealId, `AI-offert genererad: ${aiQuote.jobTitle} (${Math.round(subtotal)} kr exkl moms)`)

      return { executed: true, data: { quote_id: quote!.quote_id, total: subtotal } }
    } catch (aiErr: any) {
      console.error('[DealFlow] AI-offertgenerering misslyckades:', aiErr.message)
      return { executed: false, reason: `AI-offertgenerering misslyckades: ${aiErr.message}` }
    }
  } catch (err: any) {
    return { executed: false, reason: err.message }
  }
}

async function executeProjectCreation(
  businessId: string,
  dealId: string
): Promise<{ executed: boolean; reason?: string; data?: Record<string, unknown> }> {
  const supabase = getServerSupabase()

  try {
    const deal = await getDealData(businessId, dealId)
    if (!deal) return { executed: false, reason: 'Deal hittades inte' }

    // Kontrollera om projekt redan finns
    const { data: existingProject } = await supabase
      .from('project')
      .select('project_id')
      .eq('deal_id', dealId)
      .maybeSingle()

    if (existingProject) {
      return { executed: true, data: { project_id: existingProject.project_id, already_exists: true } }
    }

    // Hämta offert-data för budget
    let budgetAmount: number | null = null
    let budgetHours: number | null = null
    let projectType = 'hourly'

    if (deal.quote_id) {
      const { data: quote } = await supabase
        .from('quotes')
        .select('items, total, labor_total, material_total')
        .eq('quote_id', deal.quote_id)
        .single()

      if (quote) {
        budgetAmount = quote.total || null
        if (quote.items && Array.isArray(quote.items)) {
          const laborHours = (quote.items as any[])
            .filter((i: any) => i.type === 'labor')
            .reduce((sum: number, i: any) => sum + (i.quantity || 0), 0)
          budgetHours = laborHours || null

          if (laborHours > 0 && (quote.items as any[]).some((i: any) => i.type === 'material')) {
            projectType = 'mixed'
          } else if (laborHours > 0) {
            projectType = 'hourly'
          } else {
            projectType = 'fixed_price'
          }
        }
      }
    }

    const projectId = 'proj_' + Math.random().toString(36).substring(2, 14)

    const { error: insertErr } = await supabase.from('project').insert({
      project_id: projectId,
      business_id: businessId,
      customer_id: deal.customer_id,
      deal_id: dealId,
      quote_id: deal.quote_id,
      name: deal.title || 'Nytt projekt',
      description: deal.description,
      project_type: projectType,
      budget_hours: budgetHours,
      budget_amount: budgetAmount || deal.value || null,
      status: 'active',
      source_lead_data: {
        created_from: 'deal_flow_auto',
        deal_id: dealId,
        created_at: new Date().toISOString(),
      },
    })

    if (insertErr) {
      return { executed: false, reason: `Projektgenerering misslyckades: ${insertErr.message}` }
    }

    // Länka projekt till deal
    await supabase.from('deal').update({ project_id: projectId }).eq('id', dealId)

    await logDealFlowActivity(
      businessId,
      dealId,
      `Projekt skapat automatiskt från signerad offert: ${deal.title || 'Nytt projekt'}`
    )

    return { executed: true, data: { project_id: projectId } }
  } catch (err: any) {
    return { executed: false, reason: err.message }
  }
}

async function executeInvoiceGeneration(
  businessId: string,
  dealId: string
): Promise<{ executed: boolean; reason?: string; data?: Record<string, unknown> }> {
  const supabase = getServerSupabase()

  try {
    const deal = await getDealData(businessId, dealId)
    if (!deal) return { executed: false, reason: 'Deal hittades inte' }

    // Hitta projekt kopplat till denna deal
    const { data: project } = await supabase
      .from('project')
      .select('project_id, name')
      .eq('deal_id', dealId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (!project) {
      return { executed: false, reason: 'Inget projekt kopplat till denna deal' }
    }

    // Kontrollera om faktura redan finns
    if (deal.invoice_id) {
      return { executed: true, data: { invoice_id: deal.invoice_id, already_exists: true } }
    }

    // Hämta fakturaunderlag via intern logik (samma som from-project route)
    const { data: timeEntries } = await supabase
      .from('time_entry')
      .select('time_entry_id, description, work_date, duration_minutes, hourly_rate, is_billable')
      .eq('business_id', businessId)
      .eq('project_id', project.project_id)
      .or('invoiced.is.null,invoiced.eq.false')
      .eq('is_billable', true)

    const { data: materials } = await supabase
      .from('project_material')
      .select('material_id, name, unit, quantity, purchase_price, sell_price, total_sell')
      .eq('business_id', businessId)
      .eq('project_id', project.project_id)
      .or('invoiced.is.null,invoiced.eq.false')

    const { data: config } = await supabase
      .from('business_config')
      .select('default_hourly_rate, default_payment_days, invoice_prefix, next_invoice_number, bankgiro_number, plusgiro, swish_number')
      .eq('business_id', businessId)
      .single()

    // Bygg fakturarader
    const items: any[] = []
    const sourceTimeEntryIds: string[] = []
    const sourceMaterialIds: string[] = []

    for (const te of (timeEntries || [])) {
      const hours = (te.duration_minutes || 0) / 60
      const rate = te.hourly_rate || config?.default_hourly_rate || 895
      items.push({
        description: te.description || `Arbete ${te.work_date}`,
        quantity: Math.round(hours * 100) / 100,
        unit: 'tim',
        unit_price: rate,
        total: Math.round(hours * rate),
        is_rot_eligible: true,
        is_rut_eligible: false,
      })
      sourceTimeEntryIds.push(te.time_entry_id)
    }

    for (const m of (materials || [])) {
      items.push({
        description: m.name || 'Material',
        quantity: m.quantity || 1,
        unit: m.unit || 'st',
        unit_price: m.sell_price || m.purchase_price || 0,
        total: m.total_sell || Math.round((m.quantity || 1) * (m.sell_price || m.purchase_price || 0)),
        is_rot_eligible: false,
        is_rut_eligible: false,
      })
      sourceMaterialIds.push(m.material_id)
    }

    if (items.length === 0) {
      // Ingen fakturerbar tid eller material — skapa godkännande istället
      await createDealFlowApproval(businessId, dealId, {
        key: 'invoice_generated',
        label: 'Faktura genererad',
        auto: false,
        risk: 'medium',
      }, 'Inga fakturerbara poster hittades — lägg till tid/material manuellt')

      return { executed: false, reason: 'Inga fakturerbara poster — manuell fakturering krävs' }
    }

    // Skapa faktura
    const prefix = config?.invoice_prefix || 'FV'
    const seqNum = config?.next_invoice_number || 1
    const invoiceNumber = `${prefix}-${new Date().getFullYear()}-${String(seqNum).padStart(3, '0')}`
    const invoiceId = `inv_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 6)}`
    const subtotal = items.reduce((s: number, i: any) => s + (i.total || 0), 0)
    const vatAmount = Math.round(subtotal * 0.25)
    const total = subtotal + vatAmount

    const dueDate = new Date()
    dueDate.setDate(dueDate.getDate() + (config?.default_payment_days || 30))

    const { error: invoiceErr } = await supabase.from('invoice').insert({
      invoice_id: invoiceId,
      business_id: businessId,
      customer_id: deal.customer_id,
      invoice_number: invoiceNumber,
      invoice_type: 'standard',
      status: 'draft',
      items,
      subtotal,
      vat_rate: 25,
      vat_amount: vatAmount,
      total,
      customer_pays: total,
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: dueDate.toISOString().split('T')[0],
      bankgiro_number: config?.bankgiro_number || null,
      plusgiro: config?.plusgiro || null,
      swish_number: config?.swish_number || null,
    })

    if (invoiceErr) {
      return { executed: false, reason: `Fakturagenerering misslyckades: ${invoiceErr.message}` }
    }

    // Markera tidposter och material som fakturerade
    if (sourceTimeEntryIds.length > 0) {
      await supabase
        .from('time_entry')
        .update({ invoiced: true, invoice_id: invoiceId })
        .in('time_entry_id', sourceTimeEntryIds)
    }
    if (sourceMaterialIds.length > 0) {
      await supabase
        .from('project_material')
        .update({ invoiced: true, invoice_id: invoiceId })
        .in('material_id', sourceMaterialIds)
    }

    // Inkrementera fakturanummer
    await supabase
      .from('business_config')
      .update({ next_invoice_number: seqNum + 1 })
      .eq('business_id', businessId)

    // Länka faktura till deal
    await supabase.from('deal').update({ invoice_id: invoiceId }).eq('id', dealId)

    // Skapa godkännande för att skicka fakturan
    await createDealFlowApproval(businessId, dealId, {
      key: 'invoice_sent',
      label: 'Faktura skickad',
      auto: false,
      risk: 'high',
    }, `Faktura ${invoiceNumber} redo att skickas — granska och godkänn (${total} kr inkl moms)`)

    await logDealFlowActivity(
      businessId,
      dealId,
      `Faktura ${invoiceNumber} genererad automatiskt (${total} kr inkl moms)`
    )

    return { executed: true, data: { invoice_id: invoiceId, invoice_number: invoiceNumber, total } }
  } catch (err: any) {
    return { executed: false, reason: err.message }
  }
}

async function executeReviewRequest(
  businessId: string,
  dealId: string
): Promise<{ executed: boolean; reason?: string; data?: Record<string, unknown> }> {
  const supabase = getServerSupabase()

  try {
    const deal = await getDealData(businessId, dealId)
    if (!deal?.customer_id) {
      return { executed: false, reason: 'Ingen kund kopplad till deal' }
    }

    // Hämta kundinformation
    const { data: customer } = await supabase
      .from('customer')
      .select('name, phone_number, email')
      .eq('customer_id', deal.customer_id)
      .single()

    if (!customer?.phone_number) {
      return { executed: false, reason: 'Kunden saknar telefonnummer' }
    }

    // Hämta företagsinformation
    const { data: business } = await supabase
      .from('business_config')
      .select('business_name')
      .eq('business_id', businessId)
      .single()

    const businessName = business?.business_name || 'Handymate'
    const customerName = customer.name || 'kund'

    // Schemalägg SMS-begäran om recension (24h fördröjning via nurture)
    try {
      const { enrollInSequence } = await import('@/lib/nurture')
      await enrollInSequence({
        businessId,
        triggerType: 'job_completed',
        customerId: deal.customer_id,
        dealId,
      })
    } catch {
      // Fallback: skicka direkt (om nurture inte finns)
      const ELKS_USER = process.env.ELKS_API_USER
      const ELKS_PASS = process.env.ELKS_API_PASSWORD

      if (ELKS_USER && ELKS_PASS) {
        try {
          await fetch('https://api.46elks.com/a1/sms', {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${ELKS_USER}:${ELKS_PASS}`).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              from: businessName.substring(0, 11),
              to: customer.phone_number,
              message: `Hej ${customerName}! Tack för att du anlitade ${businessName}. Vi hoppas du är nöjd! En kort recension hjälper oss och andra kunder. //${businessName}`,
            }).toString(),
          })
        } catch { /* fire-and-forget */ }
      }
    }

    await logDealFlowActivity(businessId, dealId, 'Recensionsbegäran skickad till kund')

    return { executed: true, data: { review_sent_to: customer.phone_number } }
  } catch (err: any) {
    return { executed: false, reason: err.message }
  }
}

// ── Platsbesök-förslag ──────────────────────────────────

async function suggestSiteVisit(
  businessId: string,
  dealId: string
): Promise<void> {
  const supabase = getServerSupabase()

  try {
    const deal = await getDealData(businessId, dealId)
    if (!deal) return

    const customerName = deal.customer?.name || 'Kunden'

    // Skapa godkännande med föreslagna tider
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)

    const suggestedSlots = []
    for (let d = new Date(tomorrow); d <= nextWeek; d.setDate(d.getDate() + 1)) {
      const day = d.getDay()
      if (day === 0 || day === 6) continue // Hoppa över helger
      suggestedSlots.push({
        date: d.toISOString().split('T')[0],
        time: '10:00',
        label: `${d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })} kl 10:00`,
      })
      if (suggestedSlots.length >= 3) break
    }

    const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    await supabase.from('pending_approvals').insert({
      id,
      business_id: businessId,
      approval_type: 'deal_flow_site_visit',
      title: `Platsbesök föreslaget: ${customerName}`,
      description: `Hett lead "${deal.title}" — boka platsbesök för att komma vidare.\n\nFöreslagna tider:\n${suggestedSlots.map(s => `• ${s.label}`).join('\n')}`,
      payload: {
        deal_id: dealId,
        customer_id: deal.customer_id,
        step: 'site_visit_suggested',
        suggested_slots: suggestedSlots,
      },
      status: 'pending',
      risk_level: 'medium',
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    })

    // Push-notis
    fetch(`${APP_URL}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        title: 'Platsbesök föreslaget',
        body: `Hett lead: ${deal.title} — boka platsbesök`,
        url: '/dashboard/approvals',
      }),
    }).catch(() => {})
  } catch (err: any) {
    console.error('[DealFlow] suggestSiteVisit error:', err.message)
  }
}

// ── Godkännande ──────────────────────────────────────────

async function createDealFlowApproval(
  businessId: string,
  dealId: string,
  step: DealFlowStep,
  customDescription?: string
): Promise<void> {
  const supabase = getServerSupabase()

  const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

  await supabase.from('pending_approvals').insert({
    id,
    business_id: businessId,
    approval_type: `deal_flow_${step.key}`,
    title: `Deal-flöde: ${step.label}`,
    description: customDescription || `Godkännande krävs för att gå vidare med: ${step.label}`,
    payload: {
      deal_id: dealId,
      step: step.key,
      risk: step.risk,
    },
    status: 'pending',
    risk_level: step.risk,
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  })

  // Push-notis för high-risk
  if (step.risk === 'high') {
    fetch(`${APP_URL}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: businessId,
        title: 'Godkännande krävs',
        body: `Deal-flöde: ${step.label}`,
        url: '/dashboard/approvals',
      }),
    }).catch(() => {})
  }
}

// ── Event → Steg-mappning ────────────────────────────────

function mapEventToStep(
  event: string,
  eventData: Record<string, unknown>
): string | null {
  const mapping: Record<string, string> = {
    lead_qualified: 'lead_qualified',
    lead_created: 'lead_qualified',
    site_visit_completed: 'site_visit_suggested',
    site_visit_booked: 'site_visit_suggested',
    quote_generated: 'quote_generated',
    quote_created: 'quote_generated',
    quote_sent: 'quote_sent',
    quote_signed: 'quote_signed',
    quote_accepted: 'quote_signed',
    project_created: 'project_created',
    work_completed: 'work_completed',
    job_completed: 'work_completed',
    invoice_created: 'invoice_generated',
    invoice_generated: 'invoice_generated',
    invoice_sent: 'invoice_sent',
    payment_received: 'payment_received',
    invoice_paid: 'payment_received',
    review_received: 'review_requested',
    review_requested: 'review_requested',
  }

  return mapping[event] || null
}

async function resolveDealId(
  businessId: string,
  event: string,
  eventData: Record<string, unknown>
): Promise<string | null> {
  // Direkt deal_id i event-data
  if (eventData.deal_id && typeof eventData.deal_id === 'string') {
    return eventData.deal_id
  }

  const supabase = getServerSupabase()

  // Försök via quote_id
  if (eventData.quote_id) {
    const { data } = await supabase
      .from('deal')
      .select('id')
      .eq('business_id', businessId)
      .eq('quote_id', eventData.quote_id as string)
      .maybeSingle()
    if (data) return data.id
  }

  // Försök via invoice_id
  if (eventData.invoice_id) {
    const { data } = await supabase
      .from('deal')
      .select('id')
      .eq('business_id', businessId)
      .eq('invoice_id', eventData.invoice_id as string)
      .maybeSingle()
    if (data) return data.id
  }

  // Försök via project_id
  if (eventData.project_id) {
    const { data } = await supabase
      .from('deal')
      .select('id')
      .eq('business_id', businessId)
      .eq('project_id', eventData.project_id as string)
      .maybeSingle()
    if (data) return data.id

    // Försök via project-tabell
    const { data: project } = await supabase
      .from('project')
      .select('deal_id')
      .eq('project_id', eventData.project_id as string)
      .maybeSingle()
    if (project?.deal_id) return project.deal_id
  }

  // Försök via customer_id
  if (eventData.customer_id) {
    const { data } = await supabase
      .from('deal')
      .select('id')
      .eq('business_id', businessId)
      .eq('customer_id', eventData.customer_id as string)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) return data.id
  }

  return null
}

// ── Databas-hjälpfunktioner ──────────────────────────────

async function getDealData(
  businessId: string,
  dealId: string
): Promise<any | null> {
  const supabase = getServerSupabase()
  const { data } = await supabase
    .from('deal')
    .select('*, customer:customer(*)')
    .eq('id', dealId)
    .eq('business_id', businessId)
    .single()
  return data
}

async function updateDealFlowStatus(
  businessId: string,
  dealId: string,
  status: 'active' | 'completed' | 'cancelled',
  currentStep: string
): Promise<void> {
  const supabase = getServerSupabase()

  const updateData: Record<string, unknown> = {
    current_step: currentStep,
    status,
    updated_at: new Date().toISOString(),
  }

  if (status === 'completed') {
    updateData.completed_at = new Date().toISOString()
  }

  await supabase
    .from('deal_flow')
    .update(updateData)
    .eq('deal_id', dealId)
    .eq('business_id', businessId)
}

async function logDealFlowStep(
  businessId: string,
  dealId: string,
  stepKey: string,
  status: 'completed' | 'skipped' | 'failed',
  data?: Record<string, unknown>
): Promise<void> {
  const supabase = getServerSupabase()

  try {
    await supabase.from('deal_flow_log').insert({
      business_id: businessId,
      deal_id: dealId,
      step_key: stepKey,
      status,
      data: data || {},
    })
  } catch (err: any) {
    console.error('[DealFlow] Loggfel:', err.message)
  }
}

async function logDealFlowActivity(
  businessId: string,
  dealId: string,
  description: string
): Promise<void> {
  const supabase = getServerSupabase()

  try {
    await supabase.from('pipeline_activity').insert({
      business_id: businessId,
      deal_id: dealId,
      activity_type: 'deal_flow',
      description,
      triggered_by: 'system',
    })
  } catch { /* fire-and-forget */ }
}

// ── SQL-migrering ────────────────────────────────────────

/**
 * SQL för att skapa tabellerna som krävs.
 * Kör manuellt i Supabase SQL Editor.
 *
 * CREATE TABLE IF NOT EXISTS deal_flow (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   business_id TEXT NOT NULL REFERENCES business_config(business_id),
 *   deal_id TEXT NOT NULL,
 *   current_step TEXT NOT NULL DEFAULT 'lead_qualified',
 *   status TEXT NOT NULL DEFAULT 'active',
 *   started_at TIMESTAMPTZ DEFAULT NOW(),
 *   completed_at TIMESTAMPTZ,
 *   updated_at TIMESTAMPTZ DEFAULT NOW(),
 *   UNIQUE(business_id, deal_id)
 * );
 *
 * CREATE TABLE IF NOT EXISTS deal_flow_log (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   business_id TEXT NOT NULL,
 *   deal_id TEXT NOT NULL,
 *   step_key TEXT NOT NULL,
 *   status TEXT NOT NULL DEFAULT 'completed',
 *   data JSONB DEFAULT '{}',
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 *
 * CREATE INDEX idx_deal_flow_business ON deal_flow(business_id);
 * CREATE INDEX idx_deal_flow_deal ON deal_flow(deal_id);
 * CREATE INDEX idx_deal_flow_log_deal ON deal_flow_log(deal_id);
 */
