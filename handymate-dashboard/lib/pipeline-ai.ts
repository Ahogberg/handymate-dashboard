import Anthropic from '@anthropic-ai/sdk'
import { getServerSupabase } from '@/lib/supabase'
import { createDealFromCall, moveDeal, getStageBySlug, getAutomationSettings } from '@/lib/pipeline'

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

export async function analyzeCallForPipeline(params: {
  transcript: string
  businessId: string
  existingCustomerPhone?: string
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
        .limit(5)

      if (deals && deals.length > 0) {
        existingContext = `\nBefintlig kund: ${customer.name}\nAktiva deals: ${deals.map((d: any) => d.title).join(', ')}`
      }
    }
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
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
}): Promise<{
  action: string
  dealId?: string
  aiConfidence: number
}> {
  const settings = await getAutomationSettings(params.businessId)
  if (!settings || !settings.ai_analyze_calls) {
    return { action: 'skipped', aiConfidence: 0 }
  }

  const analysis = await analyzeCallForPipeline({
    transcript: params.transcript,
    businessId: params.businessId,
    existingCustomerPhone: params.callerPhone,
  })

  const threshold = settings.ai_auto_move_threshold || 80
  const leadThreshold = settings.ai_create_lead_threshold || 70

  // Create new lead
  if (
    analysis.isNewLead &&
    analysis.leadConfidence >= leadThreshold &&
    settings.auto_create_leads
  ) {
    const urgencyMap: Record<string, string> = { high: 'high', medium: 'medium', low: 'low' }
    const deal = await createDealFromCall({
      businessId: params.businessId,
      callId: params.callId,
      customerName: analysis.extractedInfo.customerName,
      customerPhone: params.callerPhone,
      title: analysis.extractedInfo.jobType
        ? `${analysis.extractedInfo.customerName || 'Ny kund'} - ${analysis.extractedInfo.jobType}`
        : `Ny lead från samtal`,
      description: analysis.reasoning,
      estimatedValue: analysis.extractedInfo.estimatedValue || undefined,
      priority: urgencyMap[analysis.extractedInfo.urgency || 'medium'] || 'medium',
    })

    return {
      action: 'created_lead',
      dealId: deal.id,
      aiConfidence: analysis.leadConfidence,
    }
  }

  // Move existing deal based on intent
  if (
    analysis.suggestedAction === 'move_to_accepted' &&
    analysis.intentConfidence >= threshold
  ) {
    // Find existing deal for this caller
    const supabase = getServerSupabase()
    const { data: customer } = await supabase
      .from('customer')
      .select('customer_id')
      .eq('business_id', params.businessId)
      .eq('phone_number', params.callerPhone)
      .single()

    if (customer) {
      const { data: deal } = await supabase
        .from('deal')
        .select('id')
        .eq('customer_id', customer.customer_id)
        .eq('business_id', params.businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (deal) {
        await moveDeal({
          dealId: deal.id,
          businessId: params.businessId,
          toStageSlug: 'accepted',
          triggeredBy: 'ai',
          aiConfidence: analysis.intentConfidence,
          aiReason: analysis.reasoning,
          sourceCallId: params.callId,
        })

        return {
          action: 'moved_to_accepted',
          dealId: deal.id,
          aiConfidence: analysis.intentConfidence,
        }
      }
    }
  }

  if (
    analysis.suggestedAction === 'move_to_lost' &&
    analysis.intentConfidence >= threshold
  ) {
    const supabase = getServerSupabase()
    const { data: customer } = await supabase
      .from('customer')
      .select('customer_id')
      .eq('business_id', params.businessId)
      .eq('phone_number', params.callerPhone)
      .single()

    if (customer) {
      const { data: deal } = await supabase
        .from('deal')
        .select('id')
        .eq('customer_id', customer.customer_id)
        .eq('business_id', params.businessId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (deal) {
        await moveDeal({
          dealId: deal.id,
          businessId: params.businessId,
          toStageSlug: 'lost',
          triggeredBy: 'ai',
          aiConfidence: analysis.intentConfidence,
          aiReason: analysis.extractedInfo.declineReason || analysis.reasoning,
          sourceCallId: params.callId,
        })

        return {
          action: 'moved_to_lost',
          dealId: deal.id,
          aiConfidence: analysis.intentConfidence,
        }
      }
    }
  }

  return { action: 'no_action', aiConfidence: analysis.intentConfidence }
}
