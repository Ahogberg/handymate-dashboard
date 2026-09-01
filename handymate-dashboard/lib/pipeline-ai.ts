import { meterDirectLlmCall } from '@/lib/agents/shared/cost-guard'
import { llmCostUsd } from '@/lib/costs/meter'
import Anthropic from '@anthropic-ai/sdk'
import { getServerSupabase } from '@/lib/supabase'
import { getAutomationSettings } from '@/lib/pipeline'
import { createLeadAndDeal } from '@/lib/leads/golden-path'
import { findCustomerByPhone } from '@/lib/voice/find-customer-by-phone'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'
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
  /** Konkret nästa steg för hantverkaren, t.ex. "Återkom med pris på takbytet senast fredag". */
  nextAction?: string
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
    const customer = await findCustomerByPhone(supabase, params.businessId, params.existingCustomerPhone)

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
  "reasoning": "kort förklaring",
  "nextAction": "konkret nästa steg för hantverkaren i en mening, t.ex. 'Återkom med pris på takbytet senast fredag' — eller null om inget lovades"
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
  /** Lisas sammanfattning av samtalet — blir affärens kontext + första anteckning. */
  summary?: string | null
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

  // Grinden och kundens sparade nummer använder E.164 — ett samtal från
  // "0701234567" (manuell/mobil-inspelning) fick tidigare aldrig bli en lead.
  const callerE164 = normalizeSwedishPhone(params.callerPhone || '')

  // Create new lead
  if (
    analysis.isNewLead &&
    analysis.leadConfidence >= leadThreshold &&
    settings.auto_create_leads &&
    /^\+[1-9]\d{7,14}$/.test(callerE164)
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
      phone: callerE164,
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
    // Samtalsefterarbete (2026-09-01): affären bär samtalets kontext och ett
    // konkret nästa steg ("Återkom med X") — annars stod hantverkaren med en
    // tom deal som bara hette "Ny kund (+46…)".
    const samtalsdatum = new Date().toLocaleDateString('sv-SE')
    const kontextDelar = [
      analysis.extractedInfo.jobType,
      analysis.extractedInfo.address,
      analysis.extractedInfo.urgency === 'high' ? 'brådskande' : null,
    ].filter(Boolean)
    const nextAction = typeof analysis.nextAction === 'string' && analysis.nextAction.trim()
      ? analysis.nextAction.trim()
      : null
    const { error: dealUpdateError } = await supabase
      .from('deal')
      .update({
        source_call_id: params.callId,
        value: analysis.extractedInfo.estimatedValue || null,
        priority: urgencyMap[analysis.extractedInfo.urgency || 'medium'] || 'medium',
        description: `Ur samtal ${samtalsdatum}${kontextDelar.length ? `: ${kontextDelar.join(', ')}` : ''}${params.summary ? `\n\n${params.summary}` : ''}`,
        suggested_action: nextAction,
      })
      .eq('id', created.dealId)
      .eq('business_id', params.businessId)
    if (dealUpdateError) throw dealUpdateError

    // Första anteckningen på affären = vad som sades. Fail-soft: affären är
    // redan skapad, en misslyckad anteckning ska inte kasta om hela samtalet.
    const noteContent = [
      `Samtal ${samtalsdatum}: ${params.summary || analysis.reasoning || 'inkommande samtal'}`,
      nextAction ? `Nästa steg: ${nextAction}` : null,
    ].filter(Boolean).join('\n\n')
    const { error: noteError } = await supabase
      .from('deal_note')
      .insert({
        business_id: params.businessId,
        deal_id: created.dealId,
        content: noteContent,
        created_by: 'Lisa',
      })
    if (noteError) console.error('[pipeline-ai] deal_note ur samtal misslyckades (non-blocking):', noteError)

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
  const matchedCustomer = params.callerPhone
    ? await findCustomerByPhone(supabase, params.businessId, params.callerPhone)
    : null

  return {
    action: needsReview ? 'review_required' : 'no_action',
    ...(needsReview ? { reviewReason: 'Samtalet kan gälla ett ja eller nej till en affär. Kontrollera vilken affär det gäller och uppdatera den manuellt. Ingen affärsstatus har ändrats.' } : {}),
    customerId: matchedCustomer?.customer_id || undefined,
    aiConfidence: analysis.intentConfidence,
  }
}
