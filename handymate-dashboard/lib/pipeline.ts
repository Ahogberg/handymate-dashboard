import { getServerSupabase } from '@/lib/supabase'

export interface PipelineStage {
  id: string
  business_id: string
  name: string
  slug: string
  color: string
  sort_order: number
  is_system: boolean
  is_won: boolean
  is_lost: boolean
}

export interface Deal {
  id: string
  business_id: string
  customer_id: string | null
  quote_id: string | null
  order_id: string | null
  invoice_id: string | null
  title: string
  description: string | null
  value: number | null
  stage_id: string
  assigned_to: string | null
  source: string | null
  source_call_id: string | null
  priority: string
  expected_close_date: string | null
  closed_at: string | null
  lost_reason: string | null
  created_at: string
  updated_at: string
  // Joined fields
  customer?: { name: string; phone_number: string; email: string } | null
  stage?: PipelineStage | null
}

export interface PipelineActivity {
  id: string
  deal_id: string
  activity_type: string
  description: string | null
  from_stage_id: string | null
  to_stage_id: string | null
  triggered_by: 'user' | 'ai' | 'system'
  ai_confidence: number | null
  ai_reason: string | null
  source_call_id: string | null
  undone_at: string | null
  undone_by: string | null
  created_at: string
}

export const DEFAULT_STAGES = [
  { slug: 'new_inquiry', name: 'Ny förfrågan', color: '#6B7280', sort_order: 1, is_system: true, is_won: false, is_lost: false },
  { slug: 'contacted', name: 'Kontaktad', color: '#0F766E', sort_order: 2, is_system: true, is_won: false, is_lost: false },
  { slug: 'quote_sent', name: 'Offert skickad', color: '#0D9488', sort_order: 3, is_system: true, is_won: false, is_lost: false },
  { slug: 'quote_accepted', name: 'Offert accepterad', color: '#0F766E', sort_order: 4, is_system: true, is_won: false, is_lost: false },
  { slug: 'won', name: 'Vunnen', color: '#22C55E', sort_order: 5, is_system: true, is_won: true, is_lost: false },
  { slug: 'lost', name: 'Förlorad', color: '#EF4444', sort_order: 99, is_system: true, is_won: false, is_lost: true },
]

export async function ensureDefaultStages(businessId: string): Promise<PipelineStage[]> {
  const supabase = getServerSupabase()

  const { data: existing } = await supabase
    .from('pipeline_stage')
    .select('*')
    .eq('business_id', businessId)
    .order('sort_order')

  if (existing && existing.length > 0) {
    // Check if stages need migration (old 8-stage setup → new 6-stage)
    const hasCurrent = existing.some((s: any) => s.slug === 'contacted' || s.slug === 'negotiation' || s.slug === 'won')
    if (hasCurrent) return existing

    // Check if any deals exist with old stages before migrating
    const { count } = await supabase
      .from('deal')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)

    if (count && count > 0) {
      // Deals exist — don't migrate, keep old stages
      return existing
    }

    // No deals — safe to replace stages
    await supabase.from('pipeline_stage').delete().eq('business_id', businessId)
  }

  const stages = DEFAULT_STAGES.map(s => ({
    business_id: businessId,
    ...s,
  }))

  const { data: created, error } = await supabase
    .from('pipeline_stage')
    .insert(stages)
    .select()

  if (error) throw error
  return created || []
}

export async function getStageBySlug(businessId: string, slug: string): Promise<PipelineStage | null> {
  const supabase = getServerSupabase()
  const { data } = await supabase
    .from('pipeline_stage')
    .select('*')
    .eq('business_id', businessId)
    .eq('slug', slug)
    .single()
  return data
}

export async function moveDeal(params: {
  dealId: string
  businessId: string
  toStageSlug: string
  triggeredBy: 'user' | 'ai' | 'system'
  aiConfidence?: number
  aiReason?: string
  sourceCallId?: string
}): Promise<void> {
  const supabase = getServerSupabase()

  // Get current deal
  const { data: deal } = await supabase
    .from('deal')
    .select('id, stage_id, business_id')
    .eq('id', params.dealId)
    .single()

  if (!deal) throw new Error('Deal not found')

  // Get target stage
  const toStage = await getStageBySlug(params.businessId, params.toStageSlug)
  if (!toStage) throw new Error(`Stage '${params.toStageSlug}' not found`)

  if (deal.stage_id === toStage.id) return // Already in this stage

  // Riktningsskydd: systemutlösta övergångar får ALDRIG flytta en deal bakåt
  // (utom till 'lost'). Annars kan en sen händelse — t.ex. "projekt slutfört"
  // eller "faktura skickad" som mappar till 'quote_accepted' — dra tillbaka en
  // redan vunnen deal. Användarens manuella drag tillåts korrigera åt båda håll.
  if (params.triggeredBy !== 'user' && !toStage.is_lost) {
    const { data: fromStage } = await supabase
      .from('pipeline_stage')
      .select('sort_order')
      .eq('id', deal.stage_id)
      .maybeSingle()
    if (fromStage && typeof fromStage.sort_order === 'number' && toStage.sort_order < fromStage.sort_order) {
      return // bakåtflytt blockerad för icke-användare
    }
  }

  // Update deal
  const updateData: any = {
    stage_id: toStage.id,
    updated_at: new Date().toISOString(),
  }
  if (toStage.is_won || toStage.is_lost) {
    updateData.closed_at = new Date().toISOString()
  }

  await supabase.from('deal').update(updateData).eq('id', params.dealId)

  // Log activity
  await supabase.from('pipeline_activity').insert({
    business_id: params.businessId,
    deal_id: params.dealId,
    activity_type: 'stage_changed',
    description: `Flyttad till ${toStage.name}`,
    from_stage_id: deal.stage_id,
    to_stage_id: toStage.id,
    triggered_by: params.triggeredBy,
    ai_confidence: params.aiConfidence || null,
    ai_reason: params.aiReason || null,
    source_call_id: params.sourceCallId || null,
  })
}

export async function undoActivity(activityId: string, userId: string): Promise<void> {
  const supabase = getServerSupabase()

  const { data: activity } = await supabase
    .from('pipeline_activity')
    .select('*')
    .eq('id', activityId)
    .is('undone_at', null)
    .single()

  if (!activity || !activity.from_stage_id) {
    throw new Error('Cannot undo this activity')
  }

  // Move deal back
  await supabase
    .from('deal')
    .update({
      stage_id: activity.from_stage_id,
      updated_at: new Date().toISOString(),
      closed_at: null,
    })
    .eq('id', activity.deal_id)

  // Mark activity as undone
  await supabase
    .from('pipeline_activity')
    .update({ undone_at: new Date().toISOString(), undone_by: userId })
    .eq('id', activityId)

  // Log undo activity
  await supabase.from('pipeline_activity').insert({
    business_id: activity.business_id,
    deal_id: activity.deal_id,
    activity_type: 'undo',
    description: 'Ångrade senaste flytten',
    from_stage_id: activity.to_stage_id,
    to_stage_id: activity.from_stage_id,
    triggered_by: 'user',
  })
}

export async function createDealFromCall(params: {
  businessId: string
  callId: string
  customerName?: string
  customerPhone: string
  customerId?: string
  title: string
  description?: string
  estimatedValue?: number
  priority?: string
}): Promise<Deal> {
  const supabase = getServerSupabase()

  // Get lead stage (V28-slug är 'new_inquiry', inte 'lead')
  const leadStage = await getStageBySlug(params.businessId, 'new_inquiry')
  if (!leadStage) throw new Error('Lead stage not found')

  // Find or reference customer
  let customerId = params.customerId || null
  if (!customerId && params.customerPhone) {
    const { data: existingCustomer } = await supabase
      .from('customer')
      .select('customer_id')
      .eq('business_id', params.businessId)
      .eq('phone_number', params.customerPhone)
      .single()

    if (existingCustomer) customerId = existingCustomer.customer_id
  }

  const { data: deal, error } = await supabase
    .from('deal')
    .insert({
      business_id: params.businessId,
      customer_id: customerId,
      title: params.title,
      description: params.description || null,
      value: params.estimatedValue || null,
      stage_id: leadStage.id,
      source: 'call',
      source_call_id: params.callId,
      priority: params.priority || 'medium',
    })
    .select()
    .single()

  if (error) throw error

  // Log activity
  await supabase.from('pipeline_activity').insert({
    business_id: params.businessId,
    deal_id: deal.id,
    activity_type: 'deal_created',
    description: `Lead skapad från samtal`,
    to_stage_id: leadStage.id,
    triggered_by: 'ai',
    ai_confidence: 80,
    ai_reason: params.description || 'Nytt samtal identifierat som lead',
    source_call_id: params.callId,
  })

  return deal
}

/**
 * Säkerställ att en deal finns för en offert (Golden Path för hantverkar-
 * initierade offerter — t.ex. skapade från kundkortet utan en inkommande lead).
 * Ordning: 1) deal redan länkad via quote_id, 2) kundens öppna deal utan offert
 * → länka (undvik dubbletter), 3) skapa ny deal i 'quote_sent'.
 *
 * Skapar ALDRIG en deal utan kund — en offert utan kund är ingen pipeline-
 * möjlighet (returnerar null). En kund läggs INTE in i pipelinen bara för att
 * den finns; först när det finns en faktisk offert/möjlighet.
 */
export async function ensureDealForQuote(params: {
  businessId: string
  quoteId: string
  customerId: string | null
  title?: string | null
  value?: number | null
}): Promise<Deal | null> {
  const supabase = getServerSupabase()

  // 1. Redan länkad
  const existing = await findDealByQuote(params.businessId, params.quoteId)
  if (existing) return existing

  if (!params.customerId) return null

  // 2. Länka kundens senaste öppna deal som saknar offert (undvik dubbletter).
  //    Riktningsskyddet i moveDeal hindrar att en redan vunnen deal regrederas.
  const { data: openDeal } = await supabase
    .from('deal')
    .select('*')
    .eq('business_id', params.businessId)
    .eq('customer_id', params.customerId)
    .is('quote_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (openDeal) {
    const update: Record<string, unknown> = { quote_id: params.quoteId }
    if (params.value != null) update.value = params.value
    await supabase.from('deal').update(update).eq('id', openDeal.id).eq('business_id', params.businessId)
    return { ...openDeal, quote_id: params.quoteId }
  }

  // 3. Skapa ny deal direkt i 'quote_sent' (offerten skickas just nu).
  const sentStage = await getStageBySlug(params.businessId, 'quote_sent')
  if (!sentStage) throw new Error("Stage 'quote_sent' not found")

  const { data: deal, error } = await supabase
    .from('deal')
    .insert({
      business_id: params.businessId,
      customer_id: params.customerId,
      quote_id: params.quoteId,
      title: params.title || 'Offert',
      value: params.value ?? null,
      stage_id: sentStage.id,
      source: 'quote',
      priority: 'medium',
    })
    .select()
    .single()

  if (error) throw error

  await supabase.from('pipeline_activity').insert({
    business_id: params.businessId,
    deal_id: deal.id,
    activity_type: 'deal_created',
    description: 'Deal skapad från offert',
    to_stage_id: sentStage.id,
    triggered_by: 'system',
  })

  return deal
}

export async function getPipelineStats(businessId: string): Promise<{
  byStage: Array<{ stage: string; slug: string; color: string; count: number; value: number }>
  totalDeals: number
  totalValue: number
  wonValue: number
  lostCount: number
  newLeadsToday: number
  needsFollowUp: number
}> {
  const supabase = getServerSupabase()

  const { data: stages } = await supabase
    .from('pipeline_stage')
    .select('*')
    .eq('business_id', businessId)
    .order('sort_order')

  const { data: deals } = await supabase
    .from('deal')
    .select('id, value, stage_id, created_at, updated_at')
    .eq('business_id', businessId)

  if (!stages || !deals) {
    return { byStage: [], totalDeals: 0, totalValue: 0, wonValue: 0, lostCount: 0, newLeadsToday: 0, needsFollowUp: 0 }
  }

  const stageMap = new Map<string, any>(stages.map((s: any) => [s.id, s]))

  const byStage = stages.map((s: any) => {
    const stageDeals = deals.filter((d: any) => d.stage_id === s.id)
    return {
      stage: s.name,
      slug: s.slug,
      color: s.color,
      count: stageDeals.length,
      value: stageDeals.reduce((sum: number, d: any) => sum + (d.value || 0), 0),
    }
  })

  const today = new Date().toISOString().split('T')[0]
  const leadStage = stages.find((s: any) => s.slug === 'new_inquiry')
  const wonStage = stages.find((s: any) => s.is_won)
  const lostStage = stages.find((s: any) => s.is_lost)

  const newLeadsToday = leadStage
    ? deals.filter((d: any) => d.stage_id === leadStage.id && d.created_at.startsWith(today)).length
    : 0

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const needsFollowUp = deals.filter((d: any) => {
    const stage = stageMap.get(d.stage_id)
    return stage && !stage.is_won && !stage.is_lost && d.updated_at < fourteenDaysAgo
  }).length

  const wonValue = wonStage
    ? deals.filter((d: any) => d.stage_id === wonStage.id).reduce((sum: number, d: any) => sum + (d.value || 0), 0)
    : 0

  const lostCount = lostStage
    ? deals.filter((d: any) => d.stage_id === lostStage.id).length
    : 0

  return {
    byStage,
    totalDeals: deals.filter((d: any) => {
      const stage = stageMap.get(d.stage_id)
      return stage && !stage.is_won && !stage.is_lost
    }).length,
    totalValue: deals.reduce((sum: number, d: any) => sum + (d.value || 0), 0),
    wonValue,
    lostCount,
    newLeadsToday,
    needsFollowUp,
  }
}

export async function findDealByQuote(businessId: string, quoteId: string): Promise<Deal | null> {
  const supabase = getServerSupabase()
  const { data } = await supabase
    .from('deal')
    .select('*')
    .eq('business_id', businessId)
    .eq('quote_id', quoteId)
    .single()
  return data
}

export async function findDealByInvoice(businessId: string, invoiceId: string): Promise<Deal | null> {
  const supabase = getServerSupabase()

  // 1. Direktlänk på deal.invoice_id.
  const { data: direct } = await supabase
    .from('deal')
    .select('*')
    .eq('business_id', businessId)
    .eq('invoice_id', invoiceId)
    .maybeSingle()
  if (direct) return direct

  // 2. Fallback via offert-kedjan: invoice.quote_id → deal.quote_id.
  //    INGEN kodväg sätter deal.invoice_id vid fakturaskapande (from-quote/
  //    from-project/auto-invoice m.fl.), så utan detta hittar varken faktura-
  //    skickad eller faktura-betald sin deal → offert-baserade deals fastnar i
  //    'quote_accepted' och når ALDRIG 'won' när fakturan betalas (fel win-rate
  //    + intäktsstatistik). Self-heal:ar genom att persistera kopplingen.
  const { data: inv } = await supabase
    .from('invoice')
    .select('quote_id')
    .eq('invoice_id', invoiceId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (inv?.quote_id) {
    const deal = await findDealByQuote(businessId, inv.quote_id)
    if (deal) {
      await supabase
        .from('deal')
        .update({ invoice_id: invoiceId })
        .eq('id', deal.id)
        .eq('business_id', businessId)
      return { ...deal, invoice_id: invoiceId }
    }
  }

  return null
}

export async function getAutomationSettings(businessId: string) {
  const supabase = getServerSupabase()
  const { data } = await supabase
    .from('pipeline_automation')
    .select('*')
    .eq('business_id', businessId)
    .single()

  if (data) return data

  // Create defaults
  const { data: created } = await supabase
    .from('pipeline_automation')
    .insert({ business_id: businessId })
    .select()
    .single()

  return created
}
