/**
 * Smart Dispatch — matchar rätt tekniker till rätt jobb.
 * Kompetens + tillgänglighet + plats → approval-förslag.
 */

import { getServerSupabase } from '@/lib/supabase'

interface TeamMember {
  id: string
  name: string
  skills: string[]
  is_active: boolean
}

interface DispatchResult {
  suggested: boolean
  member?: TeamMember
  reasons?: string[]
  approval_id?: string
}

/**
 * Normalisera jobbtyp till skill-nyckel.
 */
function normalizeJobType(input: string): string[] {
  const lower = (input || '').toLowerCase()
  const matches: string[] = []
  if (lower.includes('el') || lower.includes('elektr')) matches.push('el')
  if (lower.includes('vvs') || lower.includes('rör') || lower.includes('vatten')) matches.push('vvs')
  if (lower.includes('bygg') || lower.includes('snickar') || lower.includes('renovera')) matches.push('bygg')
  if (lower.includes('mål') || lower.includes('tapet')) matches.push('måleri')
  if (lower.includes('tak') || lower.includes('plåt')) matches.push('tak')
  if (lower.includes('mark') || lower.includes('trädgård') || lower.includes('gräv')) matches.push('mark')
  if (lower.includes('golv') || lower.includes('kakel') || lower.includes('klinker')) matches.push('golv')
  if (matches.length === 0) matches.push('allman')
  return matches
}

/**
 * Enkel adress-matchning — kollar om samma stadsdel/postnummer.
 * Returnerar 0-1 poäng.
 */
function addressProximity(addr1: string | null, addr2: string | null): number {
  if (!addr1 || !addr2) return 0

  // Extrahera postnummer (5 siffror)
  const zip1 = addr1.match(/\d{3}\s?\d{2}/)?.[0]?.replace(/\s/g, '')
  const zip2 = addr2.match(/\d{3}\s?\d{2}/)?.[0]?.replace(/\s/g, '')
  if (zip1 && zip2) {
    if (zip1 === zip2) return 1.0
    if (zip1.slice(0, 3) === zip2.slice(0, 3)) return 0.7
    if (zip1.slice(0, 2) === zip2.slice(0, 2)) return 0.4
  }

  // Fallback: simpel ordmatchning
  const words1 = addr1.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3)
  const words2 = addr2.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3)
  const shared = words1.filter(w => words2.includes(w)).length
  return Math.min(shared * 0.3, 0.8)
}

/**
 * Försök matcha en tekniker till ett jobb.
 * Skapar approval om bra match finns.
 */
export async function suggestDispatch(params: {
  businessId: string
  jobTitle: string
  jobAddress?: string | null
  scheduledStart: string
  scheduledEnd?: string | null
  jobType?: string // "el", "vvs", "bygg", etc. — eller fritext
  contextType: 'booking' | 'work_order'
  contextId: string
  customerName?: string | null
}): Promise<DispatchResult> {
  const supabase = getServerSupabase()

  // 1. Hämta aktiva teammedlemmar med skills
  const { data: members } = await supabase
    .from('business_users')
    .select('id, name, skills, is_active')
    .eq('business_id', params.businessId)
    .eq('is_active', true)

  if (!members || members.length === 0) {
    return { suggested: false }
  }

  const jobSkills = normalizeJobType(params.jobType || params.jobTitle)
  const jobStart = new Date(params.scheduledStart)
  const jobEnd = params.scheduledEnd ? new Date(params.scheduledEnd) : new Date(jobStart.getTime() + 2 * 3600000)

  // 2. Poängsätt varje teammedlem
  const scored: Array<{
    member: TeamMember
    score: number
    reasons: string[]
  }> = []

  for (const m of members) {
    const memberSkills: string[] = Array.isArray(m.skills) ? m.skills : []
    let score = 0
    const reasons: string[] = []

    // Kompetens-match
    const skillMatch = jobSkills.some(js => memberSkills.includes(js))
    if (skillMatch) {
      score += 3
      reasons.push('Rätt kompetens')
    } else if (memberSkills.length === 0) {
      // Ingen skill satt = generalist, lägre poäng
      score += 1
      reasons.push('Generalist')
    }

    // Tillgänglighet — kolla att ingen bokning krockar
    const dayStr = jobStart.toISOString().split('T')[0]
    const { data: existingBookings } = await supabase
      .from('booking')
      .select('scheduled_start, scheduled_end, notes')
      .eq('business_id', params.businessId)
      .eq('assigned_user_id', m.id)
      .gte('scheduled_start', `${dayStr}T00:00:00`)
      .lte('scheduled_start', `${dayStr}T23:59:59`)

    const hasConflict = (existingBookings || []).some((b: any) => {
      const bStart = new Date(b.scheduled_start)
      const bEnd = b.scheduled_end ? new Date(b.scheduled_end) : new Date(bStart.getTime() + 3600000)
      return bStart < jobEnd && bEnd > jobStart
    })

    if (hasConflict) {
      continue // Skippa — inte ledig
    }

    score += 2
    reasons.push('Ledig')

    // Plats-optimering — kolla dagens övriga bokningar
    if (params.jobAddress && existingBookings && existingBookings.length > 0) {
      let bestProximity = 0
      for (const b of existingBookings) {
        const bookingAddr = (b.notes || '').match(/adress[:\s]+(.+)/i)?.[1] || b.notes
        const prox = addressProximity(params.jobAddress, bookingAddr)
        if (prox > bestProximity) bestProximity = prox
      }
      if (bestProximity > 0.5) {
        score += 2
        reasons.push('Närmast platsen')
      } else if (bestProximity > 0) {
        score += 1
        reasons.push('Samma område')
      }
    } else if (!existingBookings || existingBookings.length === 0) {
      // Inga andra bokningar = helt ledig dag
      score += 1
      reasons.push('Tom dag')
    }

    scored.push({ member: { ...m, skills: memberSkills }, score, reasons })
  }

  if (scored.length === 0) {
    return { suggested: false }
  }

  // 3. Välj bästa match
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]

  // Kräv minst poäng 3 (kompetens + ledig eller liknande)
  if (best.score < 3) {
    return { suggested: false }
  }

  // 4. Skapa approval
  const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

  await supabase.from('pending_approvals').insert({
    id: approvalId,
    business_id: params.businessId,
    approval_type: 'dispatch_suggestion',
    title: `Tilldela ${best.member.name} → ${params.jobTitle}`,
    description: `${best.reasons.join(' · ')}${params.customerName ? ` · ${params.customerName}` : ''}`,
    risk_level: 'low',
    status: 'pending',
    payload: {
      member_id: best.member.id,
      member_name: best.member.name,
      context_type: params.contextType,
      context_id: params.contextId,
      job_title: params.jobTitle,
      job_address: params.jobAddress,
      scheduled_start: params.scheduledStart,
      scheduled_end: params.scheduledEnd,
      reasons: best.reasons,
      score: best.score,
      alternatives: scored.slice(1, 3).map(s => ({
        name: s.member.name,
        score: s.score,
        reasons: s.reasons,
      })),
    },
    expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  })

  return {
    suggested: true,
    member: best.member,
    reasons: best.reasons,
    approval_id: approvalId,
  }
}
