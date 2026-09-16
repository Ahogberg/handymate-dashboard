import { safeUrl, text } from './domain'

export type Qualification = {
  swedish_trade: boolean
  confirmed_pain: boolean
  confirmed_growth: boolean
  warm_relationship: boolean
  confirmed_budget: boolean
  evidence: string
  source_url: string | null
  observed_at: string
}

/** Seller-attested evidence, never provider guesses or client-supplied scores. */
export function qualification(input: Record<string, unknown>) {
  const employees = input.employee_count === '' || input.employee_count == null
    ? null : Number(input.employee_count)
  if (employees !== null && (!Number.isInteger(employees) || employees < 0 || employees > 100000))
    throw new Error('Ange ett giltigt antal anställda.')
  const evidence = text(input.evidence, 4000)
  if (!evidence) throw new Error('Beskriv källan och vad som faktiskt har bekräftats.')
  const observed = new Date(String(input.observed_at || ''))
  if (!Number.isFinite(observed.getTime()) || observed.getTime() > Date.now())
    throw new Error('Ange när uppgifterna bekräftades, senast i dag.')
  const facts: Qualification = {
    swedish_trade: input.swedish_trade === true,
    confirmed_pain: input.confirmed_pain === true,
    confirmed_growth: input.confirmed_growth === true,
    warm_relationship: input.warm_relationship === true,
    confirmed_budget: input.confirmed_budget === true,
    evidence, source_url: safeUrl(input.source_url), observed_at: observed.toISOString(),
  }
  return { qualification: facts, employee_count: employees, website: safeUrl(input.website),
    industry: text(input.industry, 200), city: text(input.city, 200) }
}

export type SalesSequence = {
  id: string
  status: 'active' | 'stopped' | 'completed'
  step: number
  due_at: string
  contact_id: string
  body: string
  approved_at: string | null
  stop_reason: string | null
}
export const SEQUENCE_STEPS = ['Ring och undersök behovet', 'Följ upp med ett kort mejl', 'Ring en sista gång']
