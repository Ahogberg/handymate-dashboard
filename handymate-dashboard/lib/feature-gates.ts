export type PlanType = 'starter' | 'professional' | 'business'

export interface FeatureGate {
  key: string
  name: string
  plans: PlanType[]
  limit?: Record<PlanType, number | null>
}

export const FEATURE_GATES: Record<string, FeatureGate> = {
  // === ALLA PLANER ===
  ai_phone_assistant: {
    key: 'ai_phone_assistant',
    name: 'AI-telefonassistent',
    plans: ['starter', 'professional', 'business'],
  },
  quotes: {
    key: 'quotes',
    name: 'Offerter & Fakturor',
    plans: ['starter', 'professional', 'business'],
  },
  crm: {
    key: 'crm',
    name: 'Kundhantering',
    plans: ['starter', 'professional', 'business'],
  },
  pipeline_basic: {
    key: 'pipeline_basic',
    name: 'Pipeline',
    plans: ['starter', 'professional', 'business'],
  },
  time_tracking: {
    key: 'time_tracking',
    name: 'Tidrapportering',
    plans: ['starter', 'professional', 'business'],
  },
  time_tracking_advanced: {
    key: 'time_tracking_advanced',
    name: 'GPS, reseersättning, löneexport',
    plans: ['professional', 'business'],
  },
  calendar_sync: {
    key: 'calendar_sync',
    name: 'Google Calendar-sync',
    plans: ['starter', 'professional', 'business'],
  },
  sms_basic: {
    key: 'sms_basic',
    name: 'SMS-bekräftelser',
    plans: ['starter', 'professional', 'business'],
  },
  documents: {
    key: 'documents',
    name: 'Dokument',
    plans: ['starter', 'professional', 'business'],
  },

  // === PROFESSIONAL + BUSINESS ===
  nurture_sequences: {
    key: 'nurture_sequences',
    name: 'Uppföljningssekvenser',
    plans: ['professional', 'business'],
  },
  lead_generation: {
    key: 'lead_generation',
    name: 'Lead-generering',
    plans: ['professional', 'business'],
  },
  auto_approve: {
    key: 'auto_approve',
    name: 'AI auto-pilot',
    plans: ['professional', 'business'],
  },
  google_reviews: {
    key: 'google_reviews',
    name: 'Google Reviews-autopilot',
    plans: ['professional', 'business'],
  },
  gantt_view: {
    key: 'gantt_view',
    name: 'Gantt-vy & projektmallar',
    plans: ['professional', 'business'],
  },
  profitability_full: {
    key: 'profitability_full',
    name: 'Lönsamhetsuppföljning (full)',
    plans: ['professional', 'business'],
  },
  csv_export: {
    key: 'csv_export',
    name: 'CSV/Excel-export',
    plans: ['professional', 'business'],
  },
  warranty_tracking: {
    key: 'warranty_tracking',
    name: 'Garanti-tracking',
    plans: ['professional', 'business'],
  },
  email_template_editor: {
    key: 'email_template_editor',
    name: 'E-postmall-editor',
    plans: ['professional', 'business'],
  },
  fortnox_integration: {
    key: 'fortnox_integration',
    name: 'Fortnox-integration',
    plans: ['professional', 'business'],
  },
  campaign_analytics: {
    key: 'campaign_analytics',
    name: 'Kampanjanalys',
    plans: ['professional', 'business'],
  },
  subcontractors: {
    key: 'subcontractors',
    name: 'Underentreprenörer',
    plans: ['professional', 'business'],
  },
  inventory: {
    key: 'inventory',
    name: 'Lagerhantering',
    plans: ['professional', 'business'],
  },
  lead_intelligence: {
    key: 'lead_intelligence',
    name: 'Lead Intelligence & Analys',
    plans: ['professional', 'business'],
  },
  website_widget: {
    key: 'website_widget',
    name: 'Hemsida-widget',
    plans: ['professional', 'business'],
  },
  storefront_basic: {
    key: 'storefront_basic',
    name: 'Hemsida (grundversion)',
    plans: ['starter', 'professional', 'business'],
  },
  storefront_chatbot: {
    key: 'storefront_chatbot',
    name: 'AI-chatbot på hemsidan',
    plans: ['professional', 'business'],
  },
  storefront_contact_form: {
    key: 'storefront_contact_form',
    name: 'Kontaktformulär till pipeline',
    plans: ['professional', 'business'],
  },
  storefront_reviews: {
    key: 'storefront_reviews',
    name: 'Google Reviews på hemsidan',
    plans: ['professional', 'business'],
  },
  storefront_customization: {
    key: 'storefront_customization',
    name: 'Anpassning (färg, galleri)',
    plans: ['professional', 'business'],
  },
  storefront_custom_domain: {
    key: 'storefront_custom_domain',
    name: 'Egen domän',
    plans: ['business'],
  },
  gmail_integration: {
    key: 'gmail_integration',
    name: 'Gmail-integration',
    plans: ['professional', 'business'],
  },
  ai_project_manager: {
    key: 'ai_project_manager',
    name: 'AI Projektledare',
    plans: ['professional', 'business'],
  },
  quote_templates: {
    key: 'quote_templates',
    name: 'Offertmallar',
    plans: ['starter', 'professional', 'business'],
    limit: { starter: 3, professional: null, business: null },
  },
  ai_quote_generator: {
    key: 'ai_quote_generator',
    name: 'AI-offertgenerering',
    plans: ['professional', 'business'],
  },

  // === BEGRÄNSADE PER PLAN ===
  ai_photo_quote: {
    key: 'ai_photo_quote',
    name: 'AI prisberäkning foto/ritning',
    plans: ['starter', 'professional', 'business'],
    limit: { starter: 3, professional: 30, business: null },
  },
  team_members: {
    key: 'team_members',
    name: 'Teammedlemmar',
    plans: ['starter', 'professional', 'business'],
    limit: { starter: 1, professional: 5, business: null },
  },
  call_volume: {
    key: 'call_volume',
    name: 'Samtal per månad',
    plans: ['starter', 'professional', 'business'],
    limit: { starter: 100, professional: 400, business: null },
  },

  // === BUSINESS ONLY ===
  custom_ai_voice: {
    key: 'custom_ai_voice',
    name: 'Anpassad AI-röst',
    plans: ['business'],
  },
  dedicated_support: {
    key: 'dedicated_support',
    name: 'Dedikerad support',
    plans: ['business'],
  },
  unlimited_users: {
    key: 'unlimited_users',
    name: 'Obegränsade användare',
    plans: ['business'],
  },
}

export function hasFeature(plan: PlanType, featureKey: string): boolean {
  const gate = FEATURE_GATES[featureKey]
  if (!gate) return true
  return gate.plans.includes(plan)
}

export function getFeatureLimit(plan: PlanType, featureKey: string): number | null {
  const gate = FEATURE_GATES[featureKey]
  if (!gate?.limit) return null
  return gate.limit[plan] ?? null
}

export function getUpgradeFeatures(currentPlan: PlanType): FeatureGate[] {
  return Object.values(FEATURE_GATES).filter(
    gate => !gate.plans.includes(currentPlan)
  )
}

export function getNextPlan(currentPlan: PlanType): PlanType | null {
  if (currentPlan === 'starter') return 'professional'
  if (currentPlan === 'professional') return 'business'
  return null
}

export function getPlanPrice(plan: PlanType): number {
  const prices: Record<PlanType, number> = {
    starter: 2495,
    professional: 5995,
    business: 11995,
  }
  return prices[plan]
}

export function getPlanLabel(plan: PlanType): string {
  const labels: Record<PlanType, string> = {
    starter: 'Starter',
    professional: 'Professional',
    business: 'Business',
  }
  return labels[plan]
}
