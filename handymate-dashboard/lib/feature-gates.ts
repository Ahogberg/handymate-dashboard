// Andreas-beslut 2026-07-31: 'starter' är borttagen ur det publika köpflödet
// (onboarding + uppgraderingssidan) fr.o.m. 2026-07-31 — den bryter
// kategorilöftet "hela teamet" som publikt utbud nu är Professional (ingång)
// + Business (volym) + Anpassad. 'starter' behålls här som plantyp för
// befintliga konton och som ett tyst nedgraderingsalternativ (support kan
// fortfarande sätta en kund till starter) — all gating-logik nedan är
// OFÖRÄNDRAD och gäller precis som förut.
export type PlanType = 'starter' | 'professional' | 'business'

export interface FeatureGate {
  key: string
  name: string
  plans: PlanType[]
  limit?: Record<PlanType, number | null>
}

// ---------------------------------------------------------------------------
// SMS-kvoter & kostnader per plan
// ---------------------------------------------------------------------------

export interface SmsQuota {
  monthlyQuota: number
  extraCostSek: number
  hardCap: number
}

export const SMS_QUOTAS: Record<PlanType, SmsQuota> = {
  starter:      { monthlyQuota: 50,   extraCostSek: 0.89, hardCap: 200 },
  professional: { monthlyQuota: 300,  extraCostSek: 0.79, hardCap: 1000 },
  business:     { monthlyQuota: 1000, extraCostSek: 0.69, hardCap: 5000 },
}

export function getSmsQuota(plan: PlanType): SmsQuota {
  return SMS_QUOTAS[plan] ?? SMS_QUOTAS.starter
}

// ---------------------------------------------------------------------------
// Automations-gränser per plan
// ---------------------------------------------------------------------------

export const AUTOMATION_LIMITS: Record<PlanType, number | null> = {
  starter: 3,
  professional: null, // alla 9 + custom
  business: null,     // obegränsat
}

export function getAutomationLimit(plan: PlanType): number | null {
  return AUTOMATION_LIMITS[plan] ?? 3
}

// ---------------------------------------------------------------------------
// Användare per plan (Andreas-beslut 2026-09-01: användartaket i Firman tas
// bort helt)
//
// Ersätter 2026-08-09-beslutet (3 → 5), som fortfarande gjorde antal
// människor till en spärr och ett säljargument. Nu differentierar Firman och
// Storfirman ENDAST på volym (samtal/SMS, se CALL_LIMITS/SMS_QUOTAS) —
// aldrig på hur många som loggar in. 'starter' är ett tyst legacy-/
// nedgraderingsläge (inte en publik plan) och behåller sitt tak.
// ---------------------------------------------------------------------------

export const USER_LIMITS: Record<PlanType, number | null> = {
  starter: 3,
  professional: null, // obegränsat — se kommentar ovan
  business: null, // obegränsat
}

export function getUserLimit(plan: PlanType): number | null {
  return Object.prototype.hasOwnProperty.call(USER_LIMITS, plan)
    ? USER_LIMITS[plan]
    : USER_LIMITS.starter
}

/** Samtalsvolymen som kundcopy och feature-gaten delar. */
export const CALL_LIMITS: Record<PlanType, number | null> = {
  starter: 100,
  professional: 400,
  business: null,
}

export function getCallLimit(plan: PlanType): number | null {
  return Object.prototype.hasOwnProperty.call(CALL_LIMITS, plan)
    ? CALL_LIMITS[plan]
    : CALL_LIMITS.starter
}

/** En garanti, två nivåer. Grundarkundserbjudandet är uttryckligen 90 dagar. */
export const STANDARD_GUARANTEE_DAYS = 30
export const FOUNDERS_GUARANTEE_DAYS = 90

// ---------------------------------------------------------------------------
// Team-agenter per plan (Bas = bara Matte)
// ---------------------------------------------------------------------------

export const TEAM_AGENTS_ALLOWED: Record<PlanType, string[]> = {
  starter:      ['matte'],
  professional: ['matte', 'karin', 'hanna', 'daniel', 'lars', 'lisa'],
  business:     ['matte', 'karin', 'hanna', 'daniel', 'lars', 'lisa'],
}

export function isAgentAllowed(plan: PlanType, agentId: string): boolean {
  return TEAM_AGENTS_ALLOWED[plan]?.includes(agentId) ?? false
}

// ---------------------------------------------------------------------------
// Feature gates
// ---------------------------------------------------------------------------

export const FEATURE_GATES: Record<string, FeatureGate> = {
  // === ALLA PLANER ===
  ai_phone_assistant: {
    key: 'ai_phone_assistant',
    name: 'Samtalsfångst med Lisa',
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
  calendar_sync: {
    key: 'calendar_sync',
    name: 'Google Calendar-sync',
    plans: ['starter', 'professional', 'business'],
  },
  sms_basic: {
    key: 'sms_basic',
    name: 'SMS-bekräftelser',
    plans: ['starter', 'professional', 'business'],
    limit: { starter: 50, professional: 300, business: 1000 },
  },
  documents: {
    key: 'documents',
    name: 'Dokument',
    plans: ['starter', 'professional', 'business'],
  },
  storefront_basic: {
    key: 'storefront_basic',
    name: 'Hemsida (grundversion)',
    plans: ['starter', 'professional', 'business'],
  },

  // === BEGRÄNSADE PER PLAN ===
  quote_templates: {
    key: 'quote_templates',
    name: 'Offertmallar',
    plans: ['starter', 'professional', 'business'],
    limit: { starter: 5, professional: null, business: null },
  },
  ai_photo_quote: {
    key: 'ai_photo_quote',
    name: 'AI prisberäkning foto/ritning',
    plans: ['starter', 'professional', 'business'],
    limit: { starter: 10, professional: 50, business: null },
  },
  // team_members/users limit-fälten här var 3/25/∞ — i strid med USER_LIMITS
  // ovan, som är den siffra app/api/team/invite/route.ts faktiskt
  // upprätthåller. USER_LIMITS är kanonisk (professional obegränsat sedan
  // 2026-09-01); dessa två gate-poster är bara beskrivande metadata (t.ex.
  // för getFeatureLimit-callsites) och hålls synkade med den hädanefter —
  // ändra USER_LIMITS, inte här.
  team_members: {
    key: 'team_members',
    name: 'Teammedlemmar',
    plans: ['starter', 'professional', 'business'],
    limit: { starter: 3, professional: null, business: null },
  },
  users: {
    key: 'users',
    name: 'Användare',
    plans: ['starter', 'professional', 'business'],
    limit: { starter: 3, professional: null, business: null },
  },
  call_volume: {
    key: 'call_volume',
    name: 'Samtal per månad',
    plans: ['starter', 'professional', 'business'],
    limit: CALL_LIMITS,
  },
  automations: {
    key: 'automations',
    name: 'Automationer',
    plans: ['starter', 'professional', 'business'],
    limit: { starter: 3, professional: null, business: null },
  },

  // === PROFESSIONAL + BUSINESS ===
  time_tracking_advanced: {
    key: 'time_tracking_advanced',
    name: 'GPS, reseersättning, löneexport',
    plans: ['professional', 'business'],
  },
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
  leads_outbound: {
    key: 'leads_outbound',
    name: 'Utskick till fastighetsägare',
    plans: ['professional', 'business'],
  },
  website_widget: {
    key: 'website_widget',
    name: 'Hemsida-widget',
    plans: ['professional', 'business'],
  },
  storefront_chatbot: {
    key: 'storefront_chatbot',
    name: 'AI-chatbot på hemsidan',
    plans: ['professional', 'business'],
  },
  storefront_contact_form: {
    key: 'storefront_contact_form',
    name: 'Kontaktformulär till pipeline',
    plans: ['starter', 'professional', 'business'],
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
  gmail_integration: {
    key: 'gmail_integration',
    name: 'Gmail-integration',
    plans: ['starter', 'professional', 'business'],
  },
  ai_project_manager: {
    key: 'ai_project_manager',
    name: 'AI Projektledare',
    plans: ['professional', 'business'],
  },
  ai_quote_generator: {
    key: 'ai_quote_generator',
    name: 'AI-offertgenerering',
    plans: ['starter', 'professional', 'business'],
    limit: { starter: 10, professional: 50, business: null },
  },
  deal_autopilot: {
    key: 'deal_autopilot',
    name: 'Deal-to-Delivery Autopilot',
    plans: ['professional', 'business'],
  },
  agent_memory: {
    key: 'agent_memory',
    name: 'AI-minne (agenten lär sig)',
    plans: ['professional', 'business'],
  },
  agent_team: {
    key: 'agent_team',
    name: 'Hela backoffice-teamet',
    plans: ['professional', 'business'],
  },

  // === BUSINESS ONLY ===
  storefront_custom_domain: {
    key: 'storefront_custom_domain',
    name: 'Egen domän',
    plans: ['business'],
  },
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
  leads_addon_included: {
    key: 'leads_addon_included',
    name: 'Leads-addon inkluderat',
    plans: ['business'],
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function hasFeature(plan: PlanType, featureKey: string): boolean {
  const gate = FEATURE_GATES[featureKey]
  // Fail-closed (L1, 2026-08): en okänd/felstavad nyckel nekade tidigare
  // ALDRIG åtkomst (fail-open) — en bortglömd gate-post öppnade tyst en
  // betalfunktion för alla planer. Varje callsite är grep-verifierad mot
  // FEATURE_GATES (se tasks/todo.md, L1) innan detta byttes.
  if (!gate) return false
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

export const PLAN_PRICES_SEK: Record<PlanType, number> = {
  starter: 2495,
  professional: 5995,
  business: 11995,
}

export function getPlanPrice(plan: PlanType): number {
  return PLAN_PRICES_SEK[plan]
}

// ---------------------------------------------------------------------------
// Årsavtal — permanent årsplan (Andreas-beslut 2026-08-19)
//
// "Betala för 10 månader, få 12" — 2 månader på köpet vid årsbetalning.
// Gäller ENDAST professional (Firman) och business (Storfirman) — starter
// (Bas) säljs inte publikt och får inget årspris (null).
//
// Beloppen är egna sanningskällor (INTE getPlanPrice(plan) * 10 räknat i
// runtime) — de råkar idag stämma exakt med månadspris×10 (5995×10=59950,
// 11995×10=119950) eftersom det ÄR precis vad "betala för 10, få 12"
// betyder, men hårdkodas ändå separat så att en framtida ändring av
// månadspriset (getPlanPrice) aldrig tyst rubbar det redan kommunicerade
// årspriset — ett nytt årspris kräver ett eget Andreas-beslut.
// ---------------------------------------------------------------------------

export const YEARLY_MONTHS_FREE = 2

export function getPlanYearlyPrice(plan: PlanType): number | null {
  const prices: Partial<Record<PlanType, number>> = {
    professional: 59950,
    business: 119950,
  }
  return prices[plan] ?? null
}

export function getPlanLabel(plan: PlanType): string {
  // Svenska visningsnamn (Andreas-beslut 2026-07-31): interna nycklar
  // (starter/professional/business) och Stripe-objekt byts ALDRIG — endast
  // det kunden ser. 'Bas' = legacy-visning för befintliga starter-konton.
  const labels: Record<PlanType, string> = {
    starter: 'Bas',
    professional: 'Firman',
    business: 'Storfirman',
  }
  return labels[plan]
}

export interface PlanCommercialFacts {
  id: PlanType
  label: string
  monthlyPriceSek: number
  yearlyPriceSek: number | null
  smsPerMonth: number
  smsHardCap: number
  callsPerMonth: number | null
  users: number | null
}

/**
 * Den kanoniska, kodnära prissanningen. Kundytor får formulera fördelar
 * olika, men får inte bära egna siffror för pris, användare, SMS eller
 * samtal.
 */
export function getPlanCommercialFacts(plan: PlanType): PlanCommercialFacts {
  return {
    id: plan,
    label: getPlanLabel(plan),
    monthlyPriceSek: getPlanPrice(plan),
    yearlyPriceSek: getPlanYearlyPrice(plan),
    smsPerMonth: getSmsQuota(plan).monthlyQuota,
    smsHardCap: getSmsQuota(plan).hardCap,
    callsPerMonth: getCallLimit(plan),
    users: getUserLimit(plan),
  }
}
