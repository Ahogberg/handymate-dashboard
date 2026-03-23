import { getServerSupabase } from '@/lib/supabase'
import { getAutomationSettings, logAutomationActivity } from '@/lib/automations'

// ── Types ──────────────────────────────────────────────────────

export interface AutoApproveConfig {
  enabled: boolean
  min_confidence: number // 0-100
  daily_limit: number
  risk: 'low' | 'medium' | 'high'
}

export interface AutoApproveResult {
  suggestion_id: string
  action_type: string
  auto_approved: boolean
  reason: string
  confidence: number
}

// ── Risk categorization ────────────────────────────────────────

const DEFAULT_CONFIG: Record<string, AutoApproveConfig> = {
  sms:             { enabled: false, min_confidence: 85, daily_limit: 50, risk: 'low' },
  callback:        { enabled: false, min_confidence: 85, daily_limit: 50, risk: 'low' },
  create_customer: { enabled: false, min_confidence: 85, daily_limit: 30, risk: 'low' },
  follow_up:       { enabled: false, min_confidence: 85, daily_limit: 30, risk: 'low' },
  reminder:        { enabled: false, min_confidence: 85, daily_limit: 30, risk: 'low' },
  booking:         { enabled: false, min_confidence: 92, daily_limit: 10, risk: 'medium' },
  reschedule:      { enabled: false, min_confidence: 92, daily_limit: 10, risk: 'medium' },
  quote:           { enabled: false, min_confidence: 100, daily_limit: 0, risk: 'high' },
  other:           { enabled: false, min_confidence: 100, daily_limit: 0, risk: 'high' },
}

// ── Core Functions ─────────────────────────────────────────────

/**
 * Get auto-approve config for a business, merged with defaults
 */
export function getAutoApproveConfig(
  rawConfig: Record<string, any> | null | undefined
): Record<string, AutoApproveConfig> {
  const config = { ...DEFAULT_CONFIG }
  if (rawConfig && typeof rawConfig === 'object') {
    for (const [key, val] of Object.entries(rawConfig)) {
      if (config[key] && val && typeof val === 'object') {
        config[key] = { ...config[key], ...val }
      }
    }
  }
  return config
}

/**
 * Check if a suggestion should be auto-approved and execute it if so.
 * Returns result indicating what happened.
 */
export async function tryAutoApprove(params: {
  suggestionId: string
  businessId: string
  actionType: string
  confidence: number // 0.0 - 1.0 from AI
  suggestion: any    // Full suggestion record
}): Promise<AutoApproveResult> {
  const { suggestionId, businessId, actionType, confidence, suggestion } = params
  const confidencePercent = Math.round(confidence * 100)

  // 1. Get automation settings
  let settings
  try {
    settings = await getAutomationSettings(businessId)
  } catch {
    return {
      suggestion_id: suggestionId,
      action_type: actionType,
      auto_approved: false,
      reason: 'Kunde inte hämta automationsinställningar',
      confidence: confidencePercent,
    }
  }

  // 2. Check master toggle
  const masterEnabled = (settings as any).auto_approve_enabled === true
  if (!masterEnabled) {
    return {
      suggestion_id: suggestionId,
      action_type: actionType,
      auto_approved: false,
      reason: 'Auto-approve är avstängt',
      confidence: confidencePercent,
    }
  }

  // 3. Get per-action config
  const allConfig = getAutoApproveConfig((settings as any).auto_approve_config)
  const actionConfig = allConfig[actionType]
  if (!actionConfig || !actionConfig.enabled) {
    return {
      suggestion_id: suggestionId,
      action_type: actionType,
      auto_approved: false,
      reason: `Auto-approve ej aktivt för ${actionType}`,
      confidence: confidencePercent,
    }
  }

  // 4. Check confidence threshold — with learning boost
  let effectiveConfidence = confidencePercent
  let learningReason = ''

  if (confidencePercent < actionConfig.min_confidence) {
    // Try learning boost before rejecting
    try {
      const { getLearnedConfidence } = await import('@/lib/auto-approve-learning')
      const learned = await getLearnedConfidence(businessId, actionType)
      if (learned.boost !== 0) {
        effectiveConfidence = confidencePercent + learned.boost
        learningReason = learned.reason
      }
    } catch { /* learning module unavailable — proceed without boost */ }

    if (effectiveConfidence < actionConfig.min_confidence) {
      return {
        suggestion_id: suggestionId,
        action_type: actionType,
        auto_approved: false,
        reason: learningReason
          ? `Konfidens ${confidencePercent}% + boost ${effectiveConfidence - confidencePercent} = ${effectiveConfidence}% < tröskel ${actionConfig.min_confidence}% (${learningReason})`
          : `Konfidens ${confidencePercent}% < tröskel ${actionConfig.min_confidence}%`,
        confidence: effectiveConfidence,
      }
    }
    // Boosted past threshold — continue to execution
  }

  // 5. Check daily limit
  const supabase = getServerSupabase()
  const today = new Date().toISOString().split('T')[0]

  let dailyCount = 0
  try {
    const { data: countRow } = await supabase
      .from('auto_approve_daily_count')
      .select('count')
      .eq('business_id', businessId)
      .eq('action_type', actionType)
      .eq('count_date', today)
      .single()

    dailyCount = countRow?.count || 0
  } catch {
    // Table may not exist yet - proceed with 0
  }

  if (actionConfig.daily_limit > 0 && dailyCount >= actionConfig.daily_limit) {
    return {
      suggestion_id: suggestionId,
      action_type: actionType,
      auto_approved: false,
      reason: `Daglig gräns nådd (${dailyCount}/${actionConfig.daily_limit})`,
      confidence: confidencePercent,
    }
  }

  // 6. Execute the action using the approve logic
  try {
    const { executeApproveAction } = await import('@/lib/approve-actions')
    const result = await executeApproveAction(supabase, suggestion, suggestion.action_data || {})

    if (!result.success) {
      // Log failed auto-approve attempt
      await logAutomationActivity({
        businessId,
        automationType: 'auto_approve',
        action: `auto_${actionType}_failed`,
        description: `Auto-approve av "${suggestion.title}" misslyckades: ${result.error}`,
        metadata: { suggestion_id: suggestionId, confidence: confidencePercent, error: result.error },
        status: 'failed',
      })

      return {
        suggestion_id: suggestionId,
        action_type: actionType,
        auto_approved: false,
        reason: `Åtgärden misslyckades: ${result.error}`,
        confidence: confidencePercent,
      }
    }

    // 7. Mark suggestion as auto-approved
    await supabase
      .from('ai_suggestion')
      .update({
        status: 'completed',
        auto_approved: true,
        auto_approved_at: new Date().toISOString(),
        approved_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        action_data: { ...suggestion.action_data, result },
      })
      .eq('suggestion_id', suggestionId)

    // 8. Increment daily counter
    try {
      await supabase.rpc('increment_auto_approve_count', {
        p_business_id: businessId,
        p_action_type: actionType,
        p_count_date: today,
      })
    } catch {
      // Fallback: upsert manually
      await supabase
        .from('auto_approve_daily_count')
        .upsert({
          business_id: businessId,
          action_type: actionType,
          count_date: today,
          count: dailyCount + 1,
        }, { onConflict: 'business_id,action_type,count_date' })
    }

    // 9. Log success
    await logAutomationActivity({
      businessId,
      automationType: 'auto_approve',
      action: `auto_${actionType}`,
      description: `AI auto-godkände "${suggestion.title}" (konfidens ${confidencePercent}%)`,
      metadata: { suggestion_id: suggestionId, confidence: confidencePercent, result },
      status: 'success',
    })

    // 10. Create notification
    try {
      const { notifyAutoApprove } = await import('@/lib/notifications')
      await notifyAutoApprove({
        businessId,
        actionType,
        title: suggestion.title || actionType,
        confidence: confidencePercent,
        resultId: result.booking_id || result.quote_id || result.customer_id,
      })
    } catch { /* non-blocking */ }

    return {
      suggestion_id: suggestionId,
      action_type: actionType,
      auto_approved: true,
      reason: `Auto-godkänd (konfidens ${confidencePercent}% >= ${actionConfig.min_confidence}%)`,
      confidence: confidencePercent,
    }

  } catch (error: any) {
    console.error('Auto-approve execution error:', error)
    return {
      suggestion_id: suggestionId,
      action_type: actionType,
      auto_approved: false,
      reason: `Tekniskt fel: ${error.message}`,
      confidence: confidencePercent,
    }
  }
}

/**
 * Get auto-approve stats for dashboard widget
 */
export async function getAutoApproveStats(businessId: string): Promise<{
  today: number
  week: number
  recent: Array<{ type: string; title: string; time: string; success: boolean }>
}> {
  try {
    const supabase = getServerSupabase()
    const today = new Date().toISOString().split('T')[0]
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Today's count
    const { data: todayCounts } = await supabase
      .from('auto_approve_daily_count')
      .select('count')
      .eq('business_id', businessId)
      .eq('count_date', today)

    const todayTotal = (todayCounts || []).reduce((sum: number, r: any) => sum + (r.count || 0), 0)

    // Week's auto-approved suggestions
    const { data: weekSuggestions } = await supabase
      .from('ai_suggestion')
      .select('suggestion_id')
      .eq('business_id', businessId)
      .eq('auto_approved', true)
      .gte('auto_approved_at', weekAgo)

    // Recent auto-approved (last 5)
    const { data: recentSuggestions } = await supabase
      .from('ai_suggestion')
      .select('suggestion_type, title, auto_approved_at, status')
      .eq('business_id', businessId)
      .eq('auto_approved', true)
      .order('auto_approved_at', { ascending: false })
      .limit(5)

    return {
      today: todayTotal,
      week: weekSuggestions?.length || 0,
      recent: (recentSuggestions || []).map((s: any) => ({
        type: s.suggestion_type,
        title: s.title,
        time: s.auto_approved_at,
        success: s.status === 'completed',
      })),
    }
  } catch {
    return { today: 0, week: 0, recent: [] }
  }
}
