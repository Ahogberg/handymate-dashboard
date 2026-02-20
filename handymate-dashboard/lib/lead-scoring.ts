export interface LeadScoreFactors {
  budget_match: number       // 0-25
  area_match: number         // 0-20
  job_type_match: number     // 0-20
  timing_score: number       // 0-15
  detail_score: number       // 0-10
  source_quality: number     // 0-10
}

export interface LeadScoreResult {
  score: number
  temperature: 'hot' | 'warm' | 'cold'
  factors: LeadScoreFactors
  reasoning: string
  suggested_action: string
  estimated_value: number | null
}

export function calculateLeadScore(factors: LeadScoreFactors): {
  score: number
  temperature: 'hot' | 'warm' | 'cold'
} {
  const score = Math.min(100, Math.max(0,
    factors.budget_match +
    factors.area_match +
    factors.job_type_match +
    factors.timing_score +
    factors.detail_score +
    factors.source_quality
  ))
  const temperature = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold'
  return { score, temperature }
}

export function getTemperatureLabel(temp: string): string {
  switch (temp) {
    case 'hot': return 'Het'
    case 'warm': return 'Varm'
    case 'cold': return 'Kall'
    default: return temp
  }
}

export function getTemperatureColor(temp: string): string {
  switch (temp) {
    case 'hot': return '#ef4444'
    case 'warm': return '#f59e0b'
    case 'cold': return '#3b82f6'
    default: return '#6b7280'
  }
}

export const SCORE_FACTOR_LABELS: Record<keyof LeadScoreFactors, { label: string; max: number }> = {
  budget_match: { label: 'Budget', max: 25 },
  area_match: { label: 'Område', max: 20 },
  job_type_match: { label: 'Jobbtyp', max: 20 },
  timing_score: { label: 'Timing', max: 15 },
  detail_score: { label: 'Detalj', max: 10 },
  source_quality: { label: 'Källa', max: 10 },
}

export const LOSS_REASONS = [
  { value: 'slow_response', label: 'För långsam respons' },
  { value: 'price_too_high', label: 'Priset för högt' },
  { value: 'chose_competitor', label: 'Kunden valde konkurrent' },
  { value: 'project_cancelled', label: 'Kunden avbröt projektet' },
  { value: 'outside_area', label: 'Utanför serviceområde' },
  { value: 'wrong_competence', label: 'Inte rätt kompetens' },
  { value: 'bad_timing', label: 'Dålig timing' },
  { value: 'other', label: 'Övrigt' },
]
