// Pipeline-vyns delade typer.
// Ägs av app/dashboard/pipeline/page.tsx (orchestrator) och delas till
// alla komponenter under app/dashboard/pipeline/components/.

export interface Stage {
  id: string
  name: string
  slug: string
  color: string
  sort_order: number
  is_system: boolean
  is_won: boolean
  is_lost: boolean
}

export interface DealProjectSummary {
  id: string
  name: string
  status: string
  start_date: string | null
  end_date: string | null
  progress_percent: number
  budget_sek: number | null
  spent_sek: number
}

export interface Deal {
  id: string
  deal_number: number | null
  title: string
  description: string | null
  value: number | null
  stage_id: string
  priority: string
  customer_id: string | null
  quote_id: string | null
  invoice_id: string | null
  source: string | null
  source_call_id: string | null
  lead_source_platform: string | null
  lead_temperature: string | null
  lead_score: number | null
  lead_score_factors: Record<string, number> | null
  lead_reasoning: string | null
  suggested_action: string | null
  estimated_value: number | null
  first_response_at: string | null
  response_time_seconds: number | null
  loss_reason: string | null
  loss_reason_detail: string | null
  assigned_to: string | null
  category: string | null
  created_at: string
  updated_at: string
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string
    address_line: string | null
    customer_type?: string
    org_number?: string
    contact_person?: string
    personal_number?: string
    customer_number?: string
  } | null
  project?: DealProjectSummary | null
}

export interface CustomerDocument {
  id: string
  file_name: string
  file_url: string
  file_type: string | null
  file_size: number | null
  category: string
  uploaded_at: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  due_time: string | null
  customer_id: string | null
  deal_id: string | null
  project_id: string | null
  assigned_to: string | null
  assigned_user: { id: string; name: string; color: string } | null
  completed_at: string | null
  created_by: string | null
  created_at: string
}

export interface TaskActivity {
  id: string
  task_id: string
  actor: string | null
  action: string
  description: string
  old_value: string | null
  new_value: string | null
  created_at: string
}

export interface TeamMember {
  id: string
  name: string
  color: string
  role: string
  specialties?: string[]
}

export interface DealNote {
  id: string
  deal_id: string
  content: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CustomerTag {
  name: string
  color: string
}

export interface Activity {
  id: string
  deal_id: string
  activity_type: string
  description: string | null
  from_stage_name?: string
  to_stage_name?: string
  triggered_by: string
  ai_confidence: number | null
  ai_reason: string | null
  undone_at: string | null
  created_at: string
  deal_title?: string
}

export interface PipelineStats {
  totalDeals: number
  totalValue: number
  wonValue: number
  newLeadsToday: number
  needsFollowUp: number
}

export interface Toast {
  show: boolean
  message: string
  type: 'success' | 'error' | 'info'
}

export interface CustomerOption {
  customer_id: string
  name: string
  phone_number: string
  email: string | null
}
