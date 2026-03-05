export interface OnboardingData {
  business_id: string
  business_name: string
  display_name: string
  contact_name: string
  contact_email: string
  phone_number: string
  branch: string
  service_area: string
  org_number: string
  address: string
  services_offered: string[]
  default_hourly_rate: number
  callout_fee: number
  rot_enabled: boolean
  rut_enabled: boolean
  assigned_phone_number: string | null
  forward_phone_number: string | null
  call_mode: string | null
  phone_setup_type: string | null
  lead_sources: string[]
  lead_email_address: string | null
  knowledge_base: Record<string, unknown> | null
  onboarding_step: number
  onboarding_data: Record<string, unknown>
  onboarding_completed_at: string | null
  working_hours: WorkingHours | null
  industry: string | null
  google_connected: boolean
  gmail_enabled: boolean
}

export interface WorkingHours {
  [key: string]: {
    active: boolean
    start: string
    end: string
  }
}

export type CallMode = 'human_first' | 'ai_always' | 'ai_after_hours'
export type PhoneSetupType = 'keep_existing' | 'new_number' | null

export interface StepProps {
  data: OnboardingData
  onNext: () => void
  onBack?: () => void
  onUpdate: (updates: Partial<OnboardingData>) => void
  saving: boolean
}

// Used during step 1 when no OnboardingData exists yet (pre-registration)
export interface SignupFormData {
  business_name: string
  display_name: string
  contact_name: string
  email: string
  phone: string
  branch: string
  service_area: string
  password: string
  password_confirm: string
}
