import { meterDirectLlmCall } from '@/lib/agents/shared/cost-guard'
import { llmCostUsd } from '@/lib/costs/meter'
import Anthropic from '@anthropic-ai/sdk'
import { getServerSupabase } from '@/lib/supabase'
import { getAutomationSettings } from '@/lib/pipeline'
import { createLeadAndDeal } from '@/lib/leads/golden-path'
import type { CallPipelineResult } from '@/lib/voice/call-processing'

interface CallAnalysis {
  isNewLead: boolean
  leadConfidence: number
  customerIntent: 'interested' | 'ready_to_buy' | 'just_asking' | 'declining' | 'unclear'
  intentConfidence: number
  suggestedAction: 'create_lead' | 'move_to_accepted' | 'move_to_lost' | 'follow_up' | 'none'
  extractedInfo: {
    customerName?: string
    jobType?: string
    address?: string
    urgency?: 'low' | 'medium' | 'high'
    estimatedValue?: number
    declineReason?: string
  }
  reasoning: string
}

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

const PIPELINE_MODEL = 'claude-haiku-4-5-20251001'

export async function analyzeCallForPipeline(params: {
  transcript: string
  businessId: string
  existingCustomerPhone?: string
  /** Samtalets id — blir cost_event-refId. */
  callId?: string
}): Promise<CallAnalysis> {
  const anthropic = getAnthropic()
  const supabase = getServerSupabase()

  // Check if caller is existing customer with active deals
  let existingContext = ''
  if (params.existingCustomerPhone) {
    const { data: customer } = await supabase
      .from('customer')
      .select('customer_id, name')
      .eq('business_id', params.businessId)
      .eq('phone_number', params.existingCustomerPhone)
      .single()

    if (customer) {
      const { data: deals } = await supabase
        .from('deal')
        .select('id, title, stage_id')
        .eq('customer_id', customer.customer_id)
        .eq('business_id', params.businessId)
        .limit(5)

      if (deals && deals.length > 0) {
        existingContext = `\nBefintlig kund: ${customer.name}\nAktiva deals: ${deals.map((d: any) => d.title).join(', ')}`
      }
    }
  }

  const response = await anthropic.messages.create({
    model: PIPELINE_MODEL,
    max_tokens: 1000,
    system: `Du analyserar telefonsamtal för en svensk hantverkare och avgör om det är en ny affärsmöjlighet eller uppdatering av en befintlig.${existingContext}

Svara ENDAST med JSON:
{
  "isNewLead": true/false,
  "leadConfidence": 0-100,
  "customerIntent": "interested|ready_to_buy|just_asking|declining|unclear",
  "intentConfidence": 0-100,
  "suggestedAction": "create_lead|move_to_accepted|move_to_lost|follow_up|none",
  "extractedInfo": {
    "customerName": "namn om nämnt",
    "jobType": "typ av jobb",
    "address": "adress om nämnd",
    "urgency": "low|medium|high",
    "estimatedValue": null,
    "declineReason": "om kund tackar nej"
  },
  "reasoning": "kort förklaring"
}`,
    messages: [
      { role: 'user', content: `Analysera detta samtal:\n\n${params.transcript}` }
    ]
  })

  // COGS-boken (var omätt fram till 2026-08-27 — anropas efter varje
  // analyserat samtal via app/api/voice/analyze, som är Bränsle-grindad).
  await meterDirectLlmCall({
    supabase,
    businessId: params.businessId,
    usage: response.usage,
    costUsd: llmCostUsd(response.usage, PIPELINE_MODEL),
    refType: 'pipeline_call_analysis',
    refId: params.callId || `pipeline_${Date.now()}`,
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)

  if (!jsonMatch) {
    return {
      isNewLead: false,
      leadConfidence: 0,
      customerIntent: 'unclear',
      intentConfidence: 0,
      suggestedAction: 'none',
      extractedInfo: {},
      reasoning: 'Kunde inte analysera samtalet',
    }
  }

  return JSON.parse(jsonMatch[0])
}

export async function processCallForPipeline(params: {
  callId: string
  businessId: string
  transcript: string
  callerPhone: string
}): Promise<CallPipelineResult> {
  const settings = await getAutomationSettings(params.businessId)
  if (!settings || !settings.ai_analyze_calls) {
    return { action: 'skipped', aiConfidence: 0 }
  }

  const analysis = await analyzeCallForPipeline({
    transcript: params.transcript,
    businessId: params.businessId,
    existingCustomerPhone: params.callerPhone,
    callId: params.callId,
  })

  const threshold = settings.ai_auto_move_threshold || 80
  const leadThreshold = settings.ai_create_lead_threshold || 70

  // Create new lead
  if (
    analysis.isNewLead &&
    analysis.leadConfidence >= leadThreshold &&
    settings.auto_create_leads &&
    /^\+[1-9]\d{7,14}$/.test(params.callerPhone)
  ) {
    const supabase = getServerSupabase()

    // Ett provider-callback eller manuellt omförsök får aldrig skapa en ny
    // affär för samma samtal. Golden Path dedupar kunden, men skapar medvetet
    // ett nytt lead/deal per anrop — därför äger samtalsvägen idempotensen via
    // leads.source_ref = callId.
    const { data: existingLead, error: existingLeadError } = await supabase
      .from('leads')
      .select('lead_id, customer_id')
      .eq('business_id', params.businessId)
      .eq('source_ref', params.callId)
      .limit(1)
      .maybeSingle()
    if (existingLeadError) throw existingLeadError

    if (existingLead) {
      const { data: existingDeal, error: existingDealError } = await supabase
        .from('deal')
        .select('id')
        .eq('business_id', params.businessId)
        .eq('lead_id', existingLead.lead_id)
        .maybeSingle()
      if (existingDealError) throw existingDealError
      if (!existingDeal) throw new Error('Lead finns men saknar affär. Kräver granskning; ingen dubblett skapas.')
      return {
        action: 'already_created',
        leadId: existingLead.lead_id,
        dealId: existingDeal?.id || undefined,
        customerId: existingLead.customer_id || undefined,
        aiConfidence: analysis.leadConfidence,
      }
    }

    const urgencyMap: Record<string, string> = { high: 'high', medium: 'medium', low: 'low' }
    const name = analysis.extractedInfo.customerName?.trim() || `Ny kund (${params.callerPhone})`
    const message = analysis.extractedInfo.jobType
      ? `${analysis.extractedInfo.jobType}${analysis.reasoning ? ` — ${analysis.reasoning}` : ''}`
      : analysis.reasoning || 'Kvalificerat inkommande samtal'
    const created = await createLeadAndDeal({
      businessId: params.businessId,
      businessPhoneNumber: null,
      name,
      phone: params.callerPhone,
      email: null,
      message,
      source: 'vapi_call',
      sourceRef: params.callId,
      // Samtalskort/push nedan är ägarens enda notifiering. Golden Paths
      // eget SMS hade gett en andra notis för samma kvalificerade samtal.
      notify: false,
    }, supabase)

    if (created.dealError || !created.dealId) {
      throw new Error(created.dealError || 'Golden Path skapade inget deal-id')
    }

    // Golden Path äger kund/lead/deal. Samtalsvägen kompletterar bara den
    // spårning som är specifik för telefoni; varje skrivning tenantfiltreras.
    const { error: dealUpdateError } = await supabase
      .from('deal')
      .update({
        source_call_id: params.callId,
        value: analysis.extractedInfo.estimatedValue || null,
        priority: urgencyMap[analysis.extractedInfo.urgency || 'medium'] || 'medium',
      })
      .eq('id', created.dealId)
      .eq('business_id', params.businessId)
    if (dealUpdateError) throw dealUpdateError

    return {
      action: 'created_lead',
      leadId: created.leadId,
      dealId: created.dealId,
      customerId: created.customerId,
      aiConfidence: analysis.leadConfidence,
    }
  }

  // Ett telefonnummer identifierar inte en affär. Ingen senaste-affär-gissning
  // och ingen statusmutation från ett externt transkript. Granskningen nedan
  // skapar en vanlig uppföljningsuppgift, inte ett nytt statusverktyg.
  const needsReview = ['move_to_accepted', 'move_to_lost'].includes(analysis.suggestedAction)
    && analysis.intentConfidence >= threshold

  // Även utan pipelineåtgärd får efteranalysen använda en SÄKER, tenant-
  // verifierad befintlig kundmatch för sina granskningskort.
  const supabase = getServerSupabase()
  const { data: matchedCustomer, error: matchError } = params.callerPhone
    ? await supabase
        .from('customer')
        .select('customer_id')
        .eq('business_id', params.businessId)
        .eq('phone_number', params.callerPhone)
        .maybeSingle()
    : { data: null, error: null }
  if (matchError) throw matchError

  return {
    action: needsReview ? 'review_required' : 'no_action',
    ...(needsReview ? { reviewReason: 'Samtalet kan gälla ett ja eller nej till en affär. Kontrollera vilken affär det gäller och uppdatera den manuellt. Ingen affärsstatus har ändrats.' } : {}),
    customerId: matchedCustomer?.customer_id || undefined,
    aiConfidence: analysis.intentConfidence,
  }
}
