import type { GtmAccountInput } from './types'

export interface FitResult {
  score: number
  reasons: string[]
}

// Exporterad (pass 1b, tasks/plan-launch-desk-signaler.md) så att
// lib/launch-desk/signaler.ts kan återanvända EXAKT samma bransch-ordlista
// för tjänstesignalen istället för att duplicera den.
export const TRADE_TERMS = [
  'bygg', 'snicker', 'elektr', 'vvs', 'rör', 'måleri', 'målare', 'tak',
  'ventilation', 'markarbete', 'golv', 'kakel', 'plattsätt', 'anlägg', 'renover',
]

function employeePoints(band: string | null | undefined): number {
  if (!band) return 0
  const numbers = band.match(/\d+/g)?.map(Number) || []
  const upper = numbers.length > 1 ? numbers[1] : numbers[0]
  if (!upper) return 0
  if (upper >= 2 && upper <= 49) return 25
  if (upper === 1) return 12
  if (upper >= 50 && upper <= 99) return 15
  return 5
}

export function calculateFit(input: GtmAccountInput): FitResult {
  let score = 0
  const reasons: string[] = []
  const industry = `${input.industry || ''} ${input.sni_code || ''}`.toLowerCase()

  if (TRADE_TERMS.some(term => industry.includes(term))) {
    score += 30
    reasons.push('Relevant hantverksbransch')
  }

  const employeeScore = employeePoints(input.employee_band)
  if (employeeScore > 0) {
    score += employeeScore
    reasons.push('Teamstorlek passar Handymates kärnkund')
  }

  if (input.turnover_band) {
    score += 10
    reasons.push('Omsättningsunderlag finns')
  }

  if (input.website) {
    score += 10
    reasons.push('Egen webbplats')
  }

  if (input.company_phone || input.primary_contact_phone) {
    score += 8
    reasons.push('Verifierbar telefonkontakt')
  }

  if (input.company_email || input.primary_contact_email) {
    score += 7
    reasons.push('Verifierbar e-postkontakt')
  }

  if (input.contact_basis === 'warm_intro' || input.contact_basis === 'customer_referral') {
    score += 15
    reasons.push('Varm introduktion eller kundreferens')
  }

  if (/scb|bolagsverket|allabolagets? egna uppgifter/i.test(input.source_name || '')) {
    score += 10
    reasons.push('Officiell eller förstahandskälla')
  }

  return { score: Math.min(100, score), reasons }
}

export function priorityScore(input: {
  fitScore: number
  nextActionAt?: string | null
  status: string
  now?: Date
}): number {
  if (input.status === 'suppressed' || input.status === 'won' || input.status === 'lost') return -1
  const now = input.now ?? new Date()
  let priority = input.fitScore
  if (input.nextActionAt) {
    const due = new Date(input.nextActionAt).getTime()
    if (!Number.isNaN(due) && due <= now.getTime()) priority += 30
  }
  if (input.status === 'replied') priority += 25
  if (input.status === 'meeting_booked' || input.status === 'demo_booked') priority += 20
  return priority
}
